"""Catálogo de charms e relíquias (itens de encaixe) do TQ2.

Para cada da_socket_* (JsonDataCache/Items/charm|relic) lê, por quantidade de stacks, o texto do efeito
(chave de tooltip) e o valor (stats.X da tabela da_tq2_item_<tipo>_<nome>_values), e o bônus de completar.
Gera src/socketables.js (window.TQ2_SOCKETS).
Uso: python tools/socketables.py <pasta extract> <pasta Data/Text do jogo>
"""
import csv
import glob
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dyn import entries  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EX, TEXTDIR = sys.argv[1], sys.argv[2]

TEXT = {}
for f in glob.glob(os.path.join(TEXTDIR, '**', '*.csv'), recursive=True):
    raw = open(f, 'rb').read()
    for enc in ('utf-8-sig', 'utf-16', 'cp1252'):
        try:
            txt = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    import io
    with io.StringIO(txt, newline='') as fh:
        for row in csv.reader(fh):
            if len(row) >= 2:
                TEXT[row[0]] = row[1]

VALUES = {}
for f in glob.glob(os.path.join(EX, '**', 'Socketables', '**', '*_values.uexp'), recursive=True):
    VALUES[os.path.basename(f)[:-5]] = dict(entries(open(f, 'rb').read()))


def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def fill(tpl, v):
    if tpl is None:
        return None
    t = tpl.replace('\\r\\n', ' ').replace('\r\n', ' ')
    if v is None:
        return t
    vv = int(v) if float(v).is_integer() else round(v, 2)
    t = re.sub(r'\{[Vv]alue\}\|fmt\(sign=true[^)]*\)', ('+' if v >= 0 else '') + str(vv), t)
    t = re.sub(r'\{[Vv]alue\}\|fmt\([^)]*\)', str(vv), t)
    t = re.sub(r'\{(?:[Vv]alue|Decimal)\}', str(vv), t)
    return t


out = {}
files = glob.glob(os.path.join(EX, '**', 'JsonDataCache', 'Game', 'TQ2', 'Items', '*', 'da_socket_*.uexp'), recursive=True)
for f in sorted(files):
    name = os.path.basename(f)[:-5]
    d = open(f, 'rb').read()
    toks = [x.decode() for x in re.findall(rb'[\x20-\x7e]{3,}', d)]
    ua = open(f[:-5] + '.uasset', 'rb').read()
    vt = re.search(rb'(da_tq2_item_(?:charm|relic)_\w+?_?values)', ua)
    table = VALUES.get(vt.group(1).decode(), {}) if vt else {}
    levels, complete = {}, []
    tip, ref, free = None, None, None
    title = None
    for t in toks:
        if re.match(r'^(cha|rel)_\w+_name_\d+$', t):
            title = TEXT.get(t)
        if t.endswith('.TooltipText'):
            tip = t[:-len('.TooltipText')]
        elif re.match(r'^(affix|prefix|suffix)_\w+$', t) and (t in TEXT or t + '.TooltipText' in TEXT):
            tip = t
        elif t.startswith('stats.'):
            ref = t[6:]
        elif ' ' in t and t != 'Custom Drop Requirement' and not t.startswith(('Effects', 'Completion', 'Overridden')) and not re.search(r'\.(Value|Max)', t):
            free = t
        m = re.match(r'Effects by Completion Level\[(\d+)\]\.Effects\[(\d+)\]\.Scale\.Value / Min', t)
        if m:
            v = num(table.get(ref)) if ref else None
            levels.setdefault(int(m.group(1)), []).append(fill(TEXT.get(tip + '.TooltipText') or TEXT.get(tip), v) if tip else free)
            tip, ref = None, None
        m = re.match(r'Completion Bonus\.Effects\[(\d+)\]\.Scale\.Value / Min', t)
        if m:
            v = num(table.get(ref)) if ref else None
            complete.append(fill(TEXT.get(tip + '.TooltipText') or TEXT.get(tip), v) if tip else free)
            tip, ref = None, None
    if not levels:
        continue
    out[name] = {'name': title or name, 'stacks': [[x for x in levels[k] if x] for k in sorted(levels)], 'complete': [x for x in complete if x]}

dst = os.path.join(ROOT, 'src', 'socketables.js')
with open(dst, 'w', encoding='utf-8') as fh:
    fh.write('// Gerado por tools/socketables.py: efeitos de charms e relíquias por quantidade de stacks.\n')
    fh.write('window.TQ2_SOCKETS=' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('ok', dst, len(out))
for k in ('da_socket_relic_typhon_01', 'da_socket_charm_boarblood_01', 'da_socket_charm_ichthianpearl1_01', 'da_socket_charm_boarhide1_01', 'da_socket_relic_ajax_01', 'da_socket_charm_membranewings_01'):
    print(k, json.dumps(out.get(k), ensure_ascii=False))
