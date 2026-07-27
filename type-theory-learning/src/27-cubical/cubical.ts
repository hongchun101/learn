// 一个非常微型的立方模型：路径存储为关于区间变量的数组。

export interface Path<A> {
  readonly coe: (i: number) => A;
  readonly from: A;
  readonly to: A;
}

export const pathFromCoe = <A>(from: A, to: A, coe: (i: number) => A): Path<A> => ({ coe, from, to });

/** n 元组的完整路径空间。 */
export const pathOfTuples = <A, B>(pa: Path<A>, pb: Path<B>): Path<[A, B]> => ({
  from: [pa.from, pb.from],
  to: [pa.to, pb.to],
  coe: (i) => [pa.coe(i), pb.coe(i)],
});
