// Big-step interpreter for STLC.
//
//   (λx:τ1. t2) t1   ──→   [x ↦ t1] t2
//
// Naive substitution (capture-avoiding) on the typed AST.

import type { Term, Var } from './ast';
import { v } from './ast';
import { free } from './env';

export class Stuck extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Stuck';
  }
}

/** Rename bound name `name` to `fresh` everywhere it appears in `t`. */
function rename(name: Var, fresh: Var, t: Term): Term {
  switch (t.kind) {
    case 'var':
      return t.name === name ? v(fresh) : t;
    case 'lam':
      return {
        kind: 'lam',
        param: t.param === name ? fresh : t.param,
        paramType: t.paramType,
        body: rename(name, fresh, t.body),
      };
    case 'app':
      return {
        kind: 'app',
        func: rename(name, fresh, t.func),
        arg: rename(name, fresh, t.arg),
      };
    case 'true':
    case 'false':
    case 'nat':
      return t;
    case 'succ':
      return { kind: 'succ', expr: rename(name, fresh, t.expr) };
    case 'iszero':
      return { kind: 'iszero', expr: rename(name, fresh, t.expr) };
  }
}

/** Substs `name ↦ s` into `t`, capture-avoiding. */
export function subst(name: Var, s: Term, t: Term): Term {
  switch (t.kind) {
    case 'var':
      return t.name === name ? s : t;
    case 'lam': {
      if (t.param === name) return t;
      const freeS = free(s);
      if (freeS.has(t.param)) {
        const fresh = freshN(t.param, [...free(t.body), ...freeS]);
        const renamed = rename(t.param, fresh, t.body);
        return { kind: 'lam', param: fresh, paramType: t.paramType, body: subst(name, s, renamed) };
      }
      return { kind: 'lam', param: t.param, paramType: t.paramType, body: subst(name, s, t.body) };
    }
    case 'app':
      return { kind: 'app', func: subst(name, s, t.func), arg: subst(name, s, t.arg) };
    case 'true':
    case 'false':
    case 'nat':
      return t;
    case 'succ':
      return { kind: 'succ', expr: subst(name, s, t.expr) };
    case 'iszero':
      return { kind: 'iszero', expr: subst(name, s, t.expr) };
  }
}

function freshN(base: Var, avoid: ReadonlyArray<Var>): Var {
  let n = 0;
  let cand = base;
  const set = new Set(avoid);
  while (set.has(cand)) cand = `${base}${n++}`;
  return cand;
}

/** `eval t` returns `t` in canonical form (a value) under big-step semantics. */
export function evalT(t: Term): Term {
  switch (t.kind) {
    case 'true':
    case 'false':
    case 'nat':
    case 'lam':
      return t;
    case 'var':
      throw new Stuck(`free variable at eval time: ${t.name}`);
    case 'app': {
      const f = evalT(t.func);
      if (f.kind !== 'lam') throw new Stuck(`app of non-function: ${f.kind}`);
      const a = evalT(t.arg);
      return evalT(subst(f.param, a, f.body));
    }
    case 'succ': {
      const e = evalT(t.expr);
      if (e.kind !== 'nat') throw new Stuck(`succ of non-nat: ${e.kind}`);
      return { kind: 'nat', value: e.value + 1 };
    }
    case 'iszero': {
      const e = evalT(t.expr);
      if (e.kind !== 'nat') throw new Stuck(`iszero of non-nat`);
      return e.value === 0 ? { kind: 'true' } : { kind: 'false' };
    }
  }
}

/** `isValue` — values are abstractions, lambdas, booleans, naturals. */
export function isValue(t: Term): boolean {
  return t.kind === 'lam' || t.kind === 'true' || t.kind === 'false' || t.kind === 'nat';
}
