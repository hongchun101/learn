// STLC 表面语法的解析器。
//
//   t ::=  λ x : τ . t
//       | t t
//       | x
//       | true | false
//       | 0 | 1 | 2 | ... | succ t | iszero t
//
//   τ ::=  Bool | Nat | ( τ ) → τ | τ → τ
//
// 注意：
// - 箭头右结合（`τ → τ → τ` 应读作 `τ → (τ → τ)`）。
// - 前导的 `λ` 不会吞掉变量名；变量名是下一个 token。（紧凑形式——
//   教材标准写法是 `λx:τ.t`。）

import type { Term, Type, Var } from './ast';
import { app, bool, fun, iszero, lam, nat, num, succ, v, fls, tru } from './ast';

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

type Tok =
  | { kind: 'lam' }
  | { kind: 'dot' }
  | { kind: 'colon' }
  | { kind: 'arrow' }
  | { kind: 'lparen' }
  | { kind: 'rparen' }
  | { kind: 'kw'; name: 'true' | 'false' | 'Bool' | 'Nat' | 'succ' | 'iszero' }
  | { kind: 'var'; name: Var }
  | { kind: 'num'; value: number };

const KW = ['true', 'false', 'Bool', 'Nat', 'succ', 'iszero'] as const;
type Kw = (typeof KW)[number];

function tokenize(input: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i]!;
    if (c === ' ' || c === '\n' || c === '\t' || c === '\r') {
      i++;
      continue;
    }
    if (c === '(' || c === ')' || c === '.' || c === ':') {
      out.push({ kind: c === '(' ? 'lparen' : c === ')' ? 'rparen' : c === '.' ? 'dot' : 'colon' });
      i++;
      continue;
    }
    if (c === '\\' || c === 'λ') {
      out.push({ kind: 'lam' });
      i++;
      continue;
    }
    if (c === '-' && input[i + 1] === '>') {
      out.push({ kind: 'arrow' });
      i += 2;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < input.length && /[0-9]/.test(input[j]!)) j++;
      out.push({ kind: 'num', value: Number(input.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < input.length && /[A-Za-z0-9_]/.test(input[j]!)) j++;
      const word = input.slice(i, j);
      if ((KW as readonly string[]).includes(word)) {
        out.push({ kind: 'kw', name: word as Kw });
      } else {
        out.push({ kind: 'var', name: word });
      }
      i = j;
      continue;
    }
    throw new ParseError(`unexpected character '${c}' at ${i}`);
  }
  return out;
}

export function parse(input: string): Term {
  const tokens = tokenize(input);
  let p = 0;
  const peek = (): Tok | undefined => tokens[p];
  const eat = (): Tok => {
    const t = tokens[p];
    if (t === undefined) throw new ParseError('unexpected end of input');
    p++;
    return t;
  };

  function parseType(): Type {
    const tk = peek();
    if (tk && tk.kind === 'lparen') {
      eat();
      const t = parseArrow();
      const r = eat();
      if (r.kind !== 'rparen') throw new ParseError("expected ')'");
      return t;
    }
    return parseArrow();
  }

  function parseAtomType(): Type {
    const tk = peek();
    if (tk && tk.kind === 'kw' && tk.name === 'Bool') {
      eat();
      return bool;
    }
    if (tk && tk.kind === 'kw' && tk.name === 'Nat') {
      eat();
      return nat;
    }
    throw new ParseError(`expected type, got ${tk ? tkLabel(tk) : 'EOF'}`);
  }

  function parseArrow(): Type {
    let left = parseAtomType();
    while (peek() && peek()!.kind === 'arrow') {
      eat();
      const right = parseArrow();
      left = fun(left, right);
    }
    return left;
  }

  function parseAtom(): Term {
    const tk = peek();
    if (tk === undefined) throw new ParseError('unexpected end of input');
    if (tk.kind === 'var') {
      eat();
      return v(tk.name);
    }
    if (tk.kind === 'kw' && tk.name === 'true') {
      eat();
      return tru;
    }
    if (tk.kind === 'kw' && tk.name === 'false') {
      eat();
      return fls;
    }
    if (tk.kind === 'num') {
      eat();
      return num(tk.value);
    }
    if (tk.kind === 'lparen') {
      eat();
      const e = parseExpr();
      const r = eat();
      if (r.kind !== 'rparen') throw new ParseError("expected ')'");
      return e;
    }
    if (tk.kind === 'kw' && (tk.name === 'succ' || tk.name === 'iszero')) {
      const op = tk.name;
      eat();
      return op === 'succ' ? succ(parseAtom()) : iszero(parseAtom());
    }
    throw new ParseError(`unexpected token in atom: ${tkLabel(tk)}`);
  }

  function parseApp(): Term {
    let cur = parseAtom();
    while (peek()) {
      const k = peek()!.kind;
      if (k === 'var' || k === 'kw' || k === 'num' || k === 'lparen') {
        cur = app(cur, parseAtom());
      } else break;
    }
    return cur;
  }

  function parseLambda(): Term {
    eat(); // lam token
    const nameTk = eat();
    if (nameTk.kind !== 'var') throw new ParseError('expected variable after λ');
    const colon = eat();
    if (colon.kind !== 'colon') throw new ParseError("expected ':'");
    const paramType = parseType();
    const dot = eat();
    if (dot.kind !== 'dot') throw new ParseError("expected '.'");
    const body = parseExpr();
    return lam(nameTk.name, paramType, body);
  }

  function parseExpr(): Term {
    const head = peek();
    if (head && head.kind === 'lam') return parseLambda();
    return parseApp();
  }

  const t = parseExpr();
  if (p !== tokens.length) {
    throw new ParseError(`trailing input at token ${p}`);
  }
  return t;
}

function tkLabel(tk: Tok): string {
  switch (tk.kind) {
    case 'lam':
      return "'λ'";
    case 'dot':
      return "'.'";
    case 'colon':
      return "':'";
    case 'arrow':
      return "'->'";
    case 'lparen':
      return "'('";
    case 'rparen':
      return "')'";
    case 'kw':
      return tk.name;
    case 'var':
      return tk.name;
    case 'num':
      return String(tk.value);
  }
}
