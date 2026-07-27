// 用 TypeScript 模拟 HoTT：将 `Path A a b` 实现为一个具化的见证与一个传输操作。

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

/** 连接：pq = p ++ q。 */
export const concat = <A>(p: Path<A>, q: Path<A>): Path<A> => ({
  from: p.from,
  to: q.to,
  lies: (t) => (t <= 0.5 ? p.lies(t * 2) : q.lies((t - 0.5) * 2)),
});

/** 沿 p 进行 transport。 */
export const transport = <A, B>(p: Path<A>, f: (a: A) => B, t: number): B => f(p.lies(t));
