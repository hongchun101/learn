// 一个微型的 Liquid 风格精化类型。
//
//   { ν : Int | ν > 0 }         —— 正整数
//   { ν : Int | 0 ≤ ν < 100 }   —— 有界范围
//
// 我们用一个运行时函数来建模谓词；类型由 `{ base, pred }` 描述。

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

/** 隐式：pos 是 nat 的子类型。 */
export const forget = <A extends number>(r: Refined<number, A>): number => r.value;
