// @ts-nocheck
// 类型族 —— 在类型上的"编译期函数"。

export type Family<A, B> = {
  readonly f: (a: A, b: B) => A;
};

export const composeFamily =
  <A, B, C>(g: Family<B, C>, f: Family<A, B>): Family<A, C> => ({
    f: (a, c) => f.f(g.f(a as unknown as B, c), c),
  });

void composeFamily;
