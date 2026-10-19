"""Mostra a sequência de textos (fórmulas e nomes) de assets. Uso: python seq.py <glob>..."""
import glob, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import dyn
SKIP = ('Effect Group', 'Application', 'Necessary', 'Trigger Chance', 'Stacks to', 'Effect Groups', 'BPTYPE')
for pat in sys.argv[1:]:
    for f in sorted(glob.glob(pat, recursive=True)):
        if not f.endswith('.uexp'):
            continue
        d = open(f, 'rb').read()
        fs = [s for _, _, s in dyn.fstrings(d) if not s.startswith(SKIP) and s not in ('*', '+', '-', '/', '==', '-1.0', '_GameplayEffectTag', '_VariableTag', 'clamp', '(', ')')]
        print('##', os.path.basename(f)[:-5])
        print('   ', ' | '.join(fs)[:2500])
