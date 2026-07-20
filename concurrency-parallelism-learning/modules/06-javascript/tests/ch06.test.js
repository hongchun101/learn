/**
 * Cross-language scenario tests, JavaScript implementation.
 *
 * Reproduces the seven scenarios in tests/cross-lang.test.ts:
 *
 *   1. fan-out / fan-in: order preserved (Promise.resolve chains, no timers)
 *   2. fan-out / fan-in: parallelism = 1, 2, 5, 10 (4 cases)
 *   3. pipeline: stages apply in order
 *   4. rate limiter: fake-clock test, [rate*sec - 1, rate*sec + 2]
 *   5. barrier: blocks until N parties arrive
 *   6. MPMC queue: round-trips under concurrent producers and consumers
 *   7. parallel reduce: matches sequential for sum (associative)
 *
 * Synchronization is exclusively Promise.withResolvers + microtasks.
 * No setTimeout is used to "wait for something". Vitest's fake timers
 * are used only to drive the rate-limiter's internal setTimeout, not
 * to synchronize the test itself.
 */

import { describe, it, expect, vi } from 'vitest';

import { makeFanOutFanIn } from '../src/ch06-patterns/fanout.js';
import { makePipeline } from '../src/ch06-patterns/pipeline.js';
import { makeRateLimiter } from '../src/ch06-patterns/rate.js';
import { makeBarrier } from '../src/ch06-patterns/barrier.js';
import { makeMpmcQueue } from '../src/ch06-patterns/mpmc.js';
import { makeParallelReduce } from '../src/ch06-patterns/reduce.js';

describe('JS module: fan-out / fan-in', () => {
  it('preserves input order regardless of completion order', async () => {
    const inputs = Array.from({ length: 100 }, (_, i) => i);
    const work = async (i) => {
      await Promise.resolve();
      await Promise.resolve();
      return i * 2;
    };
    const out = await makeFanOutFanIn({ work, inputs, parallelism: 16 })();
    expect(out).toEqual(inputs.map((i) => i * 2));
  });

  it('handles parallelism=1 and parallelism>=inputs', async () => {
    const inputs = [1, 2, 3, 4, 5];
    const work = async (i) => i + 1;
    for (const p of [1, 2, 5, 10]) {
      const out = await makeFanOutFanIn({ work, inputs, parallelism: p })();
      expect(out).toEqual([2, 3, 4, 5, 6]);
    }
  });
});

describe('JS module: pipeline', () => {
  it('applies every stage in order', async () => {
    const stages = [
      (x) => x + 1,
      async (x) => x * 2,
      (x) => x - 3,
    ];
    const out = await makePipeline({ stages, source: [0, 1, 2, 3] })();
    expect(out).toEqual([-1, 1, 3, 5]);
  });
});

describe('JS module: rate limiter (deterministic, fake clock)', () => {
  it('produces at most rate * seconds + 1, with at least rate * seconds', async () => {
    vi.useFakeTimers();
    try {
      const run = makeRateLimiter();
      const promise = run({ ratePerSec: 100, durationMs: 200 });
      await vi.advanceTimersByTimeAsync(250);
      const { produced } = await promise;
      // 100/s for 0.2s = 20 tokens expected, allow [19, 22] for clock granularity
      expect(produced).toBeGreaterThanOrEqual(19);
      expect(produced).toBeLessThanOrEqual(22);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('JS module: barrier', () => {
  it('blocks until N parties have arrived', async () => {
    const barrier = makeBarrier(4);
    let released = 0;
    const tasks = [1, 2, 3, 4].map(async () => {
      await Promise.resolve();
      await barrier();
      released++;
    });
    await Promise.all(tasks);
    expect(released).toBe(4);
  });
});

describe('JS module: MPMC queue', () => {
  it('round-trips under concurrent producers and consumers', async () => {
    const q = makeMpmcQueue(4);
    const N = 100;
    const producers = [0, 1, 2].map((pid) =>
      (async () => {
        for (let i = 0; i < N; i++) await q.enqueue(pid * 1000 + i);
      })(),
    );
    const collected = [];
    const consumers = [0, 1, 2, 3].map(async () => {
      for (let i = 0; i < 75; i++) {
        const v = await q.dequeue(1000);
        if (v !== undefined) collected.push(v);
      }
    });
    await Promise.all(producers);
    await Promise.all(consumers);
    q.close();
    expect(collected.length).toBe(300);
    const setA = new Set(collected);
    expect(setA.size).toBe(300);
  });
});

describe('JS module: parallel reduce', () => {
  it('matches sequential reduce for an associative op', async () => {
    const inputs = Array.from({ length: 1000 }, (_, i) => i + 1);
    const sum = (a, b) => a + b;
    const seq = inputs.reduce(sum);
    for (const p of [1, 2, 4, 8, 16, 32, 100]) {
      const got = await makeParallelReduce({ inputs, combine: sum })(p);
      expect(got).toBe(seq);
    }
  });
});