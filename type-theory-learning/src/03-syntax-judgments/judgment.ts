// @ts-nocheck
// 把自然演绎作为一种数据类型。
//
//   Γ ⊢ t : τ            （"在 Γ 之下，t 具有类型 τ"）
//
// 一条规则拥有若干前提（要被消除的判断式）和一个结论。
// 证明树是若干规则应用的（可能为空的）列表。

import type { Type } from '../02-stlc/ast';

export interface Judgment {
  /** 一些不透明的结构；默认情况下结论为 "t : τ in env"。 */
  readonly kind: 'hasType';
  readonly env: ReadonlyArray<readonly [string, Type]>;
  readonly term: string;
  readonly type: Type;
}

export interface Rule<P extends string = string> {
  readonly name: string;
  readonly premises: ReadonlyArray<Judgment>;
  readonly conclusion: Judgment;
  /** 所用参数集合的标签；允许检查器要求特定的形态。 */
  readonly paramTag?: P;
}

export interface ProofTree {
  rule: Rule;
  subProofs: ProofTree[];
}

/** 美化输出一个判断式：`x:Bool, y:Nat ⊢ t : Bool → Bool`。 */
export function formatJ(j: Judgment): string {
  const env = j.env.map(([x, τ]) => `${x}:${τStr(τ)}`).join(', ');
  return `${env} ⊢ ${j.term} : ${τStr(j.type)}`;
}

function τStr(τ: Type): string {
  if (τ.kind === 'bool') return 'Bool';
  if (τ.kind === 'nat') return 'Nat';
  if (τ.kind === 'fun') return `(${τStr(τ.param)} → ${τStr(τ.body)})`;
  return τ.kind;
}
