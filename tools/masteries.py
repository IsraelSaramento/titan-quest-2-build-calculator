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


def build(m):
    tiers = parse(m)
    T = mn.text()
    gams = []
    for t in tiers:
        gams += t['mods']
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
            ids = {strip_c(a), strip_c(main)}
            my = [mods[g] for g in gams if any(x.split('.')[-1] in ids for x in mods[g].get('abilityTag', []))]
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
