/**
 * Chapter 1 — Type-level primitives: Deferred<T>
 *
 * A Deferred<T> is a Promise<T> you can resolve or reject from outside.
 * The shape is what `Promise.withResolvers()` returns, but it is
 * *correctly typed* end to end: the resolve signature mirrors the
 * Promise constructor's, the reject signature accepts `unknown` so a
 * caller can throw anything, and the promise handle is read-only.
 *
 * Why handwritten and not `Promise.withResolvers`? Three reasons:
 *  1. Re-usable type alias: we re-export `Deferred<T>` from the chapter
 *     index, so consumers don't need to destructure withResolvers()
 *     every call site.
 *  2. Test surface: tests can `defer.resolve(x)` and observe that the
 *     promise settles, without leaking the resolver symbol.
 *  3. Composition: a `Pool`, a `Barrier`, a `RateLimiter`, an MPMC
 *     queue — all of them queue waiters. Each waiter is a
 *     `Deferred<void>` stored by `.promise` and resolved by `.resolve`.
 */

/** A promise branded with an origin tag so equal payloads stay distinct. */
export interface BrandedPromise<T, Tag extends string> extends Promise<T> {
  readonly __brand: Tag;
}

export interface Deferred<T> {
  /** The promise handle. Resolved/rejected by `resolve` / `reject`. */
  readonly promise: Promise<T>;
  /** Resolve the promise. Mirrors `Promise<T>`'s constructor parameter. */
  resolve: (value: T | PromiseLike<T>) => void;
  /** Reject the promise. Accepts any reason, including `undefined`. */
  reject: (reason?: unknown) => void;
}

/**
 * Create a fresh `Deferred<T>`. The implementation uses the standard
 * `Promise.withResolvers()` runtime primitive, which is available in
 * Node 24, and lifts it into a typed handle. The `reason` parameter
 * accepts `unknown` because that's the contract of `Promise.reject`.
 */
export function defer<T>(): Deferred<T> {
  const { promise, resolve, reject } = Promise.withResolvers<T>();
  return { promise, resolve, reject };
}

/**
 * Type-level helper: a `Deferred<T>` whose promise is branded with a
 * tag. Used by the barrier / queue chapters to distinguish waiters.
 */
export interface BrandedDeferred<T, Tag extends string> extends Deferred<T> {
  readonly __brand: Tag;
}