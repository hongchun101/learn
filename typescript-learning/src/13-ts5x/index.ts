/**
 * Module 13 — TypeScript 5.x Cutting-Edge Features
 *
 * Topics:
 *  - `const` type parameters (5.0)
 *  - `using` and `await using` (5.2) — explicit resource management
 *  - `NoInfer<T>` (5.4) — control which position drives inference
 *  - Deep `Awaited<T>` and nested Promise unwrapping
 *  - Iterator helpers (ES2025 / TS 5.6) — referenced; demo via native `Iterator`
 *  - Variadic tuple types: rest spread with constraints
 *  - The `$`-prefix reserved-type-parameter convention
 *  - `assert` with the `asserts` keyword and runtime polyfill
 *  - `Result` with branded error variants
 *  - The `using` keyword and `Disposable` / `AsyncDisposable`
 *
 * These features are the "50K salary" differentiators — they let you express
 * intent precisely and avoid the slow, manual workarounds junior engineers
 * reach for.
 */

import { ok, err } from '../01-basics/index.js';
import type { Result } from '../01-basics/index.js';

// ---------------------------------------------------------------------------
// 1. `const` type parameters (TS 5.0)
// ---------------------------------------------------------------------------
//
// Without `const`, `T` widens: `tupleConst(1, 2)` infers `T = number[]`.
// With `const`, `T` is locked to the literal tuple shape.

export function tupleConst<const T extends readonly unknown[]>(...args: T): T {
  return args;
}

const tc1: readonly ['a', 'b', 'c'] = tupleConst('a', 'b', 'c');
const tc2: readonly [1, true, 'x'] = tupleConst(1, true, 'x');
void tc1;
void tc2;

// ---------------------------------------------------------------------------
// 2. `NoInfer<T>` (TS 5.4) — control which position drives inference
// ---------------------------------------------------------------------------
//
// Classic problem: an FSM definition where you want `initial` to be inferred
// FROM the keys of `states`, not the other way around.

export interface FSMDef<S extends string> {
  readonly initial: S;
  readonly states: { readonly [K in S]: Record<string, string> };
}

export function createFSMSafe<const S extends string>(def: {
  readonly initial: NoInfer<S>;
  readonly states: { readonly [K in S]: Record<string, string> };
}): FSMDef<S> {
  return def as unknown as FSMDef<S>;
}

// Without `NoInfer`, TS would try to fix `S` to `'idle'` from `initial` first
// and then reject `running`/`stopped` as extra keys. `NoInfer<S>` makes the
// `initial` field ineligible for inference — only `states` drives `S`.
export const machine = createFSMSafe({
  initial: 'idle',
  states: { idle: {}, running: {}, stopped: {} },
});
// machine: FSMDef<'idle' | 'running' | 'stopped'>

// ---------------------------------------------------------------------------
// 3. `using` and `await using` (TS 5.2)
// ---------------------------------------------------------------------------
//
// Resources with a `Disposable` or `AsyncDisposable` interface are
// auto-closed at end of scope — even on throw. This is the type-level
// analog to Python's `with` or Go's `defer`.

export class TempFile implements Disposable {
  readonly path: string;
  private closed = false;
  constructor(path: string) {
    this.path = path;
  }
  [Symbol.dispose](): void {
    this.closed = true;
  }
  get isClosed(): boolean {
    return this.closed;
  }
}

export function withTempFile<T>(path: string, body: (f: TempFile) => T): T {
  // `using` calls [Symbol.dispose]() at scope exit, even on throw.
  using f = new TempFile(path);
  return body(f);
}

// Async variant:
export class DbConnection implements AsyncDisposable {
  constructor(readonly url: string) {}
  async [Symbol.asyncDispose](): Promise<void> {
    // await db.close()
  }
  async query<T>(_sql: string): Promise<T[]> {
    return [];
  }
}

export async function withDb<T>(url: string, body: (db: DbConnection) => Promise<T>): Promise<T> {
  await using db = new DbConnection(url);
  return body(db);
}

// ---------------------------------------------------------------------------
// 4. Variadic tuple types (deep) — rest elements with constraints
// ---------------------------------------------------------------------------

export type Prepend<T, U extends readonly unknown[]> = [T, ...U];

// Concat with inference:
export type Concat<T extends readonly unknown[], U extends readonly unknown[]> = [...T, ...U];

// `T[number]` for unions of tuple element types:
export type Flatten<T extends readonly unknown[]> = T extends readonly (infer U)[]
  ? U
  : never;

export const flat: Flatten<readonly [1, 'a', true]> = 'a';

// ---------------------------------------------------------------------------
// 5. ES2025 iterator helpers
// ---------------------------------------------------------------------------
//
// The `Iterator` prototype got `.map`, `.filter`, `.take`, `.drop`, `.reduce`,
// `.toArray` in ES2025; TS 5.6 types them via `IteratorObject` interface
// merging (declared in `lib.esnext.iterator`). They are LAZY: nothing happens
// until you `.toArray()` or `for..of`.
//
// We construct an `Iterator<number>` that exposes the helpers by adapting a
// generator with a class. The adapter is necessary because `function*`
// ---------------------------------------------------------------------------
// 5. ES2025 iterator helpers
// ---------------------------------------------------------------------------
//
// The `Iterator` prototype got `.map`, `.filter`, `.take`, `.drop`, `.reduce`,
// `.toArray` in ES2025; TS 5.6 types them via the `IteratorObject` interface
// declared in `lib.esnext.iterator`. They are LAZY: nothing happens until you
// `.toArray()` or `for..of` — so chained operations on infinite iterators
// stay O(1) in memory.
//
// The helpers are exposed through `IteratorObject<T>`, not the abstract class
// `Iterator<T>`. We adapt an array with `Iterator.from` to obtain the typed
// surface that has the methods.

function isPrime(n: number): boolean {
  if (n < 2) return false;
  for (let i = 2; i * i <= n; i++) if (n % i === 0) return false;
  return true;
}

export const naturals: IteratorObject<number, undefined, unknown> = Iterator.from(
  (function* (): Generator<number, void, unknown> {
    for (let i = 0; ; i++) yield i;
  })(),
);

export function firstNPrimes(n: number): number[] {
  // `naturals` is infinite; `.filter` + `.take(n)` short-circuits after n hits.
  // Without the lazy iterator helpers we would need a manual `for` loop with
  // a counter, or a `while(true)` that allocates an unbounded array.
  return naturals
    .filter((x: number) => x > 1 && isPrime(x))
    .take(n)
    .toArray();
}

// ---------------------------------------------------------------------------
// 6. Deep `Awaited<T>` for nested Promise types
// ---------------------------------------------------------------------------

export type DeepAwaited<T> = T extends Promise<infer Inner> ? DeepAwaited<Inner> : T;

export async function deeplyNested(): Promise<Promise<Promise<number>>> {
  return Promise.resolve(Promise.resolve(Promise.resolve(42)));
}

export async function getDeep(): Promise<number> {
  // `await` unwraps only one Promise level at a time. We narrow with a type
  // guard so the un-narrowed value is read through a checked boundary.
  const v: unknown = await deeplyNested();
  if (typeof v !== 'number') throw new Error('expected number from deeplyNested()');
  return v;
}

// ---------------------------------------------------------------------------
// 7. The `$`-prefix reserved-type-parameter convention
// ---------------------------------------------------------------------------
//
// Some libraries (e.g. tRPC) reserve `$` to mean "do not infer from here".
// This is a community convention, not a language feature. `NoInfer<>` is the
// official mechanism; a name like `$$Ctx` signals intent at the call site.

export interface RequestContext {
  readonly userId?: string;
}

export function withContext<$$Ctx extends RequestContext, R>(
  ctx: $$Ctx,
  handler: (ctx: $$Ctx) => R,
): R {
  return handler(ctx);
}

// ---------------------------------------------------------------------------
// 8. Type-level string concatenation with literal types
// ---------------------------------------------------------------------------

export type Route<S extends string> = `/${S}`;
export type ApiRoute = Route<`api/${string}`>;
export type V1Api = Route<`api/v1/${string}`>;

const healthRoute: ApiRoute = '/api/health';
const usersRoute: ApiRoute = '/api/users';
void healthRoute;
void usersRoute;

// ---------------------------------------------------------------------------
// 9. `Result` with branded error variants
// ---------------------------------------------------------------------------

export type FsError = NotFoundError_ | PermissionError_ | IoError_;
export type FsResult<T> = Result<T, FsError>;

export interface NotFoundError_ {
  readonly kind: 'NotFound';
  readonly path: string;
}
export interface PermissionError_ {
  readonly kind: 'Permission';
  readonly path: string;
}
export interface IoError_ {
  readonly kind: 'Io';
  readonly cause: string;
}

export function readFile(path: string): FsResult<string> {
  if (!path) return err({ kind: 'NotFound', path });
  return ok(`<contents of ${path}>`);
}

// ---------------------------------------------------------------------------
// 10. `assert` with the `asserts` keyword
// ---------------------------------------------------------------------------
//
// `assert(cond, msg)` narrows the rest of the scope. Unlike `assertDefined`
// or `assertIsString`, `assert` returns `asserts cond` (without a custom
// type predicate) — the value is narrowed to truthy after the call. Node 22+
// ships this runtime; we polyfill here for older runtimes.

export function assert(cond: unknown, msg = 'assertion failed'): asserts cond {
  if (!cond) throw new Error(msg);
}

export function processOrThrow(input: number): number {
  assert(Number.isFinite(input), 'input must be finite');
  // input is now `number` (not `number | undefined`-ish) in the rest of the scope.
  return input * 2;
}

// ---------------------------------------------------------------------------
// Demo runner
// ---------------------------------------------------------------------------

if (import.meta.url === `file:///${process.argv[1]}`) {
  let observedClosed: boolean | null = null;
  withTempFile('/tmp/x', (file) => {
    console.info('using', file.path);
    observedClosed = file.isClosed;
    return file.path;
  });
  console.info('after use, closed =', observedClosed);

  const primes = firstNPrimes(5);
  console.info('first 5 primes =', primes);
}
