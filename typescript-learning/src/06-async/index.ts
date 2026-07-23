/**
 * 模块 6：异步、迭代器与生成器
 *
 * 涵盖内容：
 *  - Promise：类型标注、`Promise.all` / `Promise.race` / `Promise.allSettled`
 *  - 结合 try/catch 使用 `async`/`await`，以及“禁止浮动 Promise”规则
 *  - 生成器：`function*`、`yield*`、`return`/`next`
 *  - 异步迭代器：`AsyncIterable<T>`、`for await ... of`
 *  - 异步生成器：`async function*`
 *  - `Disposable` / `AsyncDisposable` / `using`/`await using`
 *  - `AbortSignal` 和 `AbortController`
 *  - `Promise.withResolvers()`（ES2024）
 *  - 取消模式
 */

// ---------------------------------------------------------------------------
// 1. Promise.all / race / allSettled — 精确的元组类型
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

// Promise.allSettled 会返回由不同结果构成的可辨识联合。
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
// 2. `Promise.withResolvers` — resolve/reject 的显式句柄（ES2024）
// ---------------------------------------------------------------------------

export function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  return Promise.withResolvers<T>();
}

// ---------------------------------------------------------------------------
// 3. 生成器
// ---------------------------------------------------------------------------

export function* range(start: number, end: number, step = 1): Generator<number, void, unknown> {
  for (let i = start; i < end; i += step) yield i;
}

// `yield*` 委托给另一个可迭代对象。
export function* flat<T>(items: readonly Iterable<T>[]): Generator<T, void, unknown> {
  for (const it of items) yield* it;
}

// `next(value)` 的类型：Generator<Yield, Return, Next>。
export function* echo<T>(): Generator<T, T, T> {
  const v: T = yield undefined as unknown as T; // 占位值
  return v;
}

// ---------------------------------------------------------------------------
// 4. 异步迭代器
// ---------------------------------------------------------------------------

export interface PageQuery {
  cursor?: string;
  limit: number;
}

export interface PageResult<T> {
  items: readonly T[];
  nextCursor?: string;
}

// 分页异步生成器：持续生成页面，直至数据耗尽。
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

// `for await ... of` 消费异步迭代器。
export async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of iter) out.push(x);
  return out;
}

// ---------------------------------------------------------------------------
// 5. AbortController / AbortSignal — 取消操作
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

// `for await ... of` 通过迭代器的 `return()` 遵循 AbortSignal。
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
// 6. AsyncDisposable 与 `await using`
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
  // `await using` 是新的资源管理语法（TS 5.2+）。
  await using logger = await makeLogger();
  logger.log('hello');
  // 退出作用域时，会调用 `[Symbol.asyncDispose]()`。
}

// ---------------------------------------------------------------------------
// 7. `Symbol.iterator` / `Symbol.asyncIterator` 类型标注
// ---------------------------------------------------------------------------

export class AsyncCounter implements AsyncIterable<number> {
  constructor(private readonly max: number) {}
  async *[Symbol.asyncIterator](): AsyncIterator<number> {
    for (let i = 0; i < this.max; i++) yield i;
  }
}

// ---------------------------------------------------------------------------
// 8. Promise 类型 — 从 Promise 中递归提取值
// ---------------------------------------------------------------------------

export type AwaitedDeep<T> = T extends Promise<infer Inner> ? AwaitedDeep<Inner> : T;

// ---------------------------------------------------------------------------
// 9. 类型安全的串行与并行执行
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
