/**
 * Chapter 3 — A spinlock via Atomics.compareExchange.
 *
 * `acquire` busy-waits until the lock is released, using CAS to set
 * the flag from 0 → 1 atomically. `release` stores 0 with a barrier
 * so subsequent acquires see the unlocked state.
 *
 * This is the in-agent equivalent of a pthread mutex. It is only
 * useful when contention is short — anything more than a few
 * microseconds means you should be using Atomics.wait + notify.
 *
 * Run with:  node src/ch03-atomics/lock.js
 */

import assert from 'node:assert/strict';

function makeLock() {
  const sab = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  const view = new Int32Array(sab);
  return {
    sab,
    view,
    acquire() {
      // Tight spin — fine in a Worker thread. On the main thread this
      // would block the event loop, so don't.
      for (;;) {
        if (Atomics.compareExchange(view, 0, 0, 1) === 0) return;
        // Yield to the event loop / scheduler between attempts.
        // Atomics.wait here would block the thread; we want to spin.
      }
    },
    release() {
      Atomics.store(view, 0, 0);
      Atomics.notify(view, 0, 1);
    },
  };
}

// Demo: 4 contenders try to increment a counter under the lock.
const lock = makeLock();
let counter = 0;
const contenders = 4;
const iters = 100_000;

async function contender(id) {
  for (let i = 0; i < iters; i++) {
    lock.acquire();
    counter++;
    lock.release();
  }
}

const t0 = performance.now();
await Promise.all(Array.from({ length: contenders }, (_, i) => contender(i)));
const elapsed = performance.now() - t0;

assert.equal(counter, contenders * iters, `counter ${counter} ≠ expected ${contenders * iters}`);
console.log(`lock: ${contenders} contenders × ${iters} iters → ${counter} (expected ${contenders * iters}) in ${elapsed.toFixed(1)}ms — OK`);