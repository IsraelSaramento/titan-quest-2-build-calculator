"""Interpretador das expressões GrimDynamics do TQ2 (as fórmulas das tabelas do jogo).

Suporta números, nomes com ponto (Tabela.Nome), chamadas f(a, b), unário - e !, operadores
^ * / % + - < > <= >= == != && || e o ternário c ? a : b.
"""
import math
import re

TOK = re.compile(r'\s*(?:(\d+\.\d*|\.\d+|\d+)|([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)|(\|\||&&|==|!=|<=|>=|[-+*/%^()<>!?:,]))')

BIN = {'||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '>': 4, '<=': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6, '^': 8}


def tokens(s):
    s = s.strip()
    out, i = [], 0
    while i < len(s):
        m = TOK.match(s, i)
        if not m or m.end() == i:
            if s[i:].strip() == '':
                break
            raise SyntaxError('token em %r: %r' % (s, s[i:i + 10]))
        i = m.end()
        if m.group(1):
            out.append(('n', float(m.group(1))))
        elif m.group(2):
            out.append(('id', m.group(2)))
        else:
            out.append(('op', m.group(3)))
    return out


class Parser:
    def __init__(self, s):
        self.t = tokens(s)
        self.i = 0

    def peek(self):
        return self.t[self.i] if self.i < len(self.t) else (None, None)

    def take(self, v=None):
        k = self.peek()
        if v is not None and k[1] != v:
            raise SyntaxError('esperava %s' % v)
        self.i += 1
        return k

    def parse(self):
        e = self.expr()
        if self.i != len(self.t):
            raise SyntaxError('sobrou %r' % (self.t[self.i:],))
        return e

    def expr(self):
        c = self.binary(0)
        if self.peek() == ('op', '?'):
            self.take()
            a = self.expr()
            self.take(':')
            b = self.expr()
            return ('?', c, a, b)
        return c

    def binary(self, minp):
        left = self.unary()
        while True:
            k, v = self.peek()
            if k != 'op' or v not in BIN or BIN[v] < minp:
                return left
            p = BIN[v]
            self.take()
            right = self.binary(p if v == '^' else p + 1)
            left = ('b', v, left, right)

    def unary(self):
        k, v = self.peek()
        if k == 'op' and v in ('-', '+', '!'):
            self.take()
            return ('u', v, self.unary())
        return self.atom()

    def atom(self):
        k, v = self.take()
        if k == 'n':
            return ('n', v)
        if k == 'op' and v == '(':
            e = self.expr()
            self.take(')')
            return e
        if k == 'id':
            if self.peek() == ('op', '('):
                self.take()
                args = []
                if self.peek() != ('op', ')'):
                    while True:
                        args.append(self.expr())
                        if self.peek() == ('op', ','):
                            self.take()
                            continue
                        break
                self.take(')')
                return ('call', v, args)
            return ('id', v)
        raise SyntaxError('inesperado %r' % (v,))


BUILTIN = {
    'clamp': lambda x, a, b: max(a, min(b, x)), 'min': min, 'max': max, 'floor': math.floor, 'ceil': math.ceil,
    'round': lambda x, *a: float(round(x)), 'abs': abs, 'sqrt': math.sqrt, 'pow': pow,
}


def evaluate(node, name, call):
    """name(id) -> valor; call(fname, args) -> valor."""
    t = node[0]
    if t == 'n':
        return node[1]
    if t == 'id':
        return name(node[1])
    if t == 'u':
        x = evaluate(node[2], name, call)
        return -x if node[1] == '-' else (x if node[1] == '+' else float(not x))
    if t == '?':
        return evaluate(node[2], name, call) if evaluate(node[1], name, call) else evaluate(node[3], name, call)
    if t == 'call':
        f = node[1]
        args = [evaluate(a, name, call) for a in node[2]]
        b = BUILTIN.get(f.lower())
        if b and '.' not in f:
            return float(b(*args))
        return call(f, args)
    if t == 'b':
        op = node[1]
        a = evaluate(node[2], name, call)
        if op == '&&':
            return float(bool(a) and bool(evaluate(node[3], name, call)))
        if op == '||':
            return float(bool(a) or bool(evaluate(node[3], name, call)))
        b = evaluate(node[3], name, call)
        return {'+': lambda: a + b, '-': lambda: a - b, '*': lambda: a * b, '/': lambda: a / b if b else 0.0,
                '%': lambda: a % b if b else 0.0, '^': lambda: a ** b, '<': lambda: float(a < b), '>': lambda: float(a > b),
                '<=': lambda: float(a <= b), '>=': lambda: float(a >= b), '==': lambda: float(abs(a - b) < 1e-9),
                '!=': lambda: float(abs(a - b) >= 1e-9)}[op]()
    raise ValueError(t)


_parsed = {}


def parse(s):
    if s not in _parsed:
        _parsed[s] = Parser(s).parse()
    return _parsed[s]
