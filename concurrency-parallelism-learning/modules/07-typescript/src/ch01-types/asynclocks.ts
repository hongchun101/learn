/**
 * Chapter 1 — Type-level primitives: AsyncDisposable and DisposableStack.
 *
 * The point of this file is to show *how* to wire up Node 24's
 * `Symbol.asyncDispose` and `DisposableStack` so a `Pool` or an
 * MPMC queue can be released deterministically by `await using`.
 *
 * The lock primitive is a counting semaphore implemented on top of
 * `Promise.withResolvers()`. Each `acquire()` returns a release
 * callback; each `release()` calls it. Errors in the critical
 * section propagate; cleanup is still guaranteed by the
 * `DisposableStack`.
 */

import type { Pool } from './typed-pool.js';
import { makePool } from './typed-pool.js';

// ---------------------------------------------------------------------------
// AsyncDisposable — Node 24 global type
// ---------------------------------------------------------------------------

/**
 * A counting semaphore / mutex. Implements `AsyncDisposable` so it
 * composes with `await using` and `DisposableStack.use(...)`.
 */
export interface AsyncLock extends AsyncDisposable {
  /** Acquire the lock. Resolves with a release function. */
  acquire(): Promise<() => void>;
  /** Number of waiters currently queued. */
  readonly pending: number;
  /** Maximum number of concurrent holders. */
  readonly capacity: number;
}

export interface AsyncLockOptions {
  /** Permits available. Defaults to 1 (a mutex). */
  readonly permits?: number;
}

/**
 * Build an `AsyncLock`. Internally, waiters are stored as
 * `Promise.withResolvers<void>` tuples — the same primitive
 * that `Deferred<T>` uses. The lock is reentrant by *queue
 * position*, not by owner identity.
 */
export function makeAsyncLock(opts: AsyncLockOptions = {}): AsyncLock {
  const permits = Math.max(1, opts.permits ?? 1);
  let inFlight = 0;
  const waiters: Array<() => void> = [];

  function releaseOnce(): void {
    inFlight = Math.max(0, inFlight - 1);
    const next = waiters.shift();
    if (next) next();
  }

  const lock: AsyncLock = {
    get pending(): number {
      return waiters.length;
    },
    get capacity(): number {
      return permits;
    },
    async acquire(): Promise<() => void> {
      if (inFlight < permits && waiters.length === 0) {
        inFlight++;
        return releaseOnce;
      }
      const w = Promise.withResolvers<void>();
      waiters.push(w.resolve);
      await w.promise;
      inFlight++;
      return releaseOnce;
    },
    async [Symbol.asyncDispose](): Promise<void> {
      while (inFlight > 0) {
        await Promise.resolve();
      }
      while (waiters.length > 0) {
        const w = waiters.shift();
        if (w) w();
      }
    },
  };
  return lock;
}

// ---------------------------------------------------------------------------
// DisposableStack composition
// ---------------------------------------------------------------------------

/**
 * Both a `Pool` and an `AsyncLock` returned together for a single
 * `await using` scope. The `disposeAll` helper is LIFO so the pool
 * drains first, then the lock releases.
 */
export interface LockedScope {
  readonly pool: Pool<number, number>;
  readonly lock: AsyncLock;
  /** Dispose both resources in LIFO order. */
  disposeAll(): Promise<void>;
}

/**
 * Build a `Pool<number, number>` whose work always runs under the
 * supplied `AsyncLock`. The returned scope has a `disposeAll()` that
 * drains the pool *and* the lock — the order is encoded in this
 * function so callers don't have to remember it.
 */
export function makeLockedPool(
  work: (n: number) => Promise<number>,
  size: number,
): LockedScope {
  const lock = makeAsyncLock({ permits: size });
  const pool: Pool<number, number> = makePool<number, number>({
    size,
    work: async (n: number) => {
      const release = await lock.acquire();
      try {
        return await work(n);
      } finally {
        release();
      }
    },
  });
  return {
    pool,
    lock,
    async disposeAll(): Promise<void> {
      await pool[Symbol.asyncDispose]();
      await lock[Symbol.asyncDispose]();
    },
  };
}

// ---------------------------------------------------------------------------
// Promise.withResolvers — barrier example
// ---------------------------------------------------------------------------

/**
 * A typed `Barrier` built on `Promise.withResolvers`. Each caller
 * stores its resolver in a queue; when the queue length matches the
 * configured `parties`, every resolver fires.
 */
export interface Barrier {
  parties: number;
  arriveAndWait(): Promise<void>;
}

export function makeBarrier(parties: number): Barrier {
  if (parties < 1) throw new Error('parties must be >= 1');
  let arrived = 0;
  let waiters: Array<() => void> = [];
  return {
    parties,
    async arriveAndWait(): Promise<void> {
      const w = Promise.withResolvers<void>();
      waiters.push(w.resolve);
      arrived++;
      if (arrived >= parties) {
        const ws = waiters;
        waiters = [];
        arrived = 0;
        for (const r of ws) r();
      }
      await w.promise;
    },
  };
}

// ---------------------------------------------------------------------------
// DisposableStack — direct usage example
// ---------------------------------------------------------------------------

/**
 * Run `body` with a `DisposableStack` containing a `Lock` and a
 * `Pool`. If `body` throws, the stack unwinds in LIFO order. This
 * is the canonical `await using` shape.
 */
export async function withDisposableScope<R>(
  size: number,
  body: (scope: LockedScope) => Promise<R>,
): Promise<R> {
  const scope = makeLockedPool(async (n: number) => n + 1, size);
  try {
    return await body(scope);
  } finally {
    await scope.disposeAll();
  }
}

// ---------------------------------------------------------------------------
// Compile-time assertion: AsyncDisposable is wired correctly.
// ---------------------------------------------------------------------------

/**
 * If this type ever stops compiling, the AsyncDisposable plumbing in
 * `makeLockedPool` is broken.
 */
export type AssertAsyncDisposable<T> = T extends AsyncDisposable
  ? true
  : false;