/**
 * Chapter 2 — Parallel reduction over a SharedArrayBuffer.
 *
 * Layout (one SAB):
 *   [0, intBytes)               Int32 flags: P done flags + 1 global
 *   [intBytes, totalBytes)      Float64 partial sums, P of them
 *
 * Float64Array requires 8-byte alignment, so we put the Float64
 * partials *after* the Int32 flag region and align intBytes to 8.
 *
 * Workers:
 *   1. Sum their slice into their partial slot.
 *   2. Store 1 in their done flag with Atomics.store.
 *   3. If every worker is done, mark the global flag and notify the
 *      main thread (which is blocked on Atomics.wait).
 *
 * Run with:  node src/ch02-workers/shared_array_buffer.js
 */

import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SAB_WORKER_PATH = join(__dirname, 'shared_array_buffer_worker.js');

const PARALLELISM = 4;
const N = 1000;

const floatBytes = Float64Array.BYTES_PER_ELEMENT * PARALLELISM;
const intSlots = PARALLELISM + 1;
// Round intBytes up to a multiple of Float64Array.BYTES_PER_ELEMENT so
// the Float64Array starts on an 8-byte boundary.
const intBytes = Math.ceil((Int32Array.BYTES_PER_ELEMENT * intSlots) / Float64Array.BYTES_PER_ELEMENT) *
  Float64Array.BYTES_PER_ELEMENT;
const totalBytes = intBytes + floatBytes;

const sab = new SharedArrayBuffer(totalBytes);
const flags = new Int32Array(sab, 0, intSlots);
const partials = new Float64Array(sab, intBytes, PARALLELISM);

const workers = [];
for (let p = 0; p < PARALLELISM; p++) {
  const slice = Array.from({ length: N / PARALLELISM }, (_, k) => p * (N / PARALLELISM) + k + 1);
  const w = new Worker(SAB_WORKER_PATH, {
    workerData: {
      workerId: p,
      slice,
      sab,
      intBytes,
      parallelism: PARALLELISM,
    },
  });
  workers.push(
    new Promise((resolve, reject) => {
      w.once('error', reject);
      w.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
    }),
  );
}

const result = Atomics.wait(flags, PARALLELISM, 0, 5_000);
assert.equal(result, 'ok', `Atomics.wait returned ${result}`);

await Promise.all(workers);

const sum = partials.reduce((a, b) => a + b, 0);
const expected = (N * (N + 1)) / 2;
assert.equal(sum, expected, `parallel sum ${sum} ≠ expected ${expected}`);
console.log(
  `shared_array_buffer: ${PARALLELISM} workers × ${N} items → sum=${sum} (expected ${expected}) — OK`,
);