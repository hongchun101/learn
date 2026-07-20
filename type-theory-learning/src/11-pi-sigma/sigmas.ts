// Pi / Sigma modelling.
//
// A dependent function  Π (x : A). B(x)  is encoded as
// a TypeScript function  (x: A) => B(x)  with a phantom witness.

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

/** Witness type for `Σ x : Nat. Vec(x)` — encoded by hand here. */
export interface VecWitness {
  readonly n: number;
  readonly xs: ReadonlyArray<unknown>;
}

export const vecWitness = (n: number): VecWitness => ({ n, xs: Array.from({ length: n }) });

void pi;
