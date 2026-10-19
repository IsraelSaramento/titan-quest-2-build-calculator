"""Monta o catálogo de afixos de dano do TQ2 para as sugestões de equipamento.

Lê, nos assets extraídos:
- as tabelas de sorteio por tipo de item (Items/Affixes/AffixDropTables e Groups): quais afixos podem sair em cada slot;
- cada afixo (Items/Affixes/Prefixes|Suffixes): o valor de cada tier e o nível de item de cada tier;
- as tabelas de valores (Data/Balancing/Affixes/da_tq2_item_affix_values_*) e de níveis (Affix_ranges+jitter_XT).
Gera src/affix_pool.js (window.TQ2_AFFIX_POOL).
Uso: python tools/affix_pool.py <pasta extract>
"""
import glob
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dyn import entries  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EX = sys.argv[1]
AFX = os.path.join(EX, 'items/TQ2/Content/TQ2/Items/Affixes')
BAL = os.path.join(EX, 'balancing/TQ2/Content/TQ2/Data/Balancing/Affixes')
TEXT = json.load(open(os.path.join(ROOT, 'src/affix_texts.json'), encoding='utf-8'))

RARE = 2  # Common 0, Magic 1, Rare 2, Epic 3+


def table(name):
    d = open(os.path.join(BAL, name + '.uexp'), 'rb').read()
    return dict(entries(d))


def py_expr(e):
    """Converte a expressão GrimDynamics em Python."""
    e = " ".join(e.split(chr(10))).replace(chr(13), " ")
    e = e.replace('Context.$GrimVentory.ItemProperty.2H', 'H2').replace('Context.$GrimVentory.ItemType.Ring', 'RING')
    e = e.replace('ItemContext.Rarity', 'RAR').replace('Context.Rarity', 'RAR').replace('^', '**')
    # a ? b : c  ->  (b if a else c), aninhado à direita
    def tern(x):
        if '?' not in x:
            return x
        i = x.index('?')
        rest = x[i + 1:]
        j = rest.index(':')
        return f'(({rest[:j]}) if ({x[:i]}) else ({tern(rest[j + 1:])}))'
    return tern(e)


def evaluator(*tabs):
    src = {}
    for t in tabs:
        src.update(t)

    def ev(name, ctx, depth=0):
        if depth > 20:
            raise ValueError(name)
        expr = src[name]
        names = set(re.findall(r'[A-Za-z_][A-Za-z0-9_]*', py_expr(expr)))
        env = dict(ctx)
        for n in names:
            if n in env or n in ('if', 'else', 'and', 'or', 'not'):
                continue
            if n in src:
                env[n] = ev(n, ctx, depth + 1)
        return eval(py_expr(expr), {'__builtins__': {}}, env)
    return ev, src


VAL = {}
for f in ('offense', 'utility', 'defense'):
    VAL.update(table('da_tq2_item_affix_values_' + f))
XT = table('da_tq2_item_Affix_ranges+jitter_XT')
VAL['WeaponRingFactor'] = '(1+Context.$GrimVentory.ItemProperty.2H*0.7)-(0.5*Context.$GrimVentory.ItemType.Ring)'  # 2ª linha some na leitura
ev, SRC = evaluator(VAL, XT)
CTX = {'base': {'H2': 0, 'RING': 0, 'RAR': RARE}, '2h': {'H2': 1, 'RING': 0, 'RAR': RARE}, 'ring': {'H2': 0, 'RING': 1, 'RAR': RARE}}


def strs(path):
    d = open(path, 'rb').read()
    return [x.decode() for x in re.findall(rb'[\x20-\x7e]{3,}', d)]


def parse_affix(path):
    """Tiers do afixo: [{fx: [(tooltip key, valor)], lv: [min, max]}]."""
    toks = strs(path[:-7] + '.uexp')
    levels = {}
    tips = {}
    last_tip = None
    prev = None
    for t in toks:
        m = re.match(r'(\w+)\.TooltipText$', t)
        if m:
            last_tip = m.group(1)
        m = re.match(r'Levels\.Levels\[(\d+)\]\.Affix Effects\[(\d+)\]\.Scale\.(Value / Min|Max)$', t)
        if m and prev:
            k, j, which = int(m.group(1)), int(m.group(2)), 'min' if 'Min' in m.group(3) else 'max'
            lv = levels.setdefault(k, {'fx': {}, 'lv': [None, None]})
            ref = prev.split('.', 1)[1] if prev.startswith('AffixValue') else prev
            lv['fx'].setdefault(j, {})[which] = ref
            if j not in tips and last_tip:
                tips[j] = last_tip
        m = re.match(r'Levels\.Levels\[(\d+)\]\.Requirement\.Item Level (Min|Max)$', t)
        if m and prev:
            k = int(m.group(1))
            lv = levels.setdefault(k, {'fx': {}, 'lv': [None, None]})
            ref = prev.split('.', 1)[1] if re.match(r'Affix[xX]T\.', prev) else prev
            lv['lv'][0 if m.group(2) == 'Min' else 1] = ref
        prev = t
    return levels, tips


def num(ref, ctx):
    try:
        return float(ref)
    except (TypeError, ValueError):
        pass
    if ref is None:
        return None
    try:
        if ref in SRC:
            return float(ev(ref, ctx))
        # expressão solta, como "FlatArmor_T1*AffixXT.JitterMinMp"
        expr = re.sub(r'\bAffix(?:Value\w*|[xX]T)\.', '', ref)
        SRC['_tmp'] = expr
        return float(ev('_tmp', ctx))
    except Exception:
        return None


def main():
    # slots
    tabs = {}
    for f in glob.glob(os.path.join(AFX, '**', '*.uasset'), recursive=True):
        me = os.path.basename(f)[:-7]
        if not me.startswith('da_at'):
            continue
        d = open(f, 'rb').read()
        names = sorted(set(x.decode() for x in re.findall(rb'da_(?:prefix|suffix|at)_[A-Za-z0-9_]+', d)))
        tabs[me] = [n for n in names if n != me]

    def leaves(t, seen=()):
        out = set()
        for n in tabs.get(t, []):
            if n.startswith('da_at'):
                if n not in seen:
                    out |= leaves(n, seen + (t,))
            else:
                out.add(n)
        return out
    SLOTS = ['Helmet', 'Shoulder', 'Torso', 'Arm', 'Leg', 'Neck', 'Ring', 'Club1H', 'Club2H', 'Axe1H', 'Axe2H', 'Sword', 'Spear', 'Dagger', 'Staff', 'Bow', 'Shield', 'Talisman']
    slots = {}
    for s in SLOTS:
        ids = set()
        for k in ('Prefix', 'Suffix'):
            ids |= leaves(f'da_at_01_{k}_{s}')
        slots[s] = sorted(ids)

    used = sorted(set(a for v in slots.values() for a in v))
    affixes = {}
    files = {os.path.basename(f)[:-7]: f for f in glob.glob(os.path.join(AFX, '*fixes', '*.uasset'))}
    for a in used:
        if a not in files:
            continue
        key = a[3:]
        own = TEXT.get(key)
        levels, tips = parse_affix(files[a])
        # variáveis locais do afixo (AffixFactor, AffixOffset...)
        for k, v in entries(open(files[a][:-7] + '.uexp', 'rb').read()):
            if k.startswith('Affix'):
                SRC[k] = v
        if not levels:
            continue
        tiers = []
        for k in sorted(levels):
            lv = levels[k]
            t = {'fx': [], 'lv': [num(lv['lv'][0], CTX['base']), num(lv['lv'][1], CTX['base'])]}
            for j in sorted(lv['fx']):
                fx = lv['fx'][j]
                vals = {c: [num(fx.get('min'), CTX[c]), num(fx.get('max'), CTX[c])] for c in CTX}
                t['fx'].append({c: [round(x, 2) if x is not None else None for x in v] for c, v in vals.items()})
            tiers.append(t)
        # textos por efeito
        texts = []
        own_lines = own.replace('\\r\\n', '\n').split('\n') if own else []
        nfx = max(len(t['fx']) for t in tiers)
        for j in range(nfx):
            tk = tips.get(j)
            txt = TEXT.get(tk) if tk else None
            if not txt and j < len(own_lines):
                txt = own_lines[j]
            texts.append(txt)
        if not any(texts):
            continue
        affixes[key] = {'pre': key.startswith('prefix'), 'text': texts, 'tiers': tiers}
    slots = {s: [a[3:] for a in v if a[3:] in affixes] for s, v in slots.items()}
    out = os.path.join(ROOT, 'src', 'affix_pool.js')
    with open(out, 'w', encoding='utf-8') as fh:
        fh.write('// Gerado por tools/affix_pool.py: afixos que podem sair em cada slot, com valor e nível de cada tier (itens Rare).\n')
        fh.write('window.TQ2_AFFIX_POOL=' + json.dumps({'slots': slots, 'affixes': affixes}, separators=(',', ':')) + ';\n')
    print('ok', out, len(affixes), 'afixos', {s: len(v) for s, v in slots.items()})


if __name__ == '__main__':
    main()
