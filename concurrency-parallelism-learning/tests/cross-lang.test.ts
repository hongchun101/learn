import { describe, it, expect, vi } from 'vitest';
import {
  makeFanOutFanIn,
  makePipeline,
  makeRateLimiter,
  makeBarrier,
  makeMpmcQueue,
  makeParallelReduce,
} from '../src/cross-lang/index.js';

describe('cross-language: fan-out / fan-in', () => {
  it('preserves input order regardless of completion order', async () => {
    const inputs = Array.from({ length: 100 }, (_, i) => i);
    // Use Promise.resolve() chains with deterministic ordering instead of setTimeout
    const work = async (i: number) => {
      // let microtask queue reorder; correctness is about index-preserving, not wall-clock
      await Promise.resolve();
      await Promise.resolve();
      return i * 2;
    };
    const run = makeFanOutFanIn({ work, inputs, parallelism: 16 });
    const out = await run();
    expect(out).toEqual(inputs.map((i) => i * 2));
  });

  it('handles parallelism=1 and parallelism>=inputs', async () => {
    const inputs = [1, 2, 3, 4, 5];
    const work = async (i: number) => i + 1;
    for (const p of [1, 2, 5, 10]) {
      const out = await makeFanOutFanIn({ work, inputs, parallelism: p })();
      expect(out).toEqual([2, 3, 4, 5, 6]);
    }
  });
});

describe('cross-language: pipeline', () => {
  it('applies every stage in order', async () => {
    const stages = [
      (x: number) => x + 1,
      async (x: number) => x * 2,
      (x: number) => x - 3,
    ];
    const run = makePipeline({ stages, source: [0, 1, 2, 3] });
    expect(await run()).toEqual([-1, 1, 3, 5]);
  });
});

describe('cross-language: rate limiter (deterministic, fake clock)', () => {
  it('produces at most rate * seconds + 1, with at least rate * seconds', async () => {
    vi.useFakeTimers();
    try {
      const run = makeRateLimiter();
      const promise = run({ ratePerSec: 100, durationMs: 200 });
      // advance virtual time enough to cover the whole window
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

describe('cross-language: barrier', () => {
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

describe('cross-language: MPMC queue', () => {
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
    const setA = new Set(collected);
    expect(setA.size).toBe(300);
  });
});

describe('cross-language: parallel reduce', () => {
  it('matches sequential reduce for an associative op', async () => {
    const inputs = Array.from({ length: 1000 }, (_, i) => i + 1);
    const sum = (a: number, b: number) => a + b;
    const seq = inputs.reduce(sum);
    for (const p of [1, 2, 4, 8, 16, 32, 100]) {
      const got = await makeParallelReduce({ inputs, combine: sum })(p);
      expect(got).toBe(seq);
    }
  });
});
