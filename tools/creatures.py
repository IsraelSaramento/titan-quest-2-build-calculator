"""Extrai resistências, armadura e tier dos monstros (JsonDataCache/Game/TQ2/Creatures).

Uso: python creatures.py <pasta Creatures extraída> <pasta Text do jogo> <saida.json>
"""
import csv
import glob
import json
import os
import re
import struct
import sys

sys.path.insert(0, os.path.dirname(__file__))
import dyn  # noqa: E402
import namemap  # noqa: E402

TYPE = {'GrimDamageType.Thermal.Fire': 'fire', 'GrimDamageType.Thermal.Cold': 'cold', 'GrimDamageType.Natural.Lightning': 'lightning',
        'GrimDamageType.Natural.Poison': 'poison', 'GrimDamageType.Physical.Pierce': 'pierce', 'GrimDamageType.Physical.Strike': 'strike',
        'GrimResistanceType.Universal.Vitality': 'vitality', 'GrimDamageType.Universal.VitalityDrain': 'vitality',
        'GrimDamageType.Universal.SpiritDivine': 'spirit'}


def texts(text_dir):
    t = {}
    for f in glob.glob(os.path.join(text_dir, 'Creatures', '*.csv')):
        for row in csv.reader(open(f, encoding='utf-8-sig', newline='')):
            if len(row) >= 2:
                t[row[0]] = row[1]
    return t


def num(expr):
    m = re.match(r'^\s*ResScaling\.Resistance\(\s*([-\d.]+)\s*\)\s*$', expr) or re.match(r'^\s*ArmorScaling\.ArmorScalingFormula\(\s*([-\d.]+)\s*\)\s*$', expr) or re.match(r'^\s*([-\d.]+)\s*$', expr)
    return float(m.group(1)) if m else None


def one(path, tx):
    e = open(path, 'rb').read()
    ns = namemap.names(path[:-5] + '.uasset')
    refs = []  # (posição, tipo)
    for k, n in enumerate(ns):
        if n in TYPE:
            for m in re.finditer(re.escape(struct.pack('<ii', k, 0)), e):
                refs.append((m.start(), TYPE[n]))
    refs.sort()
    tier = next((n.split('.')[-1] for n in ns if n.startswith('GrimCore.Character.Tier.')), None)
    fam = next((n.split('Creature.Family.')[-1] for n in ns if 'Creature.Family.' in n), None)
    fs = dyn.fstrings(e)
    res, arm = {}, {}
    for i, (a, b, s) in enumerate(fs):
        m = re.match(r'Starting (Resistance|Armor)\[(\d+)\]\.(?:Resistance|Armor) Value$', s)
        if not m:
            continue
        expr = fs[i - 1][2] if i else ''
        v = num(expr)
        prev = [r for r in refs if r[0] < a]
        if v is None or not prev:
            continue
        t = prev[-1][1]
        (res if m.group(1) == 'Resistance' else arm)[t] = v
    key = None
    for a, b, s in fs:
        if s in tx and not s.endswith('_prefix') and not s.startswith(('ichthian_', 'tribe_')):
            key = s
    name = tx.get(key) if key else None
    return {'id': os.path.basename(path)[:-5], 'key': key, 'name': name, 'tier': tier, 'family': fam,
            'folder': os.path.relpath(os.path.dirname(path), sys.argv[1]).replace('\\', '/'), 'res': res, 'armor': arm}


def main(root, text_dir, out):
    tx = texts(text_dir)
    rows = []
    for f in glob.glob(os.path.join(root, '**', '*.uexp'), recursive=True):
        try:
            r = one(f, tx)
        except Exception as ex:  # asset fora do padrão
            continue
        if r['tier'] and r['name'] and 'debug' not in r['id'].lower() and 'test' not in r['id'].lower():
            rows.append(r)
    json.dump(rows, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(len(rows))


if __name__ == '__main__':
    main(*sys.argv[1:4])
