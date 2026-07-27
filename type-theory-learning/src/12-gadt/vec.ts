// 一个按长度索引的简单 `Vec n a`；操作保留索引。

export interface VNil<A> {
  readonly _kind: 'nil';
  readonly len: 0;
  readonly items: ReadonlyArray<A>;
}

export interface VCons<A> {
  readonly _kind: 'cons';
  readonly len: number;
  readonly items: ReadonlyArray<A>;
}

export type Vec<A, N extends number = number> = (N extends 0 ? VNil<A> : VCons<A>) & { items: ReadonlyArray<A> };

export const nil = <A>(): VNil<A> => ({ _kind: 'nil', len: 0, items: [] });

export const cons = <A>(x: A, xs: VNil<A> | VCons<A>): VCons<A> => ({
  _kind: 'cons',
  len: xs.len + 1,
  items: [x, ...xs.items],
});

/** 拼接：  Vec(n) ++ Vec(m) = Vec(n+m)。 */
export const append = <A>(xs: VCons<A>, ys: VCons<A> | VNil<A>): VCons<A> => {
  const left = [...xs.items];
  const right = 'items' in ys ? [...ys.items] : [];
  return { _kind: 'cons', len: left.length + right.length, items: [...left, ...right] };
};

export const length = <A, N extends number>(v: Vec<A, N>): N => v.len as N;

export const index = <A, N extends number>(v: Vec<A, N>, k: number): A => {
  const item = v.items[k];
  if (item === undefined) throw new Error('out of range');
  return item;
};
