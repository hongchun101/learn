// A very small cubical model: paths stored as arrays over an interval variable.

export interface Path<A> {
  readonly coe: (i: number) => A;
  readonly from: A;
  readonly to: A;
}

export const pathFromCoe = <A>(from: A, to: A, coe: (i: number) => A): Path<A> => ({ coe, from, to });

/** The full path space of an n-tuple. */
export const pathOfTuples = <A, B>(pa: Path<A>, pb: Path<B>): Path<[A, B]> => ({
  from: [pa.from, pb.from],
  to: [pa.to, pb.to],
  coe: (i) => [pa.coe(i), pb.coe(i)],
});
