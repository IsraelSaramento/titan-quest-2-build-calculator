"""Extrai pares (nome = expressão) das tabelas GrimDynamics dos assets do TQ2.

As tabelas guardam cada valor como texto: primeiro a expressão, depois o nome.
Uso: python dyn.py <arquivo.uexp ou glob> [--json saida.json]
"""
import glob
import json
import re
import struct
import sys

IDENT = re.compile(r'^[A-Za-z_][A-Za-z0-9_]*$')


def fstrings(d):
    """Todas as FStrings ASCII (int32 len + texto + NUL) com suas posições."""
    out = []
    i = 0
    n = len(d)
    while i < n - 5:
        ln = struct.unpack_from('<i', d, i)[0]
        if 2 <= ln <= 4000 and i + 4 + ln <= n and d[i + 4 + ln - 1] == 0:
            s = d[i + 4:i + 4 + ln - 1]
            if all(32 <= c < 127 or c in (9, 10, 13) for c in s):
                out.append((i, i + 4 + ln, s.decode()))
                i += 4 + ln
                continue
        i += 1
    return out


PRE = bytes.fromhex('01 00 00 00 01 00 00 00 01 00 00 00')
NAME = re.compile(r'^[A-Za-z_][A-Za-z0-9_ ]*$')


def entries(d):
    fs = fstrings(d)
    res = []
    for a, b in zip(fs, fs[1:]):
        gap = d[a[1]:b[0]]
        if len(gap) == 24 and gap.startswith(PRE) and NAME.match(b[2]):
            res.append((b[2], a[2]))
    return res


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    allres = {}
    for pat in args:
        for f in sorted(glob.glob(pat, recursive=True)):
            if not f.endswith('.uexp'):
                continue
            e = entries(open(f, 'rb').read())
            if e:
                key = f.replace('\\', '/').split('/Content/TQ2/')[-1][:-5]
                allres[key] = e
    if '--json' in sys.argv:
        out = sys.argv[sys.argv.index('--json') + 1]
        json.dump(allres, open(out, 'w', encoding='utf-8'), indent=1)
        print(len(allres), 'arquivos')
    else:
        for k, e in allres.items():
            print('##', k)
            for n, x in e:
                print('   ', n, '=', x)
