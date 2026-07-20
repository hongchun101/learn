// HoTT-in-TypeScript: `Path A a b` as a reified witness plus a transport operation.

export interface Path<A> {
  readonly from: A;
  readonly to: A;
  readonly lies: (t: number) => A;
}

export const refl = <A>(a: A): Path<A> => ({
  from: a,
  to: a,
  lies: () => a,
});

/** Concatenation: pq = p ++ q. */
export const concat = <A>(p: Path<A>, q: Path<A>): Path<A> => ({
  from: p.from,
  to: q.to,
  lies: (t) => (t <= 0.5 ? p.lies(t * 2) : q.lies((t - 0.5) * 2)),
});

/** Transport along p. */
export const transport = <A, B>(p: Path<A>, f: (a: A) => B, t: number): B => f(p.lies(t));
