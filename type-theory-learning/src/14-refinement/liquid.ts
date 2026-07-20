// Tiny Liquid-style refinement types.
//
//   { ν : Int | ν > 0 }         — positive integers
//   { ν : Int | 0 ≤ ν < 100 }   — bounded
//
// We model the predicate with a runtime function; the type is described by
// `{ base, pred }`.

export interface Refined<B, A extends B = B> {
  readonly value: A;
  readonly base: B;
  readonly pred: (a: A) => boolean;
}

export const refined = <B, A extends B>(value: A, pred: (a: A) => boolean): Refined<B, A> => {
  if (!pred(value)) throw new Error('refinement predicate failed');
  return { value, base: value, pred };
};

export const positive = (n: number): Refined<number, number> =>
  refined(n, (x) => x > 0);

export const bounded = (n: number, lo: number, hi: number): Refined<number, number> =>
  refined(n, (x) => x >= lo && x < hi);

/** Implicit: pos → nat (subtype). */
export const forget = <A extends number>(r: Refined<number, A>): number => r.value;
