"""Resolve nomes de exibição (texto do jogo) das skills, passivas e feats referenciadas em da_mastery_*."""
import csv, glob, io, os, re
EX = 'C:/Users/israe/AppData/Local/Temp/claude/F--Dev-IA-titan-quest-2/6769aac8-fcc8-4553-b7ea-751ad0c40a59/scratchpad/extract'
TXT = 'F:/Jogos/Steam/steamapps/common/Titan Quest II/TQ2/Content/TQ2/Data/Text'
_files = None
TEXT = {}


def text():
    if not TEXT:
        for f in glob.glob(os.path.join(TXT, '**', '*.csv'), recursive=True):
            raw = open(f, 'rb').read()
            for enc in ('utf-8-sig', 'utf-16', 'cp1252'):
                try:
                    t = raw.decode(enc); break
                except UnicodeDecodeError:
                    continue
            for row in csv.reader(io.StringIO(t, newline='')):
                if len(row) >= 2:
                    TEXT[row[0]] = row[1]
    return TEXT


def asset(cls):
    global _files
    if _files is None:
        _files = {}
        for f in glob.glob(os.path.join(EX, '**', '*.uexp'), recursive=True):
            _files.setdefault(os.path.basename(f)[:-5].lower(), f)
    n = cls[:-2] if cls.endswith('_C') else cls
    return _files.get(n.lower())


def tokens(cls):
    f = asset(cls)
    if not f:
        return []
    return [x.decode() for x in re.findall(rb'[\x20-\x7e]{3,}', open(f, 'rb').read())]


def keyname(cls):
    """Chave de texto <X>_0Name usada pelo asset."""
    for t in tokens(cls):
        if t.endswith('_0Name'):
            return t[:-6]
    return None


def uasset_tokens(cls):
    f = asset(cls)
    if not f:
        return []
    return [x.decode() for x in re.findall(rb'[\x20-\x7e]{3,}', open(f[:-5] + '.uasset', 'rb').read())]


def main_ability(cls):
    """Para um selector, a habilidade principal (bp_bga_* sem _m_)."""
    if '_selector_' not in cls:
        return cls
    for t in uasset_tokens(cls):
        if t.startswith('bp_bga_') and t.endswith('_C') and '_m_' not in t and 'fake' not in t:
            return t
    return cls


def display(cls):
    k = keyname(main_ability(cls)) or keyname(cls)
    if not k:
        return None, None
    return k, text().get(k + '_0Name', '').replace("\'", "'")
