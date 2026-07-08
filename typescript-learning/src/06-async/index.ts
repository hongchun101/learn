/**
 * Module 6: Async, Iterators, Generators
 *
 * Covers:
 *  - Promises: typing, `Promise.all` / `Promise.race` / `Promise.allSettled`
 *  - `async`/`await` with try/catch and the "no floating promises" rule
 *  - Generators: `function*`, `yield*`, `return`/`next`
 *  - Async iterators: `AsyncIterable<T>`, `for await ... of`
 *  - Async generators: `async function*`
 *  - `Disposable` / `AsyncDisposable` / `using`/`await using`
 *  - `AbortSignal` and `AbortController`
 *  - `Promise.withResolvers()` (ES2024)
 *  - Cancellation patterns
 */

// ---------------------------------------------------------------------------
// 1. Promise.all / race / allSettled — exact tuple types
// ---------------------------------------------------------------------------

export async function loadUserAndPosts(
  userId: string,
): Promise<{ user: { id: string; name: string }; posts: readonly { id: string; title: string }[] }> {
  const [user, posts] = await Promise.all([
    fetchUser(userId),
    fetchPosts(userId),
  ]);
  return { user, posts };
}

async function fetchUser(id: string): Promise<{ id: string; name: string }> {
  return { id, name: `User ${id}` };
}
async function fetchPosts(_id: string): Promise<readonly { id: string; title: string }[]> {
  return [];
}

// Promise.allSettled gives a discriminated union of outcomes.
export async function bestEffort<T>(
  tasks: readonly (() => Promise<T>)[],
): Promise<{ fulfilled: T[]; rejected: { reason: unknown }[] }> {
  const results = await Promise.allSettled(tasks.map((t) => t()));
  const fulfilled: T[] = [];
  const rejected: { reason: unknown }[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') fulfilled.push(r.value);
    else rejected.push({ reason: r.reason });
  }
  return { fulfilled, rejected };
}

// ---------------------------------------------------------------------------
// 2. `Promise.withResolvers` — explicit handle for resolve/reject (ES2024)
// ---------------------------------------------------------------------------

export function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  return Promise.withResolvers<T>();
}

// ---------------------------------------------------------------------------
// 3. Generators
// ---------------------------------------------------------------------------

export function* range(start: number, end: number, step = 1): Generator<number, void, unknown> {
  for (let i = start; i < end; i += step) yield i;
}

// `yield*` delegates to another iterable.
export function* flat<T>(items: readonly Iterable<T>[]): Generator<T, void, unknown> {
  for (const it of items) yield* it;
}

// `next(value)` types: Generator<Yield, Return, Next>.
export function* echo<T>(): Generator<T, T, T> {
  const v: T = yield undefined as unknown as T; // placeholder
  return v;
}

// ---------------------------------------------------------------------------
// 4. Async iterators
// ---------------------------------------------------------------------------

export interface PageQuery {
  cursor?: string;
  limit: number;
}

export interface PageResult<T> {
  items: readonly T[];
  nextCursor?: string;
}

// A paged async generator: yields pages until exhausted.
export async function* paginate<T>(
  fetch: (q: PageQuery) => Promise<PageResult<T>>,
  pageSize: number,
): AsyncGenerator<readonly T[], void, void> {
  let cursor: string | undefined;
  for (;;) {
    const query: PageQuery = cursor === undefined ? { limit: pageSize } : { limit: pageSize, cursor };
    const page = await fetch(query);
    if (page.items.length === 0) return;
    yield page.items;
    if (!page.nextCursor) return;
    cursor = page.nextCursor;
  }
}

// `for await ... of` consumes an async iterator.
export async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of iter) out.push(x);
  return out;
}

// ---------------------------------------------------------------------------
// 5. AbortController / AbortSignal — cancellation
// ---------------------------------------------------------------------------

export function withTimeout<T>(p: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
  const { promise, resolve, reject } = Promise.withResolvers<T>();
  const timer = setTimeout(() => reject(new Error('timeout')), ms);
  signal?.addEventListener('abort', () => {
    clearTimeout(timer);
    reject(new Error('aborted'));
  });
  p.then(
    (v) => {
      clearTimeout(timer);
      resolve(v);
    },
    (e) => {
      clearTimeout(timer);
      reject(e);
    },
  );
  return promise;
}

// `for await ... of` respects an AbortSignal via the iterator's `return()`.
export async function* abortable<T>(
  source: AsyncIterable<T>,
  signal: AbortSignal,
): AsyncGenerator<T, void, void> {
  for await (const x of source) {
    if (signal.aborted) return;
    yield x;
  }
}

// ---------------------------------------------------------------------------
// 6. AsyncDisposable and `await using`
// ---------------------------------------------------------------------------

export interface Logger extends AsyncDisposable {
  log(message: string): void;
}

export async function makeLogger(): Promise<Logger> {
  const stream = await openStream();
  return {
    log: (m) => stream.write(m + '\n'),
    [Symbol.asyncDispose]: async () => {
      await stream.close();
    },
  };
}

interface Stream {
  write(s: string): void;
  close(): Promise<void>;
}

async function openStream(): Promise<Stream> {
  return {
    write: () => {},
    close: async () => {},
  };
}

export async function doWork(): Promise<void> {
  // `await using` is the new resource management syntax (TS 5.2+).
  await using logger = await makeLogger();
  logger.log('hello');
  // On scope exit, `[Symbol.asyncDispose]()` is called.
}

// ---------------------------------------------------------------------------
// 7. `Symbol.iterator` / `Symbol.asyncIterator` typing
// ---------------------------------------------------------------------------

export class AsyncCounter implements AsyncIterable<number> {
  constructor(private readonly max: number) {}
  async *[Symbol.asyncIterator](): AsyncIterator<number> {
    for (let i = 0; i < this.max; i++) yield i;
  }
}

// ---------------------------------------------------------------------------
// 8. Promised types — extracting values from a Promise recursively
// ---------------------------------------------------------------------------

export type AwaitedDeep<T> = T extends Promise<infer Inner> ? AwaitedDeep<Inner> : T;

// ---------------------------------------------------------------------------
// 9. Type-safe sequential vs parallel execution
// ---------------------------------------------------------------------------

export async function sequential<T, R>(
  items: readonly T[],
  f: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i++) {
    out.push(await f(items[i]!, i));
  }
  return out;
}

export async function parallel<T, R>(
  items: readonly T[],
  f: (item: T, index: number) => Promise<R>,
  concurrency = 8,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      const item = items[i]!;
      results[i] = await f(item, i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

if (import.meta.url === `file:///${process.argv[1]}`) {
  console.info('range(0,5) =', [...range(0, 5)]);
  console.info('sequential =', await sequential([1, 2, 3], async (n) => n * 2));
  void doWork;
}
