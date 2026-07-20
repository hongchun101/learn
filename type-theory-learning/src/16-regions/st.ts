// @ts-nocheck
// ST monad with branded regions.
//
//   ST<S, A>     = computation allocating in region S, returning A
//   runST :: ∀S. (∀s. ST<s, A>) -> A     (rank-2 polymorphism)
//
// We approximate the rank-2 polymorphism with a private token type.

declare const s: unique symbol;
export type Region = typeof s;
export const freshRegion = (): Region => Symbol('region');

export interface ST<S, A> {
  readonly _tag: 'st';
  readonly run: () => A;
}

export const returnST = <S, A>(value: A): ST<S, A> => ({
  _tag: 'st',
  run: () => value,
});

export const bindST =
  <S, A>(m: ST<S, A>) =>
  <B>(k: (a: A) => ST<S, B>): ST<S, B> => ({
    _tag: 'st',
    run: () => k(m.run()).run(),
  });

export const mapST =
  <S, A>(m: ST<S, A>) =>
  <B>(f: (a: A) => B): ST<S, B> =>
    bindST(m)((a) => returnST(f(a)));

export function runST<A>(m: ST<never, A>): A {
  return m.run();
}
