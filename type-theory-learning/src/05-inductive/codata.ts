// 余数据：流及其操作。
//
// Stream a = ν s. { head : a, tail : Lazy s }
//
// "能产性"指每个观察者（组合子）最终都能观察到一个值；
// 我们将 "Lazy" 编码为一个显式控制求值时机的 thunk。

export type StreamOp = 'head' | 'tail' | 'empty';

export interface Stream<A> {
  /** 返回流的头部值。 */
  head(): A;
  /** 返回下一段流（一个 thunk）。 */
  tail(): Stream<A>;
}

export function fromArray<A>(xs: ReadonlyArray<A>): Stream<A> {
  if (xs.length === 0) throw new Error('empty');
  let i = 0;
  const arr = xs;
  return {
    head: () => {
      const v = arr[i];
      if (v === undefined) throw new Error('past end');
      return v;
    },
    tail: () => fromArray(arr.slice(i + 1)),
  };
}

export function take<A>(n: number, s: Stream<A>): A[] {
  const out: A[] = [];
  let cur: Stream<A> = s;
  for (let i = 0; i < n; i++) {
    out.push(cur.head());
    cur = cur.tail();
  }
  return out;
}

export function zip<A, B>(sa: Stream<A>, sb: Stream<B>): Stream<readonly [A, B]> {
  return {
    head: () => [sa.head(), sb.head()] as const,
    tail: () => zip(sa.tail(), sb.tail()),
  };
}
