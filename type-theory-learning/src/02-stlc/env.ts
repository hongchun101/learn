// @ts-nocheck
// Typed environments and ℋ / Type equality for STLC.

import type { Term, Type, Var } from './ast';

/** A type environment maps variables to types. */
export interface Env {
  bindings: Record<Var, Type>;
}

export const emptyEnv: Env = { bindings: {} };

export function extend(env: Env, x: Var, τ: Type): Env {
  return { bindings: { ...env.bindings, [x]: τ } };
}

export function lookup(env: Env, x: Var): Type | undefined {
  return env.bindings[x];
}

/** `typeEq` — structural type equality. */
export function typeEq(a: Type, b: Type): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'bool':
    case 'nat':
      return true;
    case 'fun':
      return typeEq(a.param, b.param) && typeEq(a.body, b.body);
  }
}

/** Free variables of a term. */
export function free(t: Term): Set<Var> {
  const out = new Set<Var>();
  go(t);
  return out;
  function go(u: Term): void {
    switch (u.kind) {
      case 'var':
        out.add(u.name);
        return;
      case 'lam':
        if (!out.has(u.param)) go(u.body);
        return;
      case 'app':
        go(u.func);
        go(u.arg);
        return;
      case 'true':
      case 'false':
      case 'nat':
        return;
      case 'succ':
      case 'iszero':
        go(u.expr);
        return;
    }
  }
}
