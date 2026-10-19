"""Lê os saves de um personagem do TQ2 e gera um JSON compacto da build.

Uso: python build_from_save.py <prefixo do save> <saida.json> <pasta Text do jogo>
Ex.: python build_from_save.py "%LOCALAPPDATA%/TQ2/Saved/SaveGames/Phantomn_2026-10-11--12-00-22" phantomn.json "<jogo>/TQ2/Content/TQ2/Data/Text"
"""
import csv
import glob
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import gvas  # noqa: E402


def data_array(path):
    s = gvas.read_save(path)
    return {e['__key']: e for e in s['props']['m_SerializedSaveGameData']['DataArray']}


def load_texts(text_dir):
    t = {}
    for f in glob.glob(os.path.join(text_dir, '**', '*.csv'), recursive=True):
        with open(f, encoding='utf-8-sig', newline='') as fh:
            for row in csv.reader(fh):
                if len(row) >= 2:
                    t[row[0]] = row[1]
    return t


def short(p):
    if not p or p == 'None':
        return None
    return p.split('/')[-1].split('.')[0]


def affix_text(texts, affix, ge):
    """Texto do tooltip do afixo (chave = nome do afixo sem 'da_'; senão, nome do efeito)."""
    keys = []
    if affix:
        a = affix[3:] if affix.startswith('da_') else affix
        keys += [a + '.TooltipText', a + '.m_Levels.Levels(0).Levels.AffixEffects(0).AffixEffects.TooltipText', a]
    if ge:
        g = ge.replace('bp_test_ge_', '').replace('bp_ge_', '')
        keys += [g + '.TooltipText', g]
    for key in keys:
        if key in texts:
            return texts[key]
    return None


def item(texts, h):
    out = {'item': short(h.get('__item')), 'level': h.get('m_Level'), 'rarity': (h.get('m_Rarity') or '').split('::')[-1]}
    for k in ('m_BaseAttackDamage', 'm_AttackDamageVariance', 'm_AttackSpeedFactor', 'm_BaseArmor'):
        if k in h:
            out[k[2:]] = h[k]
    out['tags'] = [t.split('.', 1)[1] for t in h.get('m_CombinedTags', []) if t.startswith('GrimVentory.')]
    aff = []
    for a in h.get('m_Affixes', []):
        for e in a.get('AffixEffectInstances', []):
            ge = short(e.get('pSoftGameplayEffect'))
            aff.append({'affix': short(a.get('pAffix')), 'ge': ge, 'value': e.get('Scale'),
                        'tier': a.get('Level'), 'cat': (a.get('Category') or '').split('::')[-1],
                        'text': affix_text(texts, short(a.get('pAffix')), ge)})
    out['affixes'] = aff
    socks = []
    for k, v in h.items():
        if 'Socket' in k and isinstance(v, list):
            socks.append(v)
    if socks:
        out['sockets'] = socks
    return out


def main(prefix, out, text_dir):
    texts = load_texts(text_dir)
    pl = data_array(prefix + '_Data_Player.sav')
    lo = data_array(prefix + '_Data_PlayerLocal.sav')
    ps = pl['PlayerState']
    at = pl['TQ2CharacterAttributes']
    ms = lo['Mastery']['m_Masteries']
    build = {
        'name': ps['m_CharacterName'],
        'level': at['m_CharacterLevel'],
        'attributePoints': {k[len('m_AttributePoints'):]: v for k, v in at.items() if k.startswith('m_AttributePoints')},
        'unspentAP': at.get('m_CharacterAP'),
        'masteries': [],
        'equipment': [],
    }
    for m in ms['Masteries']:
        raw = bytes.fromhex(m['pMasteryDescription']['__raw'])
        name = raw[4:].split(b'\0')[0].decode().split('da_mastery_')[-1]
        mm = {'mastery': name, 'points': m['InvestedMasteryPoints'], 'actives': [], 'passives': []}
        for a in m['ActiveAbilities']:
            if a['InvestedPoints']:
                mm['actives'].append({'id': a['AbilityDescriptionTags'][0].split('.')[-1], 'points': a['InvestedPoints'],
                                      'mods': [[short(s['ModifierClass']).removesuffix('_C'), s['Level']] for s in a['ModifierSlots'] if s['ModifierClass'] != 'None']})
        for p in m['PassiveAbilities']:
            if p['InvestedPoints']:
                mm['passives'].append({'id': p['PassiveEffectTags'][0].split('.')[-1], 'points': p['InvestedPoints'],
                                       'feats': [short(f).removesuffix('_C') for f in p['FeatSlots'] if f != 'None']})
        build['masteries'].append(mm)
    for slot, s in ps['m_Equipment']['ItemsBySlot']:
        h = s.get('ItemHandle', {})
        if h.get('__item'):
            it = item(texts, h)
            it['slot'] = slot
            build['equipment'].append(it)
    sus = ms.get('ActiveSustainedAbilities')
    build['sustained'] = sus
    json.dump(build, open(out, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    return build


if __name__ == '__main__':
    b = main(*sys.argv[1:4])
    print(json.dumps(b, indent=1, ensure_ascii=False)[:20000])
