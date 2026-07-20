// Codata: streams and their operations.
//
// Stream a = ν s. { head : a, tail : Lazy s }
//
// Productivity means each observer (combinator) eventually observes a value;
// we encode "Lazy" as a thunk whose evaluation we explicitly control.

export type StreamOp = 'head' | 'tail' | 'empty';

export interface Stream<A> {
  /** Returns the head value of the stream. */
  head(): A;
  /** Returns the next stream (a thunk). */
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
