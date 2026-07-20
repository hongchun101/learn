// Lexer + parser for the surface syntax of the untyped lambda calculus.
//
//   t   ::=  λ x . t        (lambda, right-assoc)
//         | t t              (application, left-assoc)
//         | x | ( t )
//
// `lam` may also be written as `\` (ASCII).
//
// Grammar:
//
//   expr   ::= lambda | app
//   lambda ::= 'λ' x '.' expr
//   app    ::= atom+
//   atom   ::= x | '(' expr ')'
//
// Top level accepts an expr or a parenthesised expr (which may be followed by
// further atoms forming an application).

import type { Term, Var } from './ast';
import { app, lam, v } from './ast';

type Tok =
  | { kind: 'lam'; name: Var }
  | { kind: 'var'; name: Var }
  | { kind: 'lparen' }
  | { kind: 'rparen' }
  | { kind: 'dot' };

function isIdentChar(c: string): boolean {
  return /[A-Za-z0-9_']/.test(c);
}

function tokenize(input: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i]!;
    if (c === ' ' || c === '\n' || c === '\t' || c === '\r') {
      i++;
      continue;
    }
    if (c === '(') {
      out.push({ kind: 'lparen' });
      i++;
      continue;
    }
    if (c === ')') {
      out.push({ kind: 'rparen' });
      i++;
      continue;
    }
    if (c === '.') {
      out.push({ kind: 'dot' });
      i++;
      continue;
    }
    if (c === '\\' || c === 'λ') {
      i++;
      let j = i;
      while (j < input.length && isIdentChar(input[j]!)) j++;
      if (i === j) throw new Error(`expected variable after \\ at ${i}`);
      out.push({ kind: 'lam', name: input.slice(i, j) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < input.length && isIdentChar(input[j]!)) j++;
      out.push({ kind: 'var', name: input.slice(i, j) });
      i = j;
      continue;
    }
    throw new Error(`unexpected character '${c}' at ${i}`);
  }
  return out;
}

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

export function parse(input: string): Term {
  const tokens = tokenize(input);
  let p = 0;
  const peek = (): Tok | undefined => tokens[p];
  const eat = (): Tok => {
    const tk = tokens[p];
    if (tk === undefined) throw new ParseError('unexpected end of input');
    p++;
    return tk;
  };

  function parseAtom(): Term {
    const tk = peek();
    if (tk === undefined) throw new ParseError('unexpected end of input');
    if (tk.kind === 'var') {
      eat();
      return v(tk.name);
    }
    if (tk.kind === 'lparen') {
      eat();
      const e = parseExpr();
      const r = eat();
      if (r.kind !== 'rparen') throw new ParseError("expected ')'");
      return e;
    }
    throw new ParseError(`unexpected token in atom: ${tk.kind}`);
  }

  function parseApp(): Term {
    let cur = parseAtom();
    while (true) {
      const tk = peek();
      if (tk === undefined) break;
      if (tk.kind !== 'var' && tk.kind !== 'lparen') break;
      cur = app(cur, parseAtom());
    }
    return cur;
  }

  function parseLambda(): Term {
    const head = eat();
    if (head.kind !== 'lam') throw new ParseError('expected λ');
    const dot = eat();
    if (dot.kind !== 'dot') throw new ParseError("expected '.' after λx");
    const body = parseExpr();
    return lam(head.name, body);
  }

  // Top-level expression: lambda OR app, but a (expr)-prefix may also be followed
  // by more atoms, forming an application. We handle both cases in one routine.
  function parseExpr(): Term {
    const head = peek();
    if (head === undefined) throw new ParseError('unexpected end of input');
    if (head.kind === 'lam') return parseLambda();
    return parseApp();
  }

  const t = parseExpr();
  if (p !== tokens.length) {
    throw new ParseError(`trailing input at token ${p}: ${JSON.stringify(tokens[p])}`);
  }
  return t;
}
