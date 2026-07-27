// @ts-nocheck
// ST 单子，带区域标记。
//
//   ST<S, A>     = 在区域 S 中分配、返回 A 的计算
//   runST :: ∀S. (∀s. ST<s, A>) -> A     （rank-2 多态）
//
// 我们用一个私有 token 类型来近似 rank-2 多态。

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
