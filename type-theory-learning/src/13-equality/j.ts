// Martin-Löf identity type as a deep runtime check.
//
// We do not have access to a real prover; this chapter demonstrates the
// *interface* of the J eliminator and `transport`.

export interface Eq<A, B> {
  readonly _eq: true;
  readonly _self: A;
  readonly _target: B;
  /** A proof witness. For us: a structural equality holds when `equal` says so. */
  readonly witness: (a: A, b: B) => boolean;
}

export const refl = <A>(a: A): Eq<A, A> => ({
  _eq: true,
  _self: a,
  _target: a,
  witness: (x, y) => Object.is(x, y),
});

/**
 * `j : (A : Type)(x : A)(P : (y : A) → Eq<A,A> → Type) → P(x, refl(x)) → (y : A)(eq : Eq<A,A>) → P(y, eq)`
 *
 * We approximate it with a TypeScript runtime that accepts the motive `P`
 * and a base case for `refl(x)`, and applies it whenever an equality holds.
 */
export const j =
  <A, B>(a: A, base: (x: A) => unknown) =>
  (b: B, eq: Eq<A, B>): unknown => {
    if (eq.witness(a, b)) return base(a);
    throw new Error('J: not equal');
  };

/** `transport : Eq<A, B> → F<A> → F<B>` — runtime: identity through a function. */
export const transport = <A, B, F>(eq: Eq<A, B>, fa: (a: A) => F, b: B): F => {
  if (eq.witness(eq._self, b)) return fa(eq._self);
  throw new Error('transport: cannot transport through non-equality');
};
