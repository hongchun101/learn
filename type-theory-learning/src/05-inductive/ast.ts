// Recursive / coinductive types.
//
//   μ α. τ            (least fixed-point — inductive)
//   ν α. τ            (greatest fixed-point — coinductive)
//
// Folding:  fold : ∀X. (F X → X) → μ α. F α → X
// Unfolding: unfold : μ α. F α → F (μ α. F α)

import type { Type, Var } from '../04-adt/ast';

export type RecType =
  | { kind: 'mu'; var: Var; body: Type }
  | { kind: 'nu'; var: Var; body: Type };

export type RecTerm<Term> =
  | { kind: 'fold'; type: RecType; of: Term; into: Term }
  | { kind: 'unfold'; type: RecType; of: Term };

export const mu = (v: Var, body: Type): RecType => ({ kind: 'mu', var: v, body });
export const nu = (v: Var, body: Type): RecType => ({ kind: 'nu', var: v, body });

/** Pretty-print a recursive type. */
export function prettyRec(r: RecType): string {
  if (r.kind === 'mu') return `μ ${r.var}.${formatType(r.body)}`;
  return `ν ${r.var}.${formatType(r.body)}`;
}

function formatType(t: Type): string {
  if (t.kind === 'bool') return 'Bool';
  if (t.kind === 'nat') return 'Nat';
  if (t.kind === 'fun') return `((${formatType(t.param)}) → ${formatType(t.body)})`;
  if (t.kind === 'pair') return `(${formatType(t.left)} × ${formatType(t.right)})`;
  if (t.kind === 'sum') return `(${formatType(t.left)} + ${formatType(t.right)})`;
  if (t.kind === 'record') return `{${t.fields.map(([k, v]) => `${k}: ${formatType(v)}`).join(', ')}}`;
  return `<${t.alts.map(([k, v]) => `${k}: ${formatType(v)}`).join(', ')}>`;
}
