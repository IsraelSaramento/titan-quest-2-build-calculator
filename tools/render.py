"""Monta os textos de descrição do jogo com os números calculados das fórmulas (GrimDynamics).

Os textos usam {Variavel}|fmt(...), {data.X}, {DescriptionComponent[Nome]} e {WeaponDamage[X]}.
As variáveis vêm do próprio asset (tabela nome = expressão) e das tabelas da_balancing_* que ele importa.
"""
import math
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dyn  # noqa: E402
import mastery_names as mn  # noqa: E402

IDENT = re.compile(r'^[A-Za-z_][A-Za-z0-9_]*$')
OPS = {'*', '+', '-', '/', '==', '>', '<', '>=', '<=', '(', ')', 'clamp', '_GameplayEffectTag', '_VariableTag'}
LEVEL = 1  # nível de personagem dos números de dano nas descrições (a ferramenta usa nível 1)
_cache = {}


def table(cls):
    """Pares nome -> expressão de um asset."""
    if cls in _cache:
        return _cache[cls]
    f = mn.asset(cls)
    r = {}
    if f:
        d = open(f, 'rb').read()
        fs = dyn.fstrings(d)
        for a, b in zip(fs, fs[1:]):
            # expressão, 24 bytes de cabeçalho, nome (tabelas de balancing e variáveis de GAM/GE)
            if b[0] - a[1] in (24, 26) and IDENT.match(b[2]) and a[2] not in OPS:
                r.setdefault(b[2], a[2].strip())
    _cache[cls] = r
    return r


def balancing(cls):
    """Tabelas da_balancing_* importadas pelo asset (para data.X, dataDmg.X, ...)."""
    out = {}
    for t in mn.uasset_tokens(cls):
        if t.startswith('da_balancing_') and not t.startswith('Default__'):
            out.update(table(t))
    return out


import dynexpr as X  # noqa: E402

BAL = os.path.join(mn.EX, 'data/TQ2/Content/TQ2/Data/Balancing')
NS_FILES = {
    'PlayerDmg': 'da_tq2_player_damage_scaling_internal', 'PlayerDamageScaling': 'da_tq2_player_damage_scaling_table',
    'PlayerDefense': 'da_tq2_player_defense_scaling_internal', 'PlayerDefenseScaling': 'da_tq2_player_defense_scaling_table',
    'PlayerDmgScaling': 'da_tq2_player_skill_damage_scaling', 'Item': 'da_tq2_item_WeaponDamageScaling',
    'WeaponDamageScaling': 'da_tq2_item_WeaponDamageScaling', 'ItemStats': 'da_tq2_item_stats_general',
    'ArmorScaling': 'da_tq2_creature_armor_scaling',
    'SummonDmg': 'da_tq2_summon_damage_scaling_internal', 'SummonDamageScaling': 'da_tq2_summon_damage_scaling_table',
    'SummonDefense': 'da_tq2_summon_defense_scaling_internal', 'SummonDefenseScaling': 'da_tq2_summon_defense_scaling_table',
}
_ns = {}


def ns_table(ns):
    if ns not in _ns:
        f = NS_FILES.get(ns)
        _ns[ns] = table(f) if f else None
    return _ns[ns]


def gcall(ns, fn, args, depth=0):
    """Chama uma função de tabela global (ex.: PlayerDamageScaling.SkillDmgWeak_LevelScalingFactor(1.75))."""
    if ns == 'HealthScaling':
        return 0.0  # só aparece multiplicado por 0 nas tabelas
    t = ns_table(ns)
    if t is None or fn not in t:
        raise KeyError('%s.%s' % (ns, fn))
    e = t[fn]
    loc = {}
    if '_BaseValue' in e:
        loc['_BaseValue'] = args[0] if args else 0.0
        loc['_Level'] = args[1] if len(args) > 1 else 0.0
    else:
        loc['_Level'] = args[0] if args else 0.0

    def name(n):
        if n in loc:
            return loc[n]
        if n in ('Character.Level', 'Owner.Level'):
            return float(LEVEL)
        if n.startswith(('data.', 'HealthScaling.')):
            return 0.0  # termos multiplicados por 0 nas tabelas globais
        if n in t:
            return gval(ns, n, depth + 1)
        if '.' in n:
            a, b2 = n.rsplit('.', 1)
            if ns_table(a) and b2 in ns_table(a):
                return gval(a, b2, depth + 1)
        raise KeyError(n)

    def call(f, a2):
        if '.' in f:
            a, b2 = f.rsplit('.', 1)
            return gcall(a, b2, a2, depth + 1)
        return gcall(ns, f, a2, depth + 1)
    if depth > 30:
        raise RecursionError(fn)
    return X.evaluate(X.parse(e), name, call)


def gval(ns, n, depth=0):
    e = ns_table(ns)[n]
    try:
        return float(e)
    except ValueError:
        return gcall(ns, n, [], depth)


LEVEL_NAMES = ('ModifierLevel', 'CurrentLevel', '_Level', 'Level', 'AbilityLevel')


class Ctx:
    """Avalia as variáveis de um asset num nível (rank do modifier ou nível da passiva)."""

    def __init__(self, cls, level=1, extra=()):
        self.vars = {}
        for c in extra:
            self.vars.update(balancing(c))
            self.vars.update(table(c))
        self.vars.update(balancing(cls))
        self.vars.update(table(cls))
        self.lower = {k.lower(): k for k in self.vars}
        self.level = level
        self.memo = {}

    def name(self, n):
        if n in LEVEL_NAMES:
            return float(self.level)
        if n == 'NextLevel':
            return float(self.level + 1)
        if n == '_BaseValue':
            return 0.0
        if n in ('Character.Level', 'Owner.Level'):
            return float(LEVEL)
        head, _, last = n.rpartition('.')
        if head.split('.')[0] in ('Character', 'Owner', 'Ability', 'Self', 'Summon_Owner', 'Trigger_Owner'):
            return 1.0
        v = self.get(last)
        if v is None:
            raise KeyError(n)
        return v

    def call(self, f, args):
        head, _, fn = f.rpartition('.')
        if fn == 'GetGameplayEffectLevel':
            return float(self.level)
        if fn in ('GetCurrentStacks', 'GetStacks'):
            return 0.0
        if head.split('.')[0] in ('Character', 'Owner', 'Ability', 'Self'):
            return 1.0
        if fn.lower() == 'round':
            return float(round(args[0]))
        return gcall(head, fn, args)

    def get(self, n, depth=0):
        if n in self.memo:
            return self.memo[n]
        e = self.vars.get(n)
        if e is None and n.lower() in self.lower:
            e = self.vars[self.lower[n.lower()]]
        if e is None:
            return None
        self.memo[n] = None  # evita ciclo
        try:
            v = float(e)
        except ValueError:
            try:
                v = X.evaluate(X.parse(e), self.name, self.call)
            except Exception:  # noqa: BLE001
                v = None
        self.memo[n] = v
        return v


def num(v, frac=0, sign=False):
    if frac:
        s = ('%.' + str(frac) + 'f') % v
        s = s.rstrip('0').rstrip('.') if '.' in s else s
    else:
        s = str(int(round(v)))
    if sign and v >= 0:
        s = '+' + s
    return s


def fmt(v, spec):
    """Aplica o |fmt(...) / |round() / |floor() do texto do jogo."""
    if v is None:
        return '?'
    spec = spec or ''
    sign = 'sign' in spec and 'sign=false' not in spec
    m = re.search(r'max_frac=(\d)', spec)
    frac = int(m.group(1)) if m else (1 if 'fmt(' in spec else 0)
    if 'floor()' in spec:
        return num(math.floor(v + 1e-9), 0, sign)
    if 'round()' in spec:
        return num(v, 0, sign)
    if 'perc100' in spec:
        return num(v, frac, sign) + '%'
    if 'perc1' in spec:  # multiplicador: 1.2 -> 20% (more/increased), 0.6 -> 40% (less)
        return num(abs(v - 1) * 100, frac if 'max_frac' in spec else 0, sign) + '%'
    if 'perc' in spec:
        return num(v * 100, frac if 'max_frac' in spec else 0, sign) + '%'
    if 'time' in spec:
        return num(v, max(frac, 1), sign) + 's'
    if 'dist' in spec:
        return num(v / 100, max(frac, 1), sign) + 'm'
    return num(v, frac, sign)


STAT = None


def stat_texts():
    global STAT
    if STAT is None:
        T = mn.text()
        STAT = {k: v for k, v in T.items() if '{Value}' in v or '{value}' in v}
    return STAT


def clean(t):
    t = t.replace('\\r\\n', '\n').replace('\\n', '\n').replace('\r\n', '\n').replace("\\'", "'")
    t = re.sub(r'<[^>]*>', '', t).replace('</>', '')
    return t


def render(tpl, ctx, comps=None):
    """Troca os marcadores do texto pelos valores. comps: valores para {DescriptionComponent[X]} na ordem."""
    if not tpl:
        return ''
    t = clean(tpl)
    comps = list(comps or [])

    def comp(m):
        k = m.group(1)
        if k.startswith('Passive'):
            return ''
        base = re.sub(r'\d+$', '', k)
        st = stat_texts().get(base) or stat_texts().get(k)
        v = ctx.get(k)
        if v is None:
            v = ctx.get(base)
        if v is None and comps:
            v = comps.pop(0)
        if not st:
            return k
        st = clean(st)
        perc = re.search(r'\{[Vv]alue\}\|fmt\([^)]*perc', st)
        if v is not None and not perc and 0 < v < 3 and re.search(r'More|Increased|Less', base):
            # multiplicador (1.2 = 20% more; 0.6 = 40% less)
            v = (v - 1 if v >= 1 else 1 - v) * 100
        return re.sub(r'\{[Vv]alue\}(\|[a-z]+\([^)]*\))?', lambda x: fmt(v, x.group(1)), st)
    t = re.sub(r'\{DescriptionComponent\[([A-Za-z0-9_]+)\]\}', comp, t)
    def abil(m):
        k = m.group(1)
        for n in (k, 'Dmg', 'BaseDmg', 'Damage', 'DmgBase'):
            v = ctx.get(n)
            if v:
                return fmt(v, 'round()') + ' Damage'
        return 'Damage'
    t = re.sub(r'\{AbilityDamage\[([A-Za-z0-9_]+)\]\}', abil, t)
    t = re.sub(r'\{WeaponDamage\[([A-Za-z0-9_]+)\]\}', lambda m: fmt((ctx.get(m.group(1)) or 0) * 100, 'round()') + '% Weapon Damage', t)

    def var(m):
        n = m.group(1).split('.')[-1]
        return fmt(ctx.get(n), m.group(2))
    t = re.sub(r'\{([A-Za-z_][A-Za-z0-9_.]*)\}(\|[a-z_]+\([^)]*\))?', var, t)
    t = re.sub(r'[ \t]+', ' ', t)
    t = re.sub(r'\n\s*\n+', '\n', t).strip()
    return t
