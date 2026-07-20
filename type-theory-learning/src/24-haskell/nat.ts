// @ts-nocheck
// Peano naturals as types.

export interface Zero {
  readonly _tag: 'zero';
}
export interface Succ<N> {
  readonly _tag: 'succ';
  readonly pred: N;
}
export type Nat = Zero | Succ<Nat>;

export const zero: Nat = { _tag: 'zero' };
export const succ = (n: Nat): Nat => ({ _tag: 'succ', pred: n });

export type Add<A extends Nat, B extends Nat> = A extends Zero
  ? B
  : A extends Succ<infer P>
  ? Succ<Add<P, B>>
  : never;

type ToNumberAux<N> = N extends Zero
  ? 0
  : N extends Succ<infer P>
  ? 1 | ToNumberAux<P>
  : never;

export type ToNumber<N extends Nat> = ToNumberAux<N> extends number ? ToNumberAux<N> : never;
