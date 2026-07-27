// Martin-Löf 同一性类型，以深层运行时检查的形式实现。
//
// 我们没有真正的证明器可用；本章展示的是 J 消去子和 `transport`
// 的*接口*。

export interface Eq<A, B> {
  readonly _eq: true;
  readonly _self: A;
  readonly _target: B;
  /** 证明见证。在我们的实现里：当 `equal` 成立时即视为结构相等。 */
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
 * 我们用一个 TypeScript 运行时来近似：接受动机 `P` 与 `refl(x)` 的基例，
 * 并在等式成立时应用之。
 */
export const j =
  <A, B>(a: A, base: (x: A) => unknown) =>
  (b: B, eq: Eq<A, B>): unknown => {
    if (eq.witness(a, b)) return base(a);
    throw new Error('J: not equal');
  };

/** `transport : Eq<A, B> → F<A> → F<B>` — 运行时：通过一个函数实现同一性。 */
export const transport = <A, B, F>(eq: Eq<A, B>, fa: (a: A) => F, b: B): F => {
  if (eq.witness(eq._self, b)) return fa(eq._self);
  throw new Error('transport: cannot transport through non-equality');
};
