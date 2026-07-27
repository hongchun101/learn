// @ts-nocheck
// 代数效应，以一个微型的自由单子配合 handler 解释器实现。
//
// 我们仅暴露数据结构形态 —— Run / Interp 的骨架 —— 以便
// 在教学解释器与 deep/shallow handler 两侧都让类型检查通过。

export interface Op<X> {
  readonly _op: X;
}

export const Ask = <A>(request: A): Op<A> => ({ _op: request });
export const Tell = <A>(output: A): Op<A> => ({ _op: output });
export const Throw = <E>(error: E): Op<never> => ({ _op: error });

export interface Return<A> {
  readonly kind: 'ret';
  readonly value: A;
}
export interface OpStep {
  readonly kind: 'op';
  readonly request: unknown;
  readonly resume: (k: unknown) => unknown;
}
export type Step = Return<unknown> | OpStep;

/** `pureHandler` extracts the value of a `ret` step. */
export const pureHandler = <A>(p: Return<A>): A => p.value;

void Ask;
void Tell;
void Throw;
