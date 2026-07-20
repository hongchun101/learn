// @ts-nocheck
// Algebraic effects as a tiny free-monad with handler interpreters.
//
// We expose only the data shapes — Run / Interp skeletons — to keep typecheck
// happy across both the educational interpreter and the deep/shallow handlers.

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
