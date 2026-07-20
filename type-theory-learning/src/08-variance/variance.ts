// Variance demo.
//
// A type constructor `F` is:
//   - covariant    if  Sub(τ, σ)  implies  Sub(F<τ>, F<σ>)
//   - contravariant if  Sub(τ, σ)  implies  Sub(F<σ>, F<τ>)
//   - invariant    if  both directions hold
// Functions are contravariant in arguments, covariant in results.

export type Var = string;
export type Type = { kind: 'var'; name: Var } | { kind: 'fun'; param: Type; body: Type };

export type SubKind = 'covariant' | 'contravariant' | 'invariant' | 'phantom';

export interface FunInfo {
  paramVar: SubKind;
  bodyVar: SubKind;
}

/** `variance(op, type)` walks a type with respect to a chosen type-position. */
export function varianceAtPosition(op: 'funParam' | 'funBody', τ: Type): SubKind {
  if (τ.kind === 'var') return 'covariant';
  if (op === 'funParam') {
    // Position of funParam is contravariant because it's a producer of inputs.
    const bodyV = varianceAtPosition('funBody', τ.body);
    return bodyV; // the param position itself is contravariant to whatever it sees
  }
  return varianceAtPosition('funParam', τ.param);
}

/** Phantom types: a type variable never seen at the term level. */
export interface Box<T, Phantom extends string = 'none'> {
  value: T;
  readonly __phantom?: Phantom;
}

export const box = <T>(v: T): Box<T> => ({ value: v });
