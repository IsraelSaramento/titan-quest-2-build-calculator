"""Compara src/masteries_data.json (arquivos do jogo) com a base da ferramenta (src/atlas_base.html)."""
import json, re, sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
s = open(os.path.join(ROOT, 'src', 'atlas_base.html'), encoding='utf-8').read()
D = json.load(open(os.path.join(ROOT, 'src', 'masteries_data.json'), encoding='utf-8'))


def block(key):
    i = s.find('key: "%s"' % key)
    j = s.find('TQ2.add(', i)
    return s[i:j if j > 0 else len(s)]


def atlas_skills(key):
    b = block(key)
    out = {}
    for m in re.finditer(r'\n    ([AP])\("([^"]+)", (\d+)', b):
        e = b.find('\n    A(', m.end()); e2 = b.find('\n    P(', m.end())
        e = min([x for x in (e, e2, len(b)) if x > 0])
        out[m.group(2).lower()] = (m.group(1), int(m.group(3)), b[m.end():e])
    return out


def norm(x):
    return re.sub(r'[^a-z0-9]', '', (x or '').lower())


ms = sys.argv[1:] or list(D)
for mk in ms:
    A = atlas_skills(mk)
    print('=====', mk)
    for sk in D[mk]:
        if sk['wip']:
            continue
        a = A.get((sk['n'] or '').lower())
        if not a:
            print('  FALTA', sk['k'], sk['n'])
            continue
        body = a[2]
        if sk['k'] == 'active':
            am = {norm(n): (int(x), int(c)) for n, x, c in re.findall(r'\["([^"]+)", (\d+), (\d+), "', body)}
            for md in sk['mods']:
                key = norm(md['nameText'])
                if key not in am:
                    print('  mod falta  ', sk['n'], '·', md['nameText'], md['max'], md['cost'])
                elif am[key] != (md['max'], md['cost']):
                    print('  mod difere ', sk['n'], '·', md['nameText'], 'ferramenta', am[key], 'jogo', (md['max'], md['cost']))
            extra = set(am) - {norm(md['nameText']) for md in sk['mods']}
            for x in extra:
                print('  mod sobra  ', sk['n'], '·', x)
        else:
            fts = [norm(n) for n, _ in re.findall(r'\["([^"]+)", "([^"]*)"\]', body)]
            gf = [norm(f['n']) for f in sk['feats']]
            if sorted(set(fts)) != sorted(set(gf)):
                print('  feats difere', sk['n'], 'ferramenta', len(fts), 'jogo', len(gf), 'faltam', [f['n'] for f in sk['feats'] if norm(f['n']) not in fts])
