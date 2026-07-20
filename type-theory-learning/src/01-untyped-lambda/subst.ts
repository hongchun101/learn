// Capture-avoiding substitution and free-variable machinery for lambda calculus.
//
//   [x ↦ s] t       (substitution)
//   FV(t)           (free variables)
//
// We rename binders on substitution to keep α-equivalence implicit and prevent
// shadowing bugs.

import type { Term, Var } from './ast';
import { lam, v } from './ast';

/** Rename a variable `name` to `fresh` everywhere it appears in `t`. */
function rename(name: Var, fresh: Var, t: Term): Term {
  switch (t.kind) {
    case 'var':
      return t.name === name ? v(fresh) : t;
    case 'lam':
      return lam(t.param === name ? fresh : t.param, rename(name, fresh, t.body));
    case 'app':
      return {
        kind: 'app',
        func: rename(name, fresh, t.func),
        arg: rename(name, fresh, t.arg),
      };
  }
}

/** `free(t)` returns the set of free variables in `t`. */
export function free(t: Term): Set<Var> {
  switch (t.kind) {
    case 'var':
      return new Set([t.name]);
    case 'lam': {
      const s = free(t.body);
      s.delete(t.param);
      return s;
    }
    case 'app': {
      const a = free(t.func);
      for (const x of free(t.arg)) a.add(x);
      return a;
    }
  }
}

/** Generate a name not in `avoid` by suffixing digits. */
export function freshName(base: Var, avoid: ReadonlySet<Var>): Var {
  let n = 0;
  let candidate = base;
  while (avoid.has(candidate)) {
    candidate = `${base}${n++}`;
  }
  return candidate;
}

/**
 * `subst(x, s, t)` is the capture-avoiding substitution `[x ↦ s] t`.
 *
 * We rename the binder when needed: if a binder in `t` clashes with a free
 * variable of `s`, the fresh binder is reused inside `t`'s body.
 */
export function subst(x: Var, s: Term, t: Term): Term {
  switch (t.kind) {
    case 'var':
      return t.name === x ? s : t;
    case 'lam': {
      if (t.param === x) {
        return t;
      }
      const fvS = free(s);
      if (fvS.has(t.param)) {
        const fresh = freshName(t.param, new Set([...free(t.body), ...fvS]));
        const renamed = rename(t.param, fresh, t.body);
        return lam(fresh, subst(x, s, renamed));
      }
      return lam(t.param, subst(x, s, t.body));
    }
    case 'app':
      return {
        kind: 'app',
        func: subst(x, s, t.func),
        arg: subst(x, s, t.arg),
      };
  }
}

/**
 * `alphaEq(a, b)` ≡ a ≡_α b. Compares two terms up to binder renaming.
 * At every binder pair we choose a fresh name not yet used and bind both
 * variables to it; the comparison then runs through children using a map.
 */
export function alphaEq(a: Term, b: Term): boolean {
  const leftToFresh = new Map<Var, Var>();
  const rightToFresh = new Map<Var, Var>();
  return go(a, b);

  function go(ta: Term, tb: Term): boolean {
    if (ta.kind === 'var' && tb.kind === 'var') {
      return (leftToFresh.get(ta.name) ?? ta.name) === (rightToFresh.get(tb.name) ?? tb.name);
    }
    if (ta.kind === 'lam' && tb.kind === 'lam') {
      const used = new Set<Var>([
        ...Array.from(leftToFresh.values()),
        ...Array.from(rightToFresh.values()),
      ]);
      const fresh = freshName(ta.param, used);
      leftToFresh.set(ta.param, fresh);
      rightToFresh.set(tb.param, fresh);
      const r = go(ta.body, tb.body);
      leftToFresh.delete(ta.param);
      rightToFresh.delete(tb.param);
      return r;
    }
    if (ta.kind === 'app' && tb.kind === 'app') {
      return go(ta.func, tb.func) && go(ta.arg, tb.arg);
    }
    return false;
  }
}
