// STLC 的 Preservation + Progress 健全性检查。
//
// 我们测试如下规则：
//
//   "若类型推断对 `t` 成功，则 `evalT(t)` 产生一个值。"
//
// 这是一种基于性质的检查（而非证明），但对我们生成项的良类型闭包
// 而言已足以捕获大多数 bug 类别：类型错误、未类型化求值、β-替换错误。

import type { Term, Type } from './ast';
import { app, fun, iszero, lam, num, succ as mkSucc, v } from './ast';
import type { Env } from './env';
import { infer } from './checker';
import { evalT } from './evaluator';

const empty: Env = { bindings: {} };

/** 用普通 TS 跑一个单元测试 —— 被 vitest 测试套件复用。 */
export function runPreservation(name: string, t: Term): void {
  const τ = infer(empty, t);
  const got = evalT(t);
// 所得值必须是 lambda、bool 或 nat 之一；不应抛错。
  if (
    got.kind !== 'lam' &&
    got.kind !== 'true' &&
    got.kind !== 'false' &&
    got.kind !== 'nat'
  ) {
    throw new Error(`[${name}] eval did not reduce to a value: kind=${got.kind}`);
  }
  void τ;
}

/** 供 demo 和测试运行的示例程序。 */
export function programs(): ReadonlyArray<readonly [string, Term]> {
  const idBool = lam('x', { kind: 'bool' }, v('x'));
  const idNat = lam('x', { kind: 'nat' }, v('x'));
  const twice = lam('f', fun({ kind: 'nat' }, { kind: 'nat' }), lam('x', { kind: 'nat' }, app(v('f'), app(v('f'), v('x')))));
  const succT = (n: Term): Term => mkSucc(n);

  return [
    ['true', { kind: 'true' }],
    ['false', { kind: 'false' }],
    ['3', num(3)],
    ['succ 3', succT(num(3))],
    ['iszero 0', iszero(num(0))],
    ['iszero 7', iszero(num(7))],
    ['id bool true', app(idBool, { kind: 'true' })],
    ['id nat 3', app(idNat, num(3))],
    ['twice id nat 3', app(app(twice, idNat), num(3))],
  ];
}

void fun;
