# Module 07 — TypeScript: Type-Level Concurrency

> *The same six tasks every language implements; here, the static type
> system is also the design surface.*

This module is the advanced track for the JavaScript work in
`modules/06-javascript`. Where Module 06 stays close to the runtime —
event loop, microtasks, `Promise.withResolvers`, structural cloning —
Module 07 raises the question: **what does TypeScript's type system add
on top of all of that?** The answer is not "generics"; generics are the
*vocabulary*. The answer is that the type system can encode *invariants
about timing, identity, and ownership* that JavaScript can only
describe at runtime.

The deliverable structure is the same six tasks as every other
language in this repo, plus a chapter that builds the type-level
machinery those tasks rely on. The paper is written **model →
primitives → patterns → exercises → expert checklist**, in that order,
because the type machinery has no meaning without the runtime model it
describes.

---

## 1. Model

### 1.1 What "type-level concurrency" means

Three distinctions separate JS-from-TS at the concurrency boundary:

| Concept | JavaScript level | TypeScript addition |
|---|---|---|
| Promise | runtime object | `Awaited<T>` deep-flattens it |
| Promise identity | indistinguishable from any other | branded `Promise<T,Tag>` |
| Worker | any function returning `Promise<O>` | `Worker<I,O>` contract, branded |
| Resource lifetime | `try/finally` discipline | `AsyncDisposable` + `DisposableStack` |
| Stream | iterable + lazy | `AsyncIterable<T>` with mapped types |
| Cancellation | ad-hoc flag | first-class `AbortSignal` + `withCancel` |
| Causality | log line | typed `Tracer<T>` propagating identity |

TypeScript does not change scheduling. It changes what the
*programmer is allowed to assume* at compile time. Every primitive in
this module exists to push one assumption from runtime into types.

### 1.2 The same six tasks, again

We do not invent new tasks for the type-level module. We re-implement
the canonical six:

1. ordered fan-out / fan-in,
2. N-stage pipeline,
3. token-bucket rate limit,
4. reusable or one-shot N-party barrier,
5. bounded MPMC queue with `close()` + timeout `dequeue`,
6. associative parallel reduction.

These are *also* the seven scenarios that the cross-language test
suite checks (`tests/cross-lang.test.ts`). Chapter 4 imports the
top-level reference implementations verbatim to prove the contract
holds when fed through the typed wrappers, and the local
`tests/ch04-patterns.test.ts` re-runs the same seven scenarios
against the *local* implementations. Two fans-out, one each for the
rest — that is the eight-test spread specified by the harness.

### 1.3 Why the import path matters

The harness and the module both live in the same repo. The top-level
`src/cross-lang/index.js` is the reference. Chapter 4 is the prover: it
imports that reference to confirm a faithful re-implementation shares a
contract. From `modules/07-typescript/src/ch04-patterns/`, the correct
relative path is `../../../../src/cross-lang/index.js` (four parent
directories to the project root, then `src/cross-lang`).

The local implementations are still independently exercised by the seven
scenario tests; the reference import is an additional contract check.

---

## 2. Primitives

### 2.1 `Awaited<T>` — recursive unwrapping

```ts
type Awaited<T> = T extends PromiseLike<infer U> ? Awaited<U> : T;
```

`Awaited<T>` is the canonical recursive conditional type. It unwraps
nested `Promise<Promise<...>>` chains all the way down. We lean on it
in two places:

- The `UnpackPromises<P>` machinery in §2.10, where tuple inference
  has to flatten regardless of depth.
- The `TaskQueue` implementation, where a worker returning
  `Promise<Promise<U>>` is still typed as `Promise<U>` on the queue
  side.

The recursion in `Awaited<T>` is *base case on `infer U` failing*: if
`T` is not `PromiseLike<U>`, the conditional short-circuits. That is
the same termination pattern our handwritten `TaskQueue` uses for its
tuple recursion (§2.10).

### 2.2 Branded `Worker<I, O>`

```ts
declare const WorkerBrand: unique symbol;
export type Worker<I, O> = {
  (input: I): Promise<O> | O;
  readonly [WorkerBrand]: { readonly I: I; readonly O: O };
};
```

A branded `Worker` carries its input and output types at the type
level, so a pool parameterised by `Worker<I, O>` can infer `I` and `O`
without an extra generic at every callsite. The brand is the
*phantom-only* form: there is no runtime cost. Brands are the
identity tool of this module — `BrandedPromise<T, Tag>` (§2.4) is the
same idea applied to a Promise.

### 2.3 `Pool<I, O>` as a type-state machine

```ts
type PoolState = 'idle' | 'spawning' | 'running' | 'draining' | 'closed';

interface Pool<I, O> {
  readonly state: PoolState;
  submit(input: I): Promise<O>;
  drain(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
}
```

A `Pool` is a small state machine. The transition graph is enforced
by signature, not by a runtime check: `submit` is only legal in
`'idle' | 'spawning' | 'running'`, `drain` is only legal in
`'running' | 'draining'`. TypeScript's narrowing on `this.state`
gives us the same guarantee as a Rust `enum PoolState { ... }` —
without runtime overhead.

The chapter file `src/ch01-types/typed-pool.ts` implements
this machine and exposes compile-time assertions (§2.11) that the
illegal transitions are unreachable.

### 2.4 `BrandedPromise<T, Tag>`

```ts
export interface BrandedPromise<T, Tag extends string>
  extends Promise<T> {
  readonly __brand: Tag;
}
```

The brand is a *type-level tag* with no runtime footprint. Two
`Promise<User>` values from different sources — a database row and an
HTTP response — can be branded `DbUser` and `HttpUser` so the
programmer cannot accidentally pass one where the other is expected.
This is the same pattern the [Effect](https://effect.website) library
uses for its `Effect<A, E, R>` triple, simplified to a single tag.

### 2.5 `AsyncDisposable` and `DisposableStack`

Node 24 ships `Symbol.asyncDispose` and the `DisposableStack` /
`AsyncDisposableStack` global objects. A `Pool` implementing
`AsyncDisposable` can be used inside `await using`:

```ts
await using const pool = makePool<number, number>({ size: 4, work });
// pool.drain() runs implicitly here
```

The chapter file `src/ch01-types/asynclocks.ts` shows the
right and the wrong way: a `try/finally` that calls `pool.drain()`
is the *old* way; `await using` is the *new* way, and the compiler
will warn if the pool forgot to implement `asyncDispose`.

`DisposableStack` composes multiple disposables and runs them in
reverse-acquisition order. We use it for tests that build a pool
*and* a queue in the same scope — both are disposed, in reverse
order, even if the middle of the scope throws.

### 2.6 `AsyncIterable<T>` typed streams

The `AsyncIterable<T>` interface is one method: `[Symbol.asyncIterator](): AsyncIterator<T>`. Three things make it
the right shape for typed streams:

1. **Lazy**: nothing runs until `for await`.
2. **Composable**: operators (`map`, `filter`, `merge`, `zip`) return
   new `AsyncIterable<U>`s, never arrays.
3. **Backpressure-aware**: consumers pull, producers push — unlike a
   `Promise.all`, there is no built-in collect step.

`src/ch02-asynciter/` implements these four operators with
strict generics:

- `asyncMap<T, U>(src, fn: (t: T) => Promise<U>): AsyncIterable<U>`
- `asyncFilter<T>(src, pred: (t: T) => boolean | Promise<boolean>): AsyncIterable<T>`
- `asyncMerge<T>(...srcs: AsyncIterable<T>[]): AsyncIterable<T>` —
  preserves the global arrival order; the *typed* proof is that `T`
  flows through unchanged.
- `asyncZip<A, B>(a: AsyncIterable<A>, b: AsyncIterable<B>): AsyncIterable<[A, B]>` —
  returns the *shortest*; the test asserts the source exhaustion
  is observable from the consumer.

The generics are tight: `noUncheckedIndexedAccess` plus `exactOptionalPropertyTypes` means `map((t) => t.field)` gives `T | undefined`, not `T`. Operators are typed
for that.

### 2.7 Typesafe cancellation: `withCancel`, `raceWithCancel`

```ts
export function withCancel<T>(
  p: Promise<T>,
  signal: AbortSignal,
): Promise<T>;
export function raceWithCancel<T>(
  p: Promise<T>,
  signal: AbortSignal,
  onAbort: () => void,
): Promise<T>;
```

`withCancel` rejects with a `CancelError` if the signal aborts before
`p` settles. `raceWithCancel` is the same shape plus a *typed
onAbort hook*: the hook runs *exactly once*, exactly when the signal
flips, and the rejection is a tagged `CancelError` discriminated
union so a caller can `instanceof` or pattern-match.

These are the foundation for Chapter 4's `makeRateLimiter` — the
rate-limiter loop checks the signal each iteration and bails out
without producing another tick.

### 2.8 `Tracer<T>` causal tracing

```ts
export interface Tracer<T> {
  start(item: T): void;
  end(item: T): void;
  child<U>(prefix: string): Tracer<U>;
}
```

A `Tracer` is the typed equivalent of a structured logger with an
implicit causal chain. `Tracer<T>` knows the *type of item* it
traces; `tracer.child(prefix)` returns a `Tracer<U>` whose emitted
records are tagged with the prefix. The wrapper
`src/ch05-instrumentation/traced-worker.ts` wraps a
`Worker<I, O>` in a `TracedWorker<I, O>` that emits
`{ kind: 'started' | 'ended', id, depth, item, at }` records —
deterministic, ordered, queryable.

### 2.9 `Deferred<T>` — handwritten

outside. The implementation in
`src/ch01-types/deferred.ts` is correctly typed, not
`Promise<T> & { resolve: ...; reject: ... }`. The shape is:

```ts
export interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T | PromiseLike<T>): void;
  reject(reason?: unknown): void;
}
```

The `resolve` signature matches `Promise`'s constructor — so a
`Deferred<T>` is a lawful handle for any value that the inner
promise could have resolved to. This is used internally by the pool,
the barrier, the rate limiter, and the MPMC queue — every wait
queue in the chapter uses the same primitive.

### 2.10 `TaskQueue<P extends readonly unknown[]>` — handwritten

```ts
export type UnpackPromises<P extends readonly unknown[]> = {
  readonly [K in keyof P]: P[K] extends PromiseLike<infer U> ? Awaited<U> : P[K];
};

export type WorkerTuple<P extends readonly unknown[]> = {
  readonly [K in keyof P]: (...args: never[]) => P[K];
};

export function taskQueue<P extends readonly unknown[]>(
  workers: readonly [...WorkerTuple<P>],
): (...args: unknown[]) => Promise<UnpackPromises<P>>;
```

The recursion in `UnpackPromises<P>` is:

1. Mapped type `[K in keyof P]` iterates the tuple positions.
2. For each position, conditional `P[K] extends PromiseLike<infer U>`
   asks whether the entry is promise-like.
3. If yes, infer `U` and recurse through `Awaited<U>` (which itself
   recurses until a non-promise value).
4. If no, keep `P[K]` as-is.

The base case is "non-PromiseLike", exactly like `Awaited`. Tuple
homomorphic mapped types preserve length and optionality, so the output
tuple has the same shape as the input tuple, just flattened. `never[]`
is used for worker arguments because each tuple position can have a
different argument shape; no unsafe `any` widening is needed.

The runtime dispatch starts every worker and joins results by declaration
order. The local test asserts that `taskQueue([fn1, fn2])` returns a
`Promise<[R1, R2]>` and that both workers can make progress concurrently.

### 2.11 Compile-time examples and assertions

`tsc --noEmit` is the test runner for the type machinery. Files in
`src/chapters/_assertions/*.ts` contain lines like:

```ts
type _AssertSame<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false;

const _x: _AssertSame<Awaited<Promise<Promise<number>>>, number> = true;
const _y: _AssertSame<UnpackPromises<[Promise<string>, number]>, [string, number]> = true;
```

If the inference regresses, `_x` or `_y` becomes `false` and the
file fails to compile. There is no runtime cost.

---

## 3. Patterns

The six cross-language tasks are reproduced in
`src/ch04-patterns/`, each in its own file. Every file
imports the typed primitives from chapter 1 (`Deferred`, branded
`Worker`, `Pool`, `Tracer`) and the typed streams from chapter 2.
The pattern rule is:

> A pattern file may not `setTimeout` for synchronisation. It may
> `setTimeout` if the algorithm requires a real delay (rate limiter,
> MPMC timeout dequeue). All synchronisation uses
> `Promise.withResolvers` or `await`.

The seven scenarios (eight tests, two for fan-out) are:

1. **fan-out / fan-in preserves input order** — 100 inputs, parallel 16,
   output equals `inputs.map(work)`.
2. **fan-out edge cases** — parallelism ∈ {1, 2, 5, 10}, output equals
   sequential result.
3. **pipeline** — three stages, four inputs, output equals
   `inputs.map(reduce(stages))`.
4. **rate limiter (fake clock)** — `vi.useFakeTimers`, advance 250ms,
   `100/s × 0.2s ≈ 20`, accept `[19, 22]`.
5. **barrier with 4 parties** — all 4 tasks await `arriveAndWait()`,
   `released === 4`.
6. **MPMC round-trip** — 3 producers × 100, 4 consumers × 75, exactly
   300 distinct items collected.
7. **parallel reduce** — 1000 inputs summed with parallelism ∈
   {1, 2, 4, 8, 16, 32, 100}, equals sequential sum.

These match the top-level `tests/cross-lang.test.ts` verbatim.

---

## 4. Exercises

The exercises run inside this module:

1. **`ex01-deferred.test.ts`** — exercise the `Deferred<T>` API
   directly: resolve, reject, double-resolve, double-reject.
2. **`ex02-pool.test.ts`** — submit 200 tasks through a `Pool<number,
   number>` of size 4, assert no out-of-order results and that
   `state` ends in `'closed'`.
3. **`ex03-async-iter.test.ts`** — exercise map/filter/merge/zip on
   a small finite source.
4. **`ex04-cancel.test.ts`** — `withCancel` rejects with `CancelError`,
   `raceWithCancel` calls onAbort exactly once.
5. **`ex05-tracer.test.ts`** — wrap a worker in a `Tracer`, assert
   the recorded events have `started` before `ended` and that
   `depth` increments for each child.
6. **`ex06-taskqueue.test.ts`** — `taskQueue([f, g])(1, 'x')` returns
   `Promise<[R1, R2]>` and runs `f` and `g` concurrently.

---

## 5. What an expert can do after this module

The checklist is precise and testable. After working through this
module an expert can:

- [ ] Explain `Awaited<T>`'s recursion and why `PromiseLike<infer U>`
      is the right base case.
- [ ] Brand a `Worker<I, O>` so `I` and `O` flow through a
      `Pool<I, O>` without repeating the generics.
- [ ] Model a `Pool<I, O>` as a type-state machine with five states
      and compile-time illegal transitions.
- [ ] Use `BrandedPromise<T, Tag>` to keep two `Promise<User>`s from
      different sources apart at compile time.
- [ ] Use `AsyncDisposable` and `DisposableStack` with `await using`
      and reason about LIFO disposal order.
- [ ] Compose `AsyncIterable<T>` with map/filter/merge/zip operators
      whose return types are inferred end-to-end.
- [ ] Write typesafe cancellation with `withCancel` /
      `raceWithCancel` and a tagged `CancelError`.
- [ ] Wrap a `Worker<I, O>` in a typed `Tracer<T>` that emits
      structured `started`/`ended` records.
- [ ] Handwrite `Deferred<T>` whose `resolve` signature matches
      `Promise`'s constructor.
- [ ] Handwrite `TaskQueue<P extends readonly unknown[]>` returning
      `Promise<UnpackPromises<P>>` and explain the tuple-mapped
      recursion.
- [ ] Re-implement the six cross-language contract tasks faithfully
      against the reference, with `Promise.withResolvers` as the
      only synchronisation primitive.
- [ ] Pass `tsc --noEmit` under `strict`, `noUncheckedIndexedAccess`,
      `exactOptionalPropertyTypes`, and `lib: ["ES2024"]`.
- [ ] Avoid unsafe `any` annotations, `@ts-ignore`, and `setTimeout`-based
      synchronisation throughout.

---

## 6. File layout

```
modules/07-typescript/
├── README.md                                   (this paper)
├── package.json                                vitest/typescript/tsx + scripts
├── tsconfig.json                               strict, noUncheckedIndexedAccess,
│                                               exactOptionalPropertyTypes, ES2024
├── vitest.config.ts                            tests/**\/*.test.ts
├── scripts/
│   └── run-all-demos.ts                        tsx-runnable summary
├── src/
│   ├── ch01-types/
│   │   ├── deferred.ts                     handwritten Deferred<T>
│   │   ├── typed-pool.ts                   generic branded Pool<I,O>
│   │   ├── task-queue.ts                   recursive UnpackPromises<P>
│   │   └── asynclocks.ts                   Promise.withResolvers,
│   │                                       AsyncDisposable/DisposableStack
│   ├── ch02-asynciter/
│   │   └── operators.ts                    map/filter/merge/zip
│   ├── ch03-typesafe-cancel/
│   │   └── cancel.ts                       withCancel/raceWithCancel
│   ├── ch04-patterns/
│   │   ├── index.ts                        six typed tasks
│   │   ├── contract-check.ts               top-level reference bridge
│   │   └── fan-out/pipeline/rate/barrier/mpmc/reduce.ts
│   ├── ch05-instrumentation/
│   │   └── traced-worker.ts                Tracer worker wrapper
│   └── chapters/_assertions/
│       └── inference.ts                    compile-time assertions
└── tests/
    ├── ch01-types.test.ts
    ├── ch02-async-iter.test.ts
    ├── ch03-cancellation.test.ts
    ├── ch04-patterns.test.ts               seven scenarios
    ├── ch05-tracing.test.ts
    └── ex06-taskqueue.test.ts
```

## 7. How to run

From `modules/07-typescript/`:

```sh
npm install        # local install of vitest, typescript, tsx, @types/node
npm run typecheck  # tsc --noEmit -p tsconfig.json
npm test           # vitest run --config vitest.config.ts
npm run demo       # tsx scripts/run-all-demos.ts (chapter-by-chapter summary)
```