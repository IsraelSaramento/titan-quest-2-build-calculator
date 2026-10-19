"""LÃª o CDO de um modifier (bp_gam_*): nome, descriÃ§Ã£o e o resto dos campos crus."""
import struct, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from uasset import load
import mastery_names as mn


def frags(d, o):
    """Cabeçalho de propriedades sem versão (UE5): índices presentes e os que são zero."""
    fr = []; idx = 0
    while True:
        f = struct.unpack_from('<H', d, o)[0]; o += 2
        skip = f & 0x7f; hz = (f >> 7) & 1; last = (f >> 8) & 1; val = f >> 9
        idx += skip
        fr.append((idx, val, hz)); idx += val
        if last:
            break
    nz = sum(v for _, v, h in fr if h)
    bits = 0
    if nz:
        n = 1 if nz <= 8 else (2 if nz <= 16 else 4 * ((nz + 31) // 32))
        bits = int.from_bytes(d[o:o + n], 'little'); o += n
    props, zm, b = [], [], 0
    for i0, v, h in fr:
        for i in range(v):
            props.append(i0 + i)
            if h:
                zm.append((bits >> b) & 1); b += 1
            else:
                zm.append(0)
    return props, zm, o


def ftext(d, o):
    flags = struct.unpack_from('<i', d, o)[0]; o += 4
    ht = d[o]; o += 1
    if ht == 0x0b:
        o += 8
        n = struct.unpack_from('<i', d, o)[0]; o += 4
        k = d[o:o + n - 1].decode(); o += n
        return k, o
    if ht == 0xff:
        has = struct.unpack_from('<i', d, o)[0]; o += 4
        if has:
            n = struct.unpack_from('<i', d, o)[0]; o += 4
            s = d[o:o + n - 1].decode('latin1'); o += n
            return s, o
        return '', o
    raise ValueError('ftext %x' % ht)


def cdo(cls):
    f = mn.asset(cls)
    a, N, imps, exps, es = load(f[:-5] + '.uasset')
    u = open(f, 'rb').read()
    for k, (ff, nm, raw) in enumerate(exps):
        if nm.startswith('Default__'):
            q = struct.unpack_from('<' + 'i' * (es // 4), raw)
            return u[q[9] - len(a):q[9] - len(a) + q[7]], N, imps
    return None, N, imps


if __name__ == '__main__':
    for c in sys.argv[1:]:
        d, N, imps = cdo(c)
        props, zm, o = frags(d, 0)
        print(c, 'props', props, 'zero', zm)
        n0, o = ftext(d, o)
        n1, o = ftext(d, o)
        print('  ', n0, n1)
        print('  ', d[o:o + 90].hex(' '))


def i32(d, o):
    return struct.unpack_from('<i', d, o)[0], o + 4


def tags(d, o, N):
    n, o = i32(d, o); v = []
    for _ in range(n):
        x, o = i32(d, o); o += 4; v.append(N[x])
    return v, o


def modifier(cls):
    """Campos do modifier: nome, descrição, rank máximo, custo de capacity, requisitos e incompatíveis."""
    d, N, imps = cdo(cls)
    props, zm, o = frags(d, 0)
    r = {'max': 1, 'cost': 0}
    for p, z in zip(props, zm):
        if z:
            if p == 16:
                r['cost'] = 0
            continue
        if p in (0, 2, 4):
            r[{0: 'name', 2: 'desc', 4: 'short'}[p]], o = ftext(d, o)
        elif p == 6:
            n, o = i32(d, o); r['p6'] = list(d[o:o + n]); o += n
        elif p in (7, 15):
            x, o = i32(d, o)
        elif p in (8, 9, 10, 11, 12):
            r[{8: 'tag', 9: 'abilityTag', 10: 'p10', 11: 'requires', 12: 'incompatible'}[p]], o = tags(d, o, N)
        elif p == 13:
            r['max'], o = i32(d, o)
        elif p == 14:
            r['p14'], o = i32(d, o)
        elif p == 16:
            r['cost'], o = i32(d, o)
        else:
            break
    return r
