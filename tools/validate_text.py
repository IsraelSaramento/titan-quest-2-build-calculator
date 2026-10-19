"""Confere se os números dos textos gerados (render.py) aparecem nos textos da ferramenta (Warfare/Earth como gabarito)."""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render as R, mastery_names as mn
from compare_atlas import atlas_skills, norm
T = mn.text()
D = json.load(open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'src', 'masteries_data.json'), encoding='utf-8'))
nums = lambda t: {float(x) for x in re.findall(r'\d+(?:\.\d+)?', t)}
ok = bad = 0
for mk in sys.argv[1:] or ['warfare', 'earth']:
    A = atlas_skills(mk)
    for sk in D[mk]:
        a = A.get((sk['n'] or '').lower())
        if sk['k'] != 'active' or not a:
            continue
        am = {norm(n): d for n, x, c, d in re.findall(r'\["([^"]+)", (\d+), (\d+), "([^"]*)"', a[2])}
        for md in sk['mods']:
            d = am.get(norm(md['nameText']))
            if d is None:
                continue
            g = R.render(T.get(md.get('desc', ''), ''), R.Ctx(md['cls'], 1, [sk['main']]))
            miss = nums(g) - nums(d) - {0.0, 1.0}
            if miss or '?' in g:
                bad += 1
                print('X', mk, sk['n'], '·', md['nameText'], '\n    jogo:', g.replace('\n', ' / '), '\n    ferr:', d)
            else:
                ok += 1
print('ok', ok, 'diferentes', bad)
