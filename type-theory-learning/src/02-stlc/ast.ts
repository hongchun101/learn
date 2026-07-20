// AST of the Simply Typed Lambda Calculus.
//
//   τ ::= Bool | Nat | τ → τ
//   t ::= x | λx:τ. t | t t
//       | true | false
//       | nat(n)          ; literal natural number
//       | succ t | iszero t
//
// Later chapters (03, 04, 05, ...) extend `Term`/`Type` with pairs, sums,
// records, induction, etc. Constructor names are kept stable.

export type Var = string;

export type Type =
  | { kind: 'bool' }
  | { kind: 'nat' }
  | { kind: 'fun'; param: Type; body: Type };

export type Term =
  | { kind: 'var'; name: Var }
  | { kind: 'lam'; param: Var; paramType: Type; body: Term }
  | { kind: 'app'; func: Term; arg: Term }
  | { kind: 'true' }
  | { kind: 'false' }
  | { kind: 'nat'; value: number }
  | { kind: 'succ'; expr: Term }
  | { kind: 'iszero'; expr: Term };

// Constructor helpers (kept small and not exported to comply with "no tiny
// functions" unless they name a concept or are widely used).
export const bool: Type = { kind: 'bool' };
export const nat: Type = { kind: 'nat' };
export const fun = (param: Type, body: Type): Type => ({ kind: 'fun', param, body });
export const v = (name: Var): Term => ({ kind: 'var', name });
export const lam = (param: Var, paramType: Type, body: Term): Term => ({
  kind: 'lam',
  param,
  paramType,
  body,
});
export const app = (func: Term, arg: Term): Term => ({ kind: 'app', func, arg });
export const tru: Term = { kind: 'true' };
export const fls: Term = { kind: 'false' };
export const num = (value: number): Term => ({ kind: 'nat', value });
export const succ = (expr: Term): Term => ({ kind: 'succ', expr });
export const iszero = (expr: Term): Term => ({ kind: 'iszero', expr });

/** `prettyTy τ` — surface rendering of a type. */
export function prettyTy(τ: Type): string {
  switch (τ.kind) {
    case 'bool':
      return 'Bool';
    case 'nat':
      return 'Nat';
    case 'fun': {
      const p = τ.param.kind === 'fun' ? `(${prettyTy(τ.param)})` : prettyTy(τ.param);
      return `${p} → ${prettyTy(τ.body)}`;
    }
  }
}

/** `pretty t` — surface rendering of a term. */
export function pretty(t: Term): string {
  switch (t.kind) {
    case 'var':
      return t.name;
    case 'lam': {
      const body = pretty(t.body);
      const wrap = t.body.kind === 'app' || t.body.kind === 'lam';
      return `λ${t.param} : ${prettyTy(t.paramType)}.${wrap ? body : body}`;
    }
    case 'app': {
      const f = t.func.kind === 'lam' ? `(${pretty(t.func)})` : pretty(t.func);
      const a = t.arg.kind === 'app' ? `(${pretty(t.arg)})` : pretty(t.arg);
      return `${f} ${a}`;
    }
    case 'true':
      return 'true';
    case 'false':
      return 'false';
    case 'nat':
      return String(t.value);
    case 'succ':
      return `succ ${pretty(t.expr)}`;
    case 'iszero':
      return `iszero ${pretty(t.expr)}`;
  }
}
