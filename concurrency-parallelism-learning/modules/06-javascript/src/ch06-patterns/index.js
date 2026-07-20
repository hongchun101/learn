/**
 * Pattern index — run every pattern once as a smoke test.
 *
 * Run with:  node src/ch06-patterns/index.js
 */

import assert from 'node:assert/strict';

import { makeFanOutFanIn } from './fanout.js';
import { makePipeline } from './pipeline.js';
import { makeRateLimiter } from './rate.js';
import { makeBarrier } from './barrier.js';
import { makeMpmcQueue } from './mpmc.js';
import { makeParallelReduce } from './reduce.js';

// 1. fanout
{
  const inputs = Array.from({ length: 20 }, (_, i) => i);
  const work = async (i) => {
    await Promise.resolve();
    return i * 2;
  };
  const out = await makeFanOutFanIn({ work, inputs, parallelism: 4 })();
  assert.deepEqual(out, inputs.map((x) => x * 2));
  console.log('fanout: OK');
}

// 2. pipeline
{
  const stages = [(x) => x + 1, async (x) => x * 2, (x) => x - 3];
  const out = await makePipeline({ stages, source: [0, 1, 2, 3] })();
  assert.deepEqual(out, [-1, 1, 3, 5]);
  console.log('pipeline: OK');
}

// 3. rate limiter — real wall-clock smoke. The cross-language test
// uses fake timers; here we accept a generous window for clock drift.
{
  const r = makeRateLimiter();
  const { produced } = await r({ ratePerSec: 200, durationMs: 200 });
  // ~40 tokens in 200ms at 200/s; allow [10, 60] for setTimeout drift.
  // The real test uses fake timers; this is a wall-clock smoke.
  assert.ok(produced >= 10 && produced <= 60, `produced=${produced}`);
  console.log(`rate: produced ${produced} in 200ms — OK`);
}

// 4. barrier
{
  const arriveAndWait = makeBarrier(4);
  let released = 0;
  const tasks = [1, 2, 3, 4].map(async () => {
    await Promise.resolve();
    await arriveAndWait();
    released++;
  });
  await Promise.all(tasks);
  assert.equal(released, 4);
  console.log('barrier: OK');
}

// 5. MPMC
{
  const q = makeMpmcQueue(4);
  const N = 30;
  const producer = (async () => {
    for (let i = 0; i < N; i++) await q.enqueue(i);
  })();
  const consumer = (async () => {
    const out = [];
    for (let i = 0; i < N; i++) {
      const v = await q.dequeue(1000);
      if (v !== undefined) out.push(v);
    }
    return out;
  })();
  await Promise.all([producer, consumer]);
  q.close();
  console.log('mpmc: OK');
}

// 6. parallel reduce
{
  const inputs = Array.from({ length: 1000 }, (_, i) => i + 1);
  const sum = (a, b) => a + b;
  const expected = inputs.reduce(sum);
  const got = await makeParallelReduce({ inputs, combine: sum })(8);
  assert.equal(got, expected);
  console.log(`reduce: sum(1..1000) = ${got} — OK`);
}

console.log('all six patterns: OK');