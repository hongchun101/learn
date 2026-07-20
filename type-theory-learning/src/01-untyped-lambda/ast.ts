// @ts-nocheck
// AST of the untyped lambda calculus (Chapter 01).
//
//   t ::= x | λx. t | t t
//
// `Term` is a small algebraic data type. Higher chapters (02 STLC, 06 System F,
// 11 Pi-types) extend this with type annotations and binders; the constructor
// names are deliberately stable.

export type Var = string;

export type Term =
  | { kind: 'var'; name: Var }
  | { kind: 'lam'; param: Var; body: Term }
  | { kind: 'app'; func: Term; arg: Term };

export const v = (name: Var): Term => ({ kind: 'var', name });
export const lam = (param: Var, body: Term): Term => ({ kind: 'lam', param, body });
export const app = (func: Term, arg: Term): Term => ({ kind: 'app', func, arg });

/** `pretty t` renders a `Term` back to a readable lambda term. */
export function pretty(t: Term): string {
  switch (t.kind) {
    case 'var':
      return t.name;
    case 'lam': {
      const body = pretty(t.body);
      // Drop body parens when it's a var or another abstraction.
      const wrap =
        t.body.kind === 'app' || t.body.kind === 'lam';
      return `λ${t.param}.${wrap ? body : body}`;
    }
    case 'app': {
      const f = t.func.kind === 'lam' ? `(${pretty(t.func)})` : pretty(t.func);
      const a = t.arg.kind === 'app' ? `(${pretty(t.arg)})` : pretty(t.arg);
      return `${f} ${a}`;
    }
  }
}

/** Structural equality. */
export function equal(a: Term, b: Term): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'var':
      return a.name === b.name;
    case 'lam':
      return a.param === b.param && equal(a.body, b.body);
    case 'app':
      return equal(a.func, b.func) && equal(a.arg, b.arg);
  }
}
