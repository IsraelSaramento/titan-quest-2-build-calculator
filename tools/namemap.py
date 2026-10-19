"""Lê o mapa de nomes de um .uasset legado (saída do retoc to-legacy)."""
import struct


def names(path):
    a = open(path, 'rb').read()
    i = a.find(b'/JsonData') - 4 if b'/JsonData' in a[:400] else a.find(b'/Game') - 4
    n = struct.unpack_from('<i', a, i)[0]
    p = i + 4 + n
    # NameCount/NameOffset aparecem como os dois int32 seguintes ao PackageFlags
    flags, cnt, off = struct.unpack_from('<Iii', a, p)
    out = []
    q = off
    for _ in range(cnt):
        ln = struct.unpack_from('<i', a, q)[0]
        if ln < 0:
            s = a[q + 4:q + 4 - ln * 2].decode('utf-16-le')[:-1]; q += 4 - ln * 2
        else:
            s = a[q + 4:q + 4 + ln - 1].decode('latin1'); q += 4 + ln
        q += 4
        out.append(s)
    return out
