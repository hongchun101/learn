// STLC 的双向类型检查器。
//
// 两个判断式：
//
//   Γ ⊢ t ⇒ τ    （synthesize：推导出类型）
//   Γ ⊢ t ⇐ τ    （check against：调用方已知类型，返回相同类型）
//
// `check` 返回类型（即所期望的类型），以便调用者链式调用。

import type { Term, Type, Var } from './ast';
import type { Env } from './env';
import { extend, lookup, typeEq } from './env';

export class TypeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TypeError';
  }
}

/** `infer Γ t` — 为 `t` 综合（synthesize）一个类型。若无法综合则抛出 `TypeError`。 */
export function infer(env: Env, t: Term): Type {
  switch (t.kind) {
    case 'var': {
      const τ = lookup(env, t.name);
      if (τ === undefined) throw new TypeError(`unbound variable ${t.name}`);
      return τ;
    }
    case 'lam': {
      const τ1 = t.paramType;
      const τ2 = check(extend(env, t.param, τ1), t.body, τ1);
      return { kind: 'fun', param: τ1, body: τ2 };
    }
    case 'app': {
      const τ1 = infer(env, t.func);
      if (τ1.kind !== 'fun') throw new TypeError(`non-function in app position: ${τ1.kind}`);
      check(env, t.arg, τ1.param);
      return τ1.body;
    }
    case 'true':
    case 'false':
      return { kind: 'bool' };
    case 'nat':
      return { kind: 'nat' };
    case 'succ':
      check(env, t.expr, { kind: 'nat' });
      return { kind: 'nat' };
    case 'iszero':
      check(env, t.expr, { kind: 'nat' });
      return { kind: 'bool' };
  }
}

/** `check Γ t τ` — 在期望类型 `τ` 下对 `t` 进行类型检查，并返回该类型。 */
export function check(env: Env, t: Term, τ: Type): Type {
  switch (t.kind) {
    case 'lam': {
      if (τ.kind !== 'fun') throw new TypeError(`expected ${typeStr(τ)} for λ, got function`);
      if (!typeEq(t.paramType, τ.param)) {
        throw new TypeError(`param type mismatch: ${typeStr(t.paramType)} vs ${typeStr(τ.param)}`);
      }
      const τ2 = check(extend(env, t.param, τ.param), t.body, τ.body);
      void τ2;
      return τ;
    }
    case 'app':
    case 'true':
    case 'false':
    case 'nat':
    case 'succ':
    case 'iszero':
    case 'var': {
      const τ2 = infer(env, t);
      if (!typeEq(τ, τ2)) {
        throw new TypeError(`expected ${typeStr(τ)} but got ${typeStr(τ2)}`);
      }
      return τ;
    }
  }
}

function typeStr(τ: Type): string {
  switch (τ.kind) {
    case 'bool':
      return 'Bool';
    case 'nat':
      return 'Nat';
    case 'fun':
      return `(${typeStr(τ.param)} → ${typeStr(τ.body)})`;
  }
}

/** 便捷函数：进行类型检查并返回类型。 */
export function checkProgram(t: Term, τ: Type): Type {
  return check({ bindings: {} }, t, τ);
}

/** `inferProgram t` — 顶层类型综合（尝试推导类型）。 */
export function inferProgram(t: Term): Type {
  return infer({ bindings: {} }, t);
}
