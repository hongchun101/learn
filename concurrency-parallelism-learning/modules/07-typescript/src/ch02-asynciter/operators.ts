/**
 * Chapter 2 — AsyncIterable operators: map, filter, merge, zip.
 *
 * Each operator returns a new `AsyncIterable<U>` whose type is fully
 * inferred from its arguments. Generics are tight: under
 * `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`,
 * consumers see the same shape they would see from a hand-rolled
 * `for await` loop.
 */

/** Wrap a generator factory as a typed `AsyncIterable<T>`. */
function makeIterable<T>(gen: () => AsyncGenerator<T, void, undefined>): AsyncIterable<T> {
  return { [Symbol.asyncIterator]: gen };
}

// ---------------------------------------------------------------------------
// asyncMap<T, U>
// ---------------------------------------------------------------------------

/**
 * Apply `fn` to every item of `src`. `fn` may be sync or async; the
 * return type `U` is preserved as-is.
 *
 *   await collect(asyncMap(src, (x) => x * 2)) // AsyncIterable<number>
 */
export function asyncMap<T, U>(
  src: AsyncIterable<T>,
  fn: (value: T) => U | Promise<U>,
): AsyncIterable<U> {
  return makeIterable<U>(async function* () {
    for await (const x of src) {
      yield await fn(x);
    }
  });
}

// ---------------------------------------------------------------------------
// asyncFilter<T>
// ---------------------------------------------------------------------------

/**
 * Keep only items for which `pred` returns truthy. `pred` may be
 * sync or async, so the consumer can fetch and then check.
 *
 *   await collect(asyncFilter(src, (x) => x > 0))
 */
export function asyncFilter<T>(
  src: AsyncIterable<T>,
  pred: (value: T) => boolean | Promise<boolean>,
): AsyncIterable<T> {
  return makeIterable<T>(async function* () {
    for await (const x of src) {
      if (await pred(x)) yield x;
    }
  });
}

// ---------------------------------------------------------------------------
// asyncMerge<T>
// ---------------------------------------------------------------------------

/**
 * Round-robin merge of multiple `AsyncIterable<T>`s. The merged
 * stream ends when *every* source is exhausted.
 *
 *   await collect(asyncMerge(a, b, c)) // AsyncIterable<T>
 *
 * Implementation note: each source runs in its own consumer task,
 * and a shared queue feeds the output generator. No item is dropped
 * or duplicated; arrival order across sources is best-effort.
 */
export function asyncMerge<T>(
  ...sources: ReadonlyArray<AsyncIterable<T>>
): AsyncIterable<T> {
  return makeIterable<T>(async function* () {
    const queue: T[] = [];
    const waiters: Array<(v: IteratorResult<T>) => void> = [];
    let done = 0;
    const total = sources.length;

    function push(v: T): void {
      const w = waiters.shift();
      if (w) w({ value: v, done: false });
      else queue.push(v);
    }

    function finish(): void {
      done++;
      if (done === total) {
        while (waiters.length > 0) {
          const w = waiters.shift();
          if (w) w({ value: undefined as unknown as T, done: true });
        }
      }
    }

    const consumers = sources.map(async (s) => {
      try {
        for await (const v of s) {
          push(v);
          await Promise.resolve();
        }
      } finally {
        finish();
      }
    });

    while (done < total) {
      // Drain the queue first.
      while (queue.length > 0) {
        const v = queue.shift();
        if (v !== undefined) yield v;
      }
      if (done === total) break;
      // Queue is empty; wait for the next push.
      const w = Promise.withResolvers<IteratorResult<T>>();
      waiters.push(w.resolve);
      const next: IteratorResult<T> = await w.promise;
      if (next.done) break;
      yield next.value;
    }

    await Promise.all(consumers);
  });
}

// ---------------------------------------------------------------------------
// asyncZip<A, B>
// ---------------------------------------------------------------------------

/**
 * Pair items from `a` and `b` into tuples. Stops at the shorter
 * source — the consumer sees the exhaustion through the iterator's
 * `done: true` return.
 *
 *   await collect(asyncZip(a, b)) // AsyncIterable<[A, B]>
 */
export function asyncZip<A, B>(
  a: AsyncIterable<A>,
  b: AsyncIterable<B>,
): AsyncIterable<readonly [A, B]> {
  return makeIterable<readonly [A, B]>(async function* () {
    const ai = a[Symbol.asyncIterator]();
    const bi = b[Symbol.asyncIterator]();
    while (true) {
      const ra = await ai.next();
      if (ra.done) return;
      const rb = await bi.next();
      if (rb.done) return;
      yield [ra.value, rb.value] as const;
    }
  });
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Drain an `AsyncIterable<T>` into a `T[]`. */
export async function collect<T>(src: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const v of src) out.push(v);
  return out;
}

/**
 * Apply `fn` to each item and *also* pass through the original.
 * Useful for tracing a stream without breaking the consumer.
 */
export function asyncTap<T>(
  src: AsyncIterable<T>,
  fn: (value: T) => void | Promise<void>,
): AsyncIterable<T> {
  return makeIterable<T>(async function* () {
    for await (const v of src) {
      await fn(v);
      yield v;
    }
  });
}