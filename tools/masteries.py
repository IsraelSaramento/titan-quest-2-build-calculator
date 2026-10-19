"""Extrai de cada mastery (da_mastery_*) as ativas, passivas, feats e modifiers, com os números dos arquivos do jogo.

Uso: python tools/masteries.py [mastery ...]  -> grava src/masteries_data.json
"""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mastery_def import parse
import mastery_names as mn
import gam

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ALL = ['warfare', 'earth', 'rogue', 'storm', 'forge', 'spirit']


def strip_c(c):
    return c[:-2] if c.endswith('_C') else c


DEFAULTS = os.path.join(mn.EX, 'mjson/TQ2/Saved/JsonDataCache/Game/TQ2/masteries/da_mastery_defaultabilities.uasset')
_generic = None


def generic():
    """Modifiers genéricos (compartilhados), liberados por etiquetas ModifierAccess/AbilityFlag da skill."""
    global _generic
    if _generic is None:
        from namemap import names
        _generic = sorted({n for n in names(DEFAULTS) if n.startswith('bp_gam_') and n.endswith('_C')})
    return _generic


def access(cls):
    from namemap import names
    f = mn.asset(cls)
    if not f:
        return set()
    return {n for n in mn.uasset_tokens(cls) if '.ModifierAccess.' in n or '.AbilityFlag.' in n}


PREFIX = {'warfare': 'wf', 'earth': 'ea', 'rogue': 'rg', 'storm': 'st', 'forge': 'fo', 'spirit': 'sp'}


def all_player_gams(m):
    """Todos os modifiers próprios da mastery (bp_gam_player_<sigla>_*)."""
    mn.asset('x')
    pre = 'bp_gam_player_%s_' % PREFIX[m]
    return [k + '_C' for k in mn._files if k.startswith(pre.lower())]


def core(x):
    x = strip_c(x).lower()
    x = re.sub(r'^bp_(selector|bga)_player_', '', x)
    while True:
        y = re.sub(r'_(activate|p|melee|ranged)$', '', x)
        if y == x:
            return x
        x = y


def build(m):
    tiers = parse(m)
    T = mn.text()
    gams = []
    for t in tiers:
        gams += t['mods']
    own = set(gams)
    gams = sorted(own) + [g for g in generic() if g not in own]
    mods = {}
    for g in gams:
        try:
            r = gam.modifier(g)
        except Exception as e:  # noqa
            r = {'error': str(e)}
        r['cls'] = g
        r['nameText'] = T.get(r.get('name', ''), '').replace("\'", "'")
        mods[g] = r
    out = []
    for ti, t in enumerate(tiers):
        for a, wip in t['actives']:
            main = mn.main_ability(a)
            k, nm = mn.display(a)
            ids = {core(a), core(main)}
            acc = access(a) | access(main)
            my = []
            for g in gams:
                md = mods[g]
                at = md.get('abilityTag', [])
                if 'WIP' in ' '.join(md.get('variantOf') or []):
                    continue
                if g in own and any(core(x.split('.')[-1]) in ids for x in at):
                    my.append(md)
                elif at and all(x in acc for x in at):
                    my.append(md)
            out.append({'k': 'active', 'tier': ti, 'cls': a, 'main': main, 'key': k, 'n': nm, 'wip': bool(wip), 'mods': my})
        for p in t['passives']:
            k, nm = mn.display(p['passive'])
            feats = []
            for f in p.get('feats', []):
                fk, fn = mn.display(f['eff'])
                feats.append({'cls': f['eff'], 'key': fk, 'n': fn, 'summons': f.get('app') == 2})
            out.append({'k': 'passive', 'tier': ti, 'cls': p['passive'], 'key': k, 'n': nm, 'wip': bool(p.get('p0n')),
                        'max': p.get('p7') or 10, 'feats': feats})
    return out


if __name__ == '__main__':
    ms = sys.argv[1:] or ALL
    data = {m: build(m) for m in ms}
    dst = os.path.join(ROOT, 'src', 'masteries_data.json')
    json.dump(data, open(dst, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('ok', dst, {m: len(v) for m, v in data.items()})
