import { describe, it, expect } from 'vitest';
import { defer } from '../src/ch01-types/deferred.js';
import { makePool, asWorker } from '../src/ch01-types/typed-pool.js';
import { makeAsyncLock, makeBarrier, makeLockedPool } from '../src/ch01-types/asynclocks.js';

describe('ch01-types: Deferred<T>', () => {
  it('resolves with the supplied value', async () => {
    const d = defer<number>();
    d.resolve(42);
    expect(await d.promise).toBe(42);
  });

  it('rejects with a reason', async () => {
    const d = defer<string>();
    d.reject(new Error('nope'));
    await expect(d.promise).rejects.toThrow('nope');
  });

  it('double-resolve is a no-op (Promise semantics)', async () => {
    const d = defer<number>();
    d.resolve(1);
    d.resolve(2);
    expect(await d.promise).toBe(1);
  });
});

describe('ch01-types: branded Worker<I,O> and Pool<I,O>', () => {
  it('runs 200 tasks through a size-4 pool, preserving order', async () => {
    const pool = makePool<number, number>({
      size: 4,
      work: asWorker<number, number>(async (n) => {
        // Yield so other tasks get scheduled — preserves the order
        // invariant even under jitter.
        await Promise.resolve();
        return n * 3;
      }),
    });
    const inputs = Array.from({ length: 200 }, (_, i) => i);
    const out = await Promise.all(inputs.map((i) => pool.submit(i)));
    expect(out).toEqual(inputs.map((i) => i * 3));
    await pool[Symbol.asyncDispose]();
    expect(pool.state).toBe('closed');
  });

  it('refuses submit after drain begins', async () => {
    const release: { resolve: () => void } = {
      resolve: () => undefined,
    };
    const pool = makePool<number, number>({
      size: 1,
      work: asWorker<number, number>(async () => {
        await new Promise<void>((r) => {
          release.resolve = r;
        });
        return 0;
      }),
    });
    // Kick off one slow task, then start draining.
    const inFlight = pool.submit(0);
    const drainPromise = pool.drain();
    // While drain is in flight, submit must throw — either
    // 'draining' (caught the in-progress drain) or 'closed'
    // (drain finished first because the queue was empty).
    await expect(pool.submit(1)).rejects.toThrow(/draining|closed/);
    // Now release the slow task so drain can complete.
    release.resolve();
    await inFlight;
    await drainPromise;
    expect(pool.state).toBe('closed');
  });
  it('mutual exclusion — only one acquirer at a time', async () => {
    const lock = makeAsyncLock({ permits: 1 });
    let active = 0;
    let peak = 0;
    const tasks = Array.from({ length: 20 }, async () => {
      const release = await lock.acquire();
      try {
        active++;
        if (active > peak) peak = active;
        await Promise.resolve();
      } finally {
        active--;
        release();
      }
    });
    await Promise.all(tasks);
    expect(peak).toBe(1);
    await lock[Symbol.asyncDispose]();
  });

  it('barrier with 4 parties blocks until all arrive', async () => {
    const barrier = makeBarrier(4);
    let released = 0;
    const tasks = [1, 2, 3, 4].map(async () => {
      await Promise.resolve();
      await barrier.arriveAndWait();
      released++;
    });
    await Promise.all(tasks);
    expect(released).toBe(4);
  });

  it('disposable scope drains pool and lock in LIFO order', async () => {
    const scope = makeLockedPool(async (n: number) => n + 1, 2);
    await scope.pool.submit(1);
    await scope.pool.submit(2);
    expect(scope.pool.state).toBe('running');
    await scope.disposeAll();
    expect(scope.pool.state).toBe('closed');
    expect(scope.lock.pending).toBe(0);
  });
});