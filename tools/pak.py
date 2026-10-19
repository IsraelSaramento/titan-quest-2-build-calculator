"""Lê o TQ2-Windows.pak (UE5, versão 11) e extrai arquivos que não estão no IoStore (configs .ini etc.).

Uso: python pak.py <arquivo.pak> list [filtro]
     python pak.py <arquivo.pak> get <caminho> [saida]
Precisa do oo2core_9_win64.dll (Oodle) para blocos Oodle; zlib usa a biblioteca padrão.
"""
import ctypes
import os
import struct
import sys
import zlib

MAGIC = 0x5A6F12E1
OODLE = None


def oodle():
    global OODLE
    if OODLE is None:
        here = os.environ.get('OODLE_DLL')
        OODLE = ctypes.WinDLL(here)
        OODLE.OodleLZ_Decompress.restype = ctypes.c_int64
    return OODLE


def rstr(d, o):
    n = struct.unpack_from('<i', d, o)[0]
    o += 4
    if n == 0:
        return '', o
    if n > 0:
        return d[o:o + n].rstrip(bytes(1)).decode('latin-1'), o + n
    n = -n
    return d[o:o + n * 2].decode('utf-16-le').rstrip(chr(0)), o + n * 2


class Pak:
    def __init__(self, path):
        self.f = open(path, 'rb')
        self.f.seek(0, 2)
        size = self.f.tell()
        # rodapé: guid(16) encrypted(1) magic(4) version(4) offset(8) size(8) hash(20) + 5 nomes de compressão (32 cada)
        for comp_names in (5, 4):
            flen = 16 + 1 + 4 + 4 + 8 + 8 + 20 + 32 * comp_names
            self.f.seek(size - flen)
            ft = self.f.read(flen)
            magic = struct.unpack_from('<I', ft, 17)[0]
            if magic == MAGIC:
                break
        else:
            raise SystemExit('rodapé do pak não encontrado')
        self.version, self.ioff, self.isize = struct.unpack_from('<iqq', ft, 21)
        names = ft[16 + 1 + 4 + 4 + 8 + 8 + 20:]
        self.methods = [names[i * 32:(i + 1) * 32].split(b'\0')[0].decode() for i in range(comp_names)]
        if ft[16]:
            raise SystemExit('índice criptografado')
        self.f.seek(self.ioff)
        idx = self.f.read(self.isize)
        self.mount, o = rstr(idx, 0)
        count, = struct.unpack_from('<i', idx, o); o += 4
        o += 8  # path hash seed
        has_ph, = struct.unpack_from('<i', idx, o); o += 4
        if has_ph:
            o += 8 + 8 + 20
        has_fd, = struct.unpack_from('<i', idx, o); o += 4
        fd_off = fd_size = 0
        if has_fd:
            fd_off, fd_size = struct.unpack_from('<qq', idx, o); o += 16 + 20
        enc_size, = struct.unpack_from('<i', idx, o); o += 4
        self.enc = idx[o:o + enc_size]
        self.f.seek(fd_off)
        fd = self.f.read(fd_size)
        self.files = {}
        o = 0
        ndir, = struct.unpack_from('<i', fd, o); o += 4
        for _ in range(ndir):
            dname, o = rstr(fd, o)
            nf, = struct.unpack_from('<i', fd, o); o += 4
            for _ in range(nf):
                fname, o = rstr(fd, o)
                eo, = struct.unpack_from('<i', fd, o); o += 4
                self.files[(dname + fname).lstrip('/')] = eo

    def entry(self, eo):
        d = self.enc
        bits, = struct.unpack_from('<I', d, eo); o = eo + 4
        comp_block_size = bits & 0x3f
        nblocks = (bits >> 6) & 0xffff
        encrypted = (bits >> 22) & 1
        comp = (bits >> 23) & 0x3f
        size32 = (bits >> 29) & 1
        usize32 = (bits >> 30) & 1
        off32 = (bits >> 31) & 1
        if comp_block_size == 0x3f:
            comp_block_size, = struct.unpack_from('<I', d, o); o += 4
        else:
            comp_block_size <<= 11
        def u(flag):
            nonlocal o
            if flag:
                v, = struct.unpack_from('<I', d, o); o += 4
            else:
                v, = struct.unpack_from('<q', d, o); o += 8
            return v
        offset = u(off32)
        usize = u(usize32)
        csize = usize
        if comp:
            csize = u(size32)
        blocks = []
        # cabeçalho da entrada no arquivo (FPakEntry serializado) antes dos dados
        hdr = 8 + 8 + 8 + 4 + 20 + (4 + 16 * nblocks if comp else 0) + 1 + 4
        if comp and nblocks:
            if nblocks == 1 and not encrypted:
                blocks = [(hdr, hdr + csize)]
            else:
                start = hdr
                for _ in range(nblocks):
                    bs, = struct.unpack_from('<I', d, o); o += 4
                    blocks.append((start, start + bs))
                    start += (bs + 15) // 16 * 16 if encrypted else bs
        return dict(offset=offset, usize=usize, csize=csize, comp=comp, blocks=blocks, bsize=comp_block_size, hdr=hdr)

    def read(self, path):
        e = self.entry(self.files[path])
        if not e['comp']:
            self.f.seek(e['offset'] + e['hdr'])
            return self.f.read(e['usize'])
        method = self.methods[e['comp'] - 1]
        out = bytearray()
        left = e['usize']
        for a, b in e['blocks']:
            self.f.seek(e['offset'] + a)
            raw = self.f.read(b - a)
            n = min(e['bsize'], left)
            if method.lower() == 'zlib':
                out += zlib.decompress(raw)
            elif method.lower() == 'oodle':
                buf = ctypes.create_string_buffer(n)
                r = oodle().OodleLZ_Decompress(raw, len(raw), buf, n, 0, 0, 0, None, 0, None, None, None, 0, 3)
                if r != n:
                    raise RuntimeError(f'Oodle falhou ({r} de {n})')
                out += buf.raw[:n]
            else:
                raise RuntimeError('compressão desconhecida: ' + method)
            left -= n
        return bytes(out)


if __name__ == '__main__':
    p = Pak(sys.argv[1])
    cmd = sys.argv[2]
    if cmd == 'list':
        flt = sys.argv[3].lower() if len(sys.argv) > 3 else ''
        for k in sorted(p.files):
            if flt in k.lower():
                print(k)
        print(len(p.files), 'arquivos; mount', p.mount, 'métodos', p.methods, file=sys.stderr)
    elif cmd == 'get':
        data = p.read(sys.argv[3])
        if len(sys.argv) > 4:
            open(sys.argv[4], 'wb').write(data)
        else:
            sys.stdout.buffer.write(data)
