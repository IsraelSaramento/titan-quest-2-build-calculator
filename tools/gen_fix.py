"""Gera src/masteries_fix.js: completa e corrige os dados de masteries da ferramenta com os arquivos do jogo.

- Passivas: nível máximo (mx), níveis em que os feats liberam (u = metade/máximo) e feats que faltam.
- Modifiers: rank máximo e custo de capacity de todos; modifiers que faltam (texto do jogo no rank 1).
- Skills que faltam (ex.: ativas e passivas de Spirit): geradas por inteiro a partir dos arquivos.
Uso: python tools/masteries.py && python tools/gen_fix.py
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mastery_names as mn  # noqa: E402
import render as R  # noqa: E402
from compare_atlas import atlas_skills, norm  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = json.load(open(os.path.join(ROOT, 'src', 'masteries_data.json'), encoding='utf-8'))
T = mn.text()
TIER_PTS = [0, 6, 16, 30, 48]
FLAG = [('MainSkill', 'Main'), ('WeaponAttack.Melee', 'Weapon Attack'), ('WeaponAttack.Ranged', 'Ranged Attack'),
        ('Spell', 'Spell'), ('Projectile', 'Projectile'), ('Area', 'Area'), ('Channel', 'Channel'), ('Overwhelm', 'Overwhelm'),
        ('Exhaust', 'Exhaust'), ('Sustained', 'Sustained'), ('Aura', 'Aura'), ('Blessing', 'Blessing'), ('Movement', 'Movement'),
        ('Teleport', 'Teleport'), ('Summon.Lesser', 'Summon'), ('Summon.Greater', 'Summon'), ('Device', 'Device'),
        ('Execution', 'Execution'), ('Infusion', 'Infusion'), ('Disruption', 'Disruption')]


def one_line(t):
    return '; '.join(x.strip() for x in t.split('\n') if x.strip())


def mod_entry(md, main, names):
    ctx = R.Ctx(md['cls'], 1, [main])
    d = one_line(R.render(T.get(md.get('desc', ''), ''), ctx))
    if md['max'] > 1:
        d += ' (rank 1)'
    req = [names.get(x.split('.')[-1] + '_C') for x in md.get('requires', [])]
    inc = [names.get(x.split('.')[-1] + '_C') for x in md.get('incompatible', [])]
    if any(req):
        d += '. Requires ' + ' and '.join(x for x in req if x)
    if any(inc):
        d += '. Incompatible with ' + ', '.join(x for x in inc if x)
    return [md['nameText'], md['max'], md['cost'], d]


def tags_of(sk):
    toks = set(mn.uasset_tokens(sk['main']) + mn.uasset_tokens(sk['cls']))
    flags = {t[len('GrimAbilitySystem.Ability.AbilityFlag.'):] for t in toks if t.startswith('GrimAbilitySystem.Ability.AbilityFlag.')}
    out = []
    for f, n in FLAG:
        if f in flags and n not in out:
            out.append(n)
    return ' · '.join(out) or 'Active'


def stats_of(sk):
    b = R.Ctx(sk['main'], 1)
    st = []
    cost = None
    for k in ('MPCost', 'MPCostBase', 'BaseCost', 'BaseCostMP', 'RequiredMP'):
        v = b.get(k)
        if v is not None:
            cost = v
            break
    tick = b.get('MPCostTickBase') or b.get('TickCost')
    res = b.get('MPReservation') or b.get('ReservedMP')
    parts = []
    if res:
        parts.append('%d Energy reserved' % round(res))
    if cost:
        parts.append('%d Energy' % round(cost))
    if tick:
        parts.append('%g Energy/s' % round(tick, 1))
    st.append(['Custo', ', '.join(parts) or 'Sem custo'])
    for k in ('BaseCD', 'CD', 'CooldownBase', 'Cooldown'):
        v = b.get(k)
        if v:
            st.append(['Cooldown', '%gs' % round(v, 2)])
            break
    return st


def passive_lv(sk):
    """Linhas por nível: [modelo com {v}, valor no nível 1, aumento por nível] e linhas fixas."""
    tpl = T.get(sk['key'] + '_1Description', '')
    tpl = re.split(r'<b_gold>Level \{NextLevel\}', tpl)[0]
    a = R.render(tpl, R.Ctx(sk['cls'], 1)).split('\n')
    b = R.render(tpl, R.Ctx(sk['cls'], 2)).split('\n')
    lv, x = [], []
    for la, lb in zip(a, b):
        la, lb = la.strip(), lb.strip()
        if not la or la.startswith('Level '):
            continue
        na = list(re.finditer(r'-?\d+(?:\.\d+)?', la))
        nb = list(re.finditer(r'-?\d+(?:\.\d+)?', lb))
        diff = [i for i, (p, q) in enumerate(zip(na, nb)) if p.group(0) != q.group(0)]
        if len(na) == len(nb) and diff:
            i = diff[0]
            v1, v2 = float(na[i].group(0)), float(nb[i].group(0))
            t = la[:na[i].start()] + '{v}' + la[na[i].end():]
            lv.append([t, round(v1, 2), round(v2 - v1, 2)])
        else:
            x.append(la)
    return lv, x


def feat_entry(f):
    d = one_line(R.render(T.get((f['key'] or '') + '_1Description', ''), R.Ctx(f['cls'], 1)))
    if f.get('summons') and 'ummon' not in d:
        d = 'Summons: ' + d
    return [f['n'], d]


def js(v):
    return json.dumps(v, ensure_ascii=False)


def main():
    fix = {'passive': {}, 'mods': {}, 'addMods': {}, 'addFeats': {}, 'add': {}}
    for mk, skills in D.items():
        A = atlas_skills(mk)
        names = {}
        for sk in skills:
            for md in sk.get('mods', []):
                names[md['cls']] = md['nameText']
        for sk in skills:
            if sk['wip'] or not sk['n']:
                continue
            a = A.get(sk['n'].lower())
            key = mk + '|' + (a and next((n for n in [sk['n']] if n), sk['n']) or sk['n'])
            if sk['k'] == 'passive':
                mx = sk['max']
                entry = {'mx': mx, 'u': '%d/%d' % (mx // 2, mx)}
                feats = [feat_entry(f) for f in sk['feats']]
                if a:
                    have = {norm(n) for n, _ in re.findall(r'\["([^"]+)", "([^"]*)"\]', a[2])}
                    miss = [f for f in feats if norm(f[0]) not in have]
                    if miss:
                        fix['addFeats'][key] = miss
                    fix['passive'][key] = entry
                else:
                    lv, x = passive_lv(sk)
                    fix['add'].setdefault(mk, []).append({'k': 'passive', 'n': sk['n'], 't': TIER_PTS[sk['tier']], 'lv': lv, 'x': x,
                                                          'feats': feats, 'u': entry['u'], 'mx': mx})
            else:
                gm = {md['nameText']: md for md in sk['mods'] if md.get('nameText')}
                if a:
                    am = {norm(n): n for n, x_, c, d in re.findall(r'\["([^"]+)", (\d+), (\d+), "([^"]*)"', a[2])}
                    fix['mods'][key] = {am[norm(n)]: [md['max'], md['cost']] for n, md in gm.items() if norm(n) in am}
                    miss = [mod_entry(md, sk['main'], names) for n, md in gm.items() if norm(n) not in am]
                    if miss:
                        fix['addMods'][key] = miss
                else:
                    desc = one_line(R.render(T.get(sk['key'] + '_1Description', ''), R.Ctx(sk['main'], 1)))
                    fix['add'].setdefault(mk, []).append({'k': 'active', 'n': sk['n'], 't': TIER_PTS[sk['tier']], 'tags': tags_of(sk),
                                                          'stats': stats_of(sk), 'desc': desc,
                                                          'mods': [mod_entry(md, sk['main'], names) for md in gm.values()]})
    out = os.path.join(ROOT, 'src', 'masteries_fix.js')
    with open(out, 'w', encoding='utf-8') as fh:
        fh.write('// Gerado por tools/gen_fix.py a partir dos arquivos do jogo (da_mastery_*, modifiers, passivas e feats).\n')
        fh.write('window.TQ2_FIX=' + js(fix) + ';\n')
        fh.write(APPLY)
    n = {k: (sum(len(v) for v in fix[k].values()) if isinstance(fix[k], dict) else 0) for k in fix}
    print('ok', out, n)


APPLY = r"""
(function () {
  const F = window.TQ2_FIX, ms = (window.TQ2 && TQ2.masteries) || [];
  ms.forEach(m => {
    const by = {}; m.skills.forEach(s => { by[m.key + '|' + s.n] = s; });
    Object.entries(F.passive).forEach(([k, v]) => { const s = by[k]; if (s && s.k === 'passive') { s.mx = v.mx; s.u = v.u; } });
    Object.entries(F.addFeats).forEach(([k, v]) => { const s = by[k]; if (s && s.k === 'passive') s.feats = s.feats.concat(v); });
    Object.entries(F.mods).forEach(([k, v]) => {
      const s = by[k]; if (!s || s.k !== 'active') return;
      s.mods.forEach(md => { const g = v[md[0]]; if (g) { md[1] = g[0]; md[2] = g[1]; } });
    });
    Object.entries(F.addMods).forEach(([k, v]) => { const s = by[k]; if (s && s.k === 'active') s.mods = s.mods.concat(v); });
    (F.add[m.key] || []).forEach(o => {
      const s = o.k === 'active' ? A(o.n, o.t, o.tags, o.stats, o.desc, o.mods) : P(o.n, o.t, o.lv, o.feats, { u: o.u, mx: o.mx, x: o.x });
      m.skills.push(s);
    });
    if (F.add[m.key]) { delete m.partial; delete m.preview; m.skills.sort((a, b) => a.t - b.t); }
  });
})();
"""

if __name__ == '__main__':
    main()
