// 无类型 lambda 演算表面语法的词法分析器与语法分析器。
//
//   t   ::=  λ x . t        （lambda，右结合）
//         | t t              （application，左结合）
//         | x | ( t )
//
// `lam` 也可以写成 `\`（ASCII 形式）。
//
// 文法：
//
//   expr   ::= lambda | app
//   lambda ::= 'λ' x '.' expr
//   app    ::= atom+
//   atom   ::= x | '(' expr ')'
//
// 顶层接受一个 expr 或一个带括号的 expr（其后还可接其他 atom
// 构成 application）。

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

  // 顶层表达式：lambda 或 app，但 (expr) 前缀之后还可接更多
  // atom 从而构成 application。我们在同一个例程中处理这两种情况。
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
