// @ts-nocheck
// Small-step β-reducer and normal-order / call-by-value evaluators.
//
//   (λx. t1) t2   ──β→   [x ↦ t2] t1
//
// `evalNormalOrder` does head-spine β-reduction: it descends into the
// function-of-app to look for the leftmost-outermost β-redex, then fires.
// Terminates on simply-typed terms and on Church encodings (which are typed
// inside the encoding). Loops forever on Ω; `fuel` detects that.
//
// `evalCBV` does call-by-value single-step recursion (used in Ch17, and in
// later chapters for ML-style semantics).

import type { Term } from './ast';
import { lam } from './ast';
import { free, subst } from './subst';

export class NonNormalizable extends Error {
  constructor() {
    super('term did not reach a normal form within the given fuel');
    this.name = 'NonNormalizable';
  }
}

/** `isValue t` — in pure λ-calculus values are exactly abstractions. */
export function isValue(t: Term): boolean {
  return t.kind === 'lam';
}

/** `isRedex(t)` — is `t` a β-redex `app(lam, _)` ? */
export function isRedex(t: Term): boolean {
  return t.kind === 'app' && t.func.kind === 'lam';
}

/** Single leftmost-outermost β step. Returns the term unchanged if irreducible. */
function stepOnce(t: Term): Term {
  switch (t.kind) {
    case 'var':
      return t;
    case 'lam': {
      const b = stepOnce(t.body);
      return b === t.body ? t : lam(t.param, b);
    }
    case 'app': {
      const f = stepOnce(t.func);
      if (f.kind === 'lam') return subst(f.param, t.arg, f.body);
      const a = stepOnce(t.arg);
      if (a !== t.arg) return { kind: 'app', func: f, arg: a };
      if (f !== t.func) return { kind: 'app', func: f, arg: t.arg };
      return t;
    }
  }
}

/** Normal-order evaluator. Throws `NonNormalizable` if fuel exhausted. */
export function evalNormalOrder(t: Term, fuel = 1000): Term {
  let cur = t;
  for (let i = 0; i < fuel; i++) {
    const next = stepOnce(cur);
    if (next === cur) return cur;
    cur = next;
  }
  throw new NonNormalizable();
}

/** Public `step` — exposed for tests. */
export function step(t: Term): Term {
  return stepOnce(t);
}

/** Single CBV step: reduce args before functions, never step under λ. */
export function stepCBV(t: Term): Term {
  if (t.kind !== 'app') return t;
  // If the function isn't yet a value, reduce it.
  if (!isValue(t.func)) {
    return { kind: 'app', func: stepCBV(t.func), arg: t.arg };
  }
  // If the argument isn't yet a value (and not a bare variable), reduce it.
  if (t.arg.kind !== 'var' && !isValue(t.arg)) {
    return { kind: 'app', func: t.func, arg: stepCBV(t.arg) };
  }
  return subst(t.func.param, t.arg, t.func.body);
}

/** `evalCBV` reduces `t` to a value in call-by-value order. */
export function evalCBV(t: Term, fuel = 1000): Term {
  let cur = t;
  for (let i = 0; i < fuel; i++) {
    if (cur.kind !== 'app') return cur;
    if (isValue(cur.func) && isValue(cur.arg)) {
      cur = subst(cur.func.param, cur.arg, cur.func.body);
      continue;
    }
    cur = stepCBV(cur);
  }
  throw new NonNormalizable();
}

/** `freeVars` re-export. */
export const freeVars = free;
