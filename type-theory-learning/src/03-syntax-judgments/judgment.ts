// @ts-nocheck
// Natural deduction as a data type.
//
//   Γ ⊢ t : τ            ("under Γ, t has type τ")
//
// A rule has premises (judgments to be discharged) and a conclusion. A
// proof tree is a (possibly empty) list of rule applications.

import type { Type } from '../02-stlc/ast';

export interface Judgment {
  /** Some opaque structure; by default the conclusion is "t : τ in env". */
  readonly kind: 'hasType';
  readonly env: ReadonlyArray<readonly [string, Type]>;
  readonly term: string;
  readonly type: Type;
}

export interface Rule<P extends string = string> {
  readonly name: string;
  readonly premises: ReadonlyArray<Judgment>;
  readonly conclusion: Judgment;
  /** Tag for the parameter set used; lets a checker demand a specific shape. */
  readonly paramTag?: P;
}

export interface ProofTree {
  rule: Rule;
  subProofs: ProofTree[];
}

/** Pretty-print a judgment: `x:Bool, y:Nat ⊢ t : Bool → Bool`. */
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
