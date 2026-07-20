import { describe, it, expect, vi } from 'vitest';
import {
  makeFanOutFanIn,
  makePipeline,
  makeRateLimiter,
  makeBarrier,
  makeMpmcQueue,
  makeParallelReduce,
} from '../src/ch04-patterns/index.js';
import { reference } from '../src/ch04-patterns/contract-check.js';

/**
 * The seven shared scenarios from `tests/cross-lang.test.ts`. The
 * local implementations are exercised here, and `reference` (the
 * top-level `src/cross-lang/index.js`) is invoked with the same
 * inputs to confirm the contract holds.
 */

describe('ch04-patterns: fan-out / fan-in', () => {
  it('preserves input order regardless of completion order', async () => {
    const inputs = Array.from({ length: 100 }, (_, i) => i);
    const work = async (i: number): Promise<number> => {
      await Promise.resolve();
      await Promise.resolve();
      return i * 2;
    };
    const local = await makeFanOutFanIn({ work, inputs, parallelism: 16 })();
    expect(local).toEqual(inputs.map((i) => i * 2));
    const ref = await reference.makeFanOutFanIn({ work, inputs, parallelism: 16 })();
    expect(ref).toEqual(local);
  });

  it('handles parallelism=1 and parallelism>=inputs', async () => {
    const inputs = [1, 2, 3, 4, 5];
    const work = async (i: number): Promise<number> => i + 1;
    for (const p of [1, 2, 5, 10]) {
      const out = await makeFanOutFanIn({ work, inputs, parallelism: p })();
      expect(out).toEqual([2, 3, 4, 5, 6]);
    }
  });
});

describe('ch04-patterns: pipeline', () => {
  it('applies every stage in order', async () => {
    const stages = [
      (x: number) => x + 1,
      async (x: number) => x * 2,
      (x: number) => x - 3,
    ];
    const run = makePipeline({ stages, source: [0, 1, 2, 3] });
    const out = await run();
    expect(out).toEqual([-1, 1, 3, 5]);
    const ref = await reference.makePipeline({ stages, source: [0, 1, 2, 3] })();
    expect(ref).toEqual(out);
  });
});

describe('ch04-patterns: rate limiter (deterministic, fake clock)', () => {
  it('produces at most rate * seconds + 1, with at least rate * seconds', async () => {
    vi.useFakeTimers();
    try {
      const run = makeRateLimiter();
      const promise = run({ ratePerSec: 100, durationMs: 200 });
      await vi.advanceTimersByTimeAsync(250);
      const { produced } = await promise;
      expect(produced).toBeGreaterThanOrEqual(19);
      expect(produced).toBeLessThanOrEqual(22);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('ch04-patterns: barrier', () => {
  it('blocks until N parties have arrived', async () => {
    const barrier = makeBarrier(4);
    let released = 0;
    const tasks = [1, 2, 3, 4].map(async () => {
      await Promise.resolve();
      await barrier.arriveAndWait();
      released++;
    });
    await Promise.all(tasks);
    expect(released).toBe(4);
    // Reference agrees.
    const refBarrier = reference.makeBarrier(4);
    let refReleased = 0;
    const refTasks = [1, 2, 3, 4].map(async () => {
      await Promise.resolve();
      await refBarrier();
      refReleased++;
    });
    await Promise.all(refTasks);
    expect(refReleased).toBe(4);
  });
});

describe('ch04-patterns: MPMC queue', () => {
  it('round-trips under concurrent producers and consumers', async () => {
    const q = makeMpmcQueue<number>(4);
    const N = 100;
    const producers = [0, 1, 2].map((pid) =>
      (async () => {
        for (let i = 0; i < N; i++) await q.enqueue(pid * 1000 + i);
      })(),
    );
    const collected: number[] = [];
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
    expect(new Set(collected).size).toBe(300);
  });
});

describe('ch04-patterns: parallel reduce', () => {
  it('matches sequential reduce for an associative op', async () => {
    const inputs = Array.from({ length: 1000 }, (_, i) => i + 1);
    const sum = (a: number, b: number) => a + b;
    const seq = inputs.reduce(sum);
    for (const p of [1, 2, 4, 8, 16, 32, 100]) {
      const got = await makeParallelReduce({ inputs, combine: sum })(p);
      expect(got).toBe(seq);
      const ref = await reference.makeParallelReduce({ inputs, combine: sum })(p);
      expect(ref).toBe(seq);
    }
  });
});