/**
 * Chapter 3 — Producer/consumer via Atomics.wait + notify.
 *
 * One buffer slot, one consumer thread waiting for "non-empty",
 * one producer thread writing and notifying. Demonstrates:
 *
 *   - Atomics.wait(view, index, expectedValue, timeout)
 *   - Atomics.notify(view, index, count)
 *   - Atomics.waitAsync(view, index, expectedValue) (safe on main thread)
 *
 * Run with:  node src/ch03-atomics/wait_notify.js
 */

import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WORKER_PATH = join(__dirname, 'wait_notify_worker.js');

const sab = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2);
const view = new Int32Array(sab);
// [0] = value (0 means empty)
// [1] = "produced" counter (incremented by producer on each put)

const N = 100;

const w = new Worker(WORKER_PATH, {
  workerData: { counterSab: sab, n: N },
});

const wDone = new Promise((resolve, reject) => {
  w.once('error', reject);
  w.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
});

// Consumer loop: wait for value != 0, read it, reset to 0.
const consumed = [];
for (let i = 0; i < N; i++) {
  const r = Atomics.wait(view, 0, 0, 1000);
  if (r !== 'ok' && r !== 'not-equal') {
    assert.fail(`wait returned ${r} on iter ${i}`);
  }
  const v = Atomics.load(view, 0);
  consumed.push(v);
  Atomics.store(view, 0, 0);
  Atomics.notify(view, 0, 1); // wake the producer
}

await wDone;

assert.deepEqual(consumed, Array.from({ length: N }, (_, i) => i + 1), 'consumed must be 1..N in order');
console.log(`wait_notify: produced and consumed ${N} values in order — OK`);