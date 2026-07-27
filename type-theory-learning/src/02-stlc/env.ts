// @ts-nocheck
// STLC 的类型化环境与类型等价（typeEq）。

import type { Term, Type, Var } from './ast';

/** 类型环境将变量映射到类型。 */
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

/** `typeEq` — 结构化的类型相等。 */
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

/** 项的自由变量。 */
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
