#!/usr/bin/env tsx
/**
 * Module 07 — demo runner.
 *
 * Walks through the chapter demos without starting the test runner.
 * Each demo is a single function returning a promise; failures abort
 * the rest.
 */

import { defer } from '../src/ch01-types/deferred.js';
import {
  makePool,
  asWorker,
} from '../src/ch01-types/typed-pool.js';
import { taskQueue } from '../src/ch01-types/task-queue.js';
import {
  asyncMap,
  asyncFilter,
  asyncMerge,
  asyncZip,
  collect,
} from '../src/ch02-asynciter/operators.js';
import {
  makeFanOutFanIn,
  makePipeline,
  makeRateLimiter,
  makeBarrier,
  makeMpmcQueue,
  makeParallelReduce,
} from '../src/ch04-patterns/index.js';
import { trace } from '../src/ch05-instrumentation/traced-worker.js';

async function ch01(): Promise<void> {
  console.log('[ch01] deferred + pool + taskQueue');
  const d = defer<number>();
  setTimeout(() => d.resolve(42), 1);
  console.log('  deferred value:', await d.promise);

  const pool = makePool<number, number>({
    size: 4,
    work: asWorker<number, number>(async (n) => n * 2),
  });
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, i) => pool.submit(i)),
  );
  console.log('  pool results:', results.join(','));

  const q = taskQueue<[Promise<number>, Promise<string>]>([
    async () => 7,
    async () => 'seven',
  ]);
  const tuple = await q();
  console.log('  taskQueue tuple:', tuple.join(','));

  await pool[Symbol.asyncDispose]();
}

async function ch02(): Promise<void> {
  console.log('[ch02] async iterable operators');
  const src = async function* () {
    for (const x of [1, 2, 3, 4, 5]) yield x;
  };
  const mapped = collect(asyncMap(src(), (x) => x * 10));
  const filtered = collect(asyncFilter(src(), (x) => x % 2 === 0));
  console.log('  mapped:', (await mapped).join(','));
  console.log('  filtered:', (await filtered).join(','));
  const a = async function* () {
    yield 1;
    yield 2;
  };
  const b = async function* () {
    yield 10;
    yield 20;
    yield 30;
  };
  const zipped = await collect(asyncZip(a(), b()));
  console.log('  zipped:', zipped.map((p) => `${p[0]}/${p[1]}`).join(','));
  const merged = await collect(asyncMerge(a(), b()));
  console.log('  merged (order may vary):', merged.join(','));
}

async function ch03(): Promise<void> {
  console.log('[ch03] cancellation demo');
  const c = new AbortController();
  setTimeout(() => c.abort(), 5);
  try {
    await new Promise<void>((resolve, reject) => {
      c.signal.addEventListener('abort', () =>
        reject(new Error(`cancelled: ${String(c.signal.reason)}`)),
      );
    });
  } catch (err) {
    console.log('  caught:', (err as Error).message);
  }
}

async function ch04(): Promise<void> {
  console.log('[ch04] six cross-language tasks');
  const fan = await makeFanOutFanIn({
    work: async (i: number) => i * 2,
    inputs: [0, 1, 2, 3, 4],
    parallelism: 3,
  })();
  console.log('  fan-out:', fan.join(','));

  const pipe = await makePipeline({
    stages: [(x: number) => x + 1, async (x: number) => x * 2, (x: number) => x - 3],
    source: [0, 1, 2, 3],
  })();
  console.log('  pipeline:', pipe.join(','));

  const reduced = await makeParallelReduce({
    inputs: Array.from({ length: 100 }, (_, i) => i + 1),
    combine: (a, b) => a + b,
  })(8);
  console.log('  parallel reduce:', reduced);
}

async function ch05(): Promise<void> {
  console.log('[ch05] traced worker');
  const wrapped = trace(async (n: number) => n * 2, 'demo');
  const out = await wrapped(21);
  console.log('  traced result:', out);
  console.log('  trace records:', wrapped.tracer.records().length);
}

async function main(): Promise<void> {
  await ch01();
  await ch02();
  await ch03();
  await ch04();
  await ch05();
  console.log('done.');
}

main().catch((err) => {
  console.error('demo failed:', err);
  process.exit(1);
});