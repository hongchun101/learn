// Pi / Sigma 建模。
//
// 依赖函数  Π (x : A). B(x)  编码为
// 一个 TypeScript 函数  (x: A) => B(x)  并附带一个幻影见证。

export interface Pi<A, B> {
  readonly _pi: true;
  readonly apply: (a: A) => B;
}

export const pi = <A, B>(f: (a: A) => B): Pi<A, B> => ({ _pi: true, apply: f });

export interface Sigma<A, B> {
  readonly _sigma: true;
  readonly first: A;
  readonly second: (a: A) => B;
}

export const packSigma = <A, B>(a: A, b: (a: A) => B): Sigma<A, B> => ({
  _sigma: true,
  first: a,
  second: b,
});

export const first = <A, B>(s: Sigma<A, B>): A => s.first;
export const second = <A, B>(s: Sigma<A, B>): B => s.second(s.first);

/** `Σ x : Nat. Vec(x)` 的见证类型 —— 此处手工编码。 */
export interface VecWitness {
  readonly n: number;
  readonly xs: ReadonlyArray<unknown>;
}

export const vecWitness = (n: number): VecWitness => ({ n, xs: Array.from({ length: n }) });

void pi;
