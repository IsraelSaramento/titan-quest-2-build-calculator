"""Leitor de saves GVAS do Titan Quest II (UE 5.4+, property tags com tipo completo).

Uso: python gvas.py <arquivo.sav> [saida.json]
"""
import json
import struct
import sys


class R:
    def __init__(self, d, p=0):
        self.d, self.p = d, p

    def i32(self):
        v = struct.unpack_from('<i', self.d, self.p)[0]; self.p += 4; return v

    def u32(self):
        v = struct.unpack_from('<I', self.d, self.p)[0]; self.p += 4; return v

    def i64(self):
        v = struct.unpack_from('<q', self.d, self.p)[0]; self.p += 8; return v

    def f32(self):
        v = struct.unpack_from('<f', self.d, self.p)[0]; self.p += 4; return v

    def f64(self):
        v = struct.unpack_from('<d', self.d, self.p)[0]; self.p += 8; return v

    def u8(self):
        v = self.d[self.p]; self.p += 1; return v

    def raw(self, n):
        v = self.d[self.p:self.p + n]; self.p += n; return v

    def fstr(self):
        n = self.i32()
        if n == 0:
            return ''
        if n < 0:
            s = self.raw(-n * 2).decode('utf-16-le'); return s[:-1]
        s = self.raw(n); return s[:-1].decode('utf-8', 'replace')


def read_type(r):
    name = r.fstr(); n = r.i32()
    return {'n': name, 'p': [read_type(r) for _ in range(n)]}


NATIVE = {'Guid': 16, 'Vector': 24, 'Rotator': 24, 'Quat': 32, 'Vector2D': 16, 'Color': 4,
          'LinearColor': 16, 'DateTime': 8, 'Timespan': 8, 'IntPoint': 8, 'IntVector': 12}


def read_tag(r):
    name = r.fstr()
    if name == 'None' or name == '':
        return None
    t = read_type(r)
    size = r.i32()
    flags = r.u8()
    tag = {'name': name, 'type': t, 'size': size, 'flags': flags}
    if flags & 1:
        tag['idx'] = r.i32()
    if flags & 2:
        r.raw(16)
    if flags & 4:
        ext = r.u8()
        if ext & 2:
            r.raw(2)
    return tag


def read_props(r, end=None):
    out = {}
    while end is None or r.p < end:
        tag = read_tag(r)
        if tag is None:
            break
        start = r.p
        try:
            v = read_value(r, tag['type'], tag['size'], tag['flags'])
            if r.p != start + tag['size']:
                raise ValueError('size mismatch')
        except Exception:
            r.p = start
            v = {'__raw': r.raw(tag['size']).hex()}
        key = tag['name'] if 'idx' not in tag else f"{tag['name']}[{tag['idx']}]"
        out[key] = v
    return out


KNOWN_NATIVE = {'GameplayTagContainer', 'GameplayTag', 'SoftObjectPath', 'GrimItemInstanceHandle', 'SaveGameData'}


def read_struct_body(r, sname, size=None):
    if sname in NATIVE:
        b = r.raw(NATIVE[sname])
        if sname == 'Vector':
            return struct.unpack('<3d', b)
        if sname == 'DateTime':
            return struct.unpack('<q', b)[0]
        if sname == 'Color':
            return list(b)
        return b.hex()
    if sname == 'GameplayTagContainer':
        return [r.fstr() for _ in range(r.i32())]
    if sname == 'GameplayTag':
        return r.fstr()
    if sname == 'SoftObjectPath':
        return [r.fstr(), r.fstr()]
    if sname == 'GrimItemInstanceHandle':
        path = r.fstr(); name = r.fstr(); a = r.i32(); has = r.i32(); r.u8()
        out = {'__item': path, 'a': a}
        if has:
            out.update(read_props(r, None))
            out['__tail'] = r.raw(5).hex()
        return out
    if sname == 'SaveGameData':
        key = r.fstr(); cls = r.fstr(); n = r.i32(); r.u8()
        props = read_props(r, None)
        r.i32()
        return {'__key': key, '__class': cls, **props}
    end = r.p + size if size is not None else None
    return read_props(r, end)


def read_value(r, t, size, flags, in_container=False):
    tn = t['n']
    if tn == 'BoolProperty':
        return bool(flags & 0x10) if not in_container else bool(r.u8())
    if tn == 'IntProperty':
        return r.i32()
    if tn in ('UInt32Property',):
        return r.u32()
    if tn == 'Int64Property' or tn == 'UInt64Property':
        return r.i64()
    if tn == 'FloatProperty':
        return r.f32()
    if tn == 'DoubleProperty':
        return r.f64()
    if tn in ('StrProperty', 'NameProperty', 'EnumProperty'):
        return r.fstr()
    if tn == 'ByteProperty':
        if t['p'] and t['p'][0]['n'] != 'None':
            return r.fstr()
        return r.u8()
    if tn in ('ObjectProperty', 'ClassProperty', 'InterfaceProperty'):
        return r.fstr()
    if tn in ('SoftObjectProperty', 'SoftClassProperty'):
        a = r.fstr(); b = r.fstr(); c = r.fstr()
        return a + ('.' + b if b else '') + (':' + c if c else '')
    if tn == 'TextProperty':
        fl = r.u32(); ht = r.u8()
        if ht == 0:
            ns = r.fstr(); key = r.fstr(); src = r.fstr()
            return {'ns': ns, 'key': key, 'src': src}
        if ht == 0xff:
            if r.u32():
                return r.fstr()
            return ''
        if ht == 0x0b:  # StringTableEntry
            return {'table': r.fstr(), 'key': r.fstr()}
        raise ValueError('text ' + str(ht))
    if tn == 'StructProperty':
        sname = t['p'][0]['n'] if t['p'] else '?'
        if (flags & 8) and not in_container and sname not in NATIVE and sname not in KNOWN_NATIVE:
            st = r.p
            try:
                v = read_props(r, st + size)
                if r.p == st + size:
                    return v
            except Exception:
                pass
            raise ValueError('native struct ' + sname)
        return read_struct_body(r, sname, None if in_container else size)
    if tn == 'ArrayProperty' or tn == 'SetProperty':
        inner = t['p'][0]
        if tn == 'SetProperty':
            r.i32()
        n = r.i32()
        if inner['n'] == 'ByteProperty' and not (inner['p'] and inner['p'][0]['n'] != 'None'):
            return {'__bytes': r.raw(n).hex()} if n > 64 else list(r.raw(n))
        return [read_value(r, inner, 0, 0, True) for _ in range(n)]
    if tn == 'MapProperty':
        kt, vt = t['p'][0], t['p'][1]
        r.i32()
        n = r.i32()
        out = []
        for _ in range(n):
            k = read_value(r, kt, 0, 0, True)
            v = read_value(r, vt, 0, 0, True)
            out.append([k, v])
        return out
    raise ValueError('unknown ' + tn)


def read_save(path):
    d = open(path, 'rb').read()
    r = R(d)
    assert r.raw(4) == b'GVAS'
    r.i32(); r.i32(); r.i32()  # save ver, ue4 ver, ue5 ver
    r.raw(6); r.u32(); r.fstr()  # engine version
    r.i32()  # custom version format
    for _ in range(r.i32()):
        r.raw(20)
    cls = r.fstr()
    r.u8()  # unknown flag byte seen in TQ2 saves
    props = read_props(r)
    return {'class': cls, 'props': props}


def expand_savegame(obj):
    """Os dados reais ficam em blobs nativos (SaveGameData). Tenta decodificá-los."""
    if isinstance(obj, dict):
        for k, v in list(obj.items()):
            if isinstance(v, dict) and '__raw' in v:
                obj[k] = try_blob(bytes.fromhex(v['__raw'])) or v
            else:
                expand_savegame(v)
    elif isinstance(obj, list):
        for v in obj:
            expand_savegame(v)
    return obj


def try_blob(b):
    return None


if __name__ == '__main__':
    s = read_save(sys.argv[1])
    out = json.dumps(expand_savegame(s), indent=1, ensure_ascii=False, default=str)
    if len(sys.argv) > 2:
        open(sys.argv[2], 'w', encoding='utf-8').write(out)
    else:
        print(out[:5000])
