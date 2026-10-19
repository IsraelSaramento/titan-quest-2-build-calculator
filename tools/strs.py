"""Mostra os textos legíveis (nomes e fórmulas) de assets extraídos. Uso: python strs.py <glob> [<glob>...]"""
import glob, os, re, sys
for pat in sys.argv[1:]:
    for f in sorted(glob.glob(pat, recursive=True)):
        if not f.endswith('.uasset'):
            continue
        out = []
        for ext in ('.uasset', '.uexp'):
            p = f[:-7] + ext
            if os.path.exists(p):
                d = open(p, 'rb').read()
                out.append([x.decode() for x in re.findall(rb'[\x20-\x7e]{3,}', d)])
        print('##', os.path.basename(f))
        print('  names:', ' | '.join(x for x in out[0] if not x.startswith('/Script') and len(x) < 120))
        if len(out) > 1:
            print('  exp  :', ' | '.join(out[1]))
