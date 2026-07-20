/**
 * Chapter 3 — A sequence lock.
 *
 * A seqlock is a lock-free primitive for "rare writer, many readers"
 * workloads. Writers increment the sequence counter before and after
 * the write; readers sample the counter, read, and re-sample. If the
 * counters differ, or the low bit is set (writer in progress), the
 * reader retries.
 *
 * Use it for: time-varying stats (CPU telemetry, ring buffer head
 * pointers), where reading a stale value is acceptable as long as it
 * is consistent.
 *
 * Run with:  node src/ch03-atomics/seq_lock.js
 */

import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

// Layout: [sequence, value_lo, value_hi]
function makeSeqLock() {
  const sab = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 3);
  const view = new Int32Array(sab);
  // [0] = sequence counter (odd = writer in progress, even = stable)
  // [1] = lo32 of the protected value
  // [2] = hi32 of the protected value
  return {
    sab,
    view,
    write(value) {
      const buf = new ArrayBuffer(Float64Array.BYTES_PER_ELEMENT);
      new Float64Array(buf)[0] = value;
      const ints = new Int32Array(buf);
      Atomics.add(view, 0, 1);
      Atomics.store(view, 1, ints[0]);
      Atomics.store(view, 2, ints[1]);
      Atomics.add(view, 0, 1);
    },
    read() {
      for (;;) {
        const s1 = Atomics.load(view, 0);
        if ((s1 & 1) === 1) continue;
        const lo = Atomics.load(view, 1);
        const hi = Atomics.load(view, 2);
        Atomics.load(view, 0);
        const s2 = Atomics.load(view, 0);
        if (s1 === s2) {
          const buf = new ArrayBuffer(Float64Array.BYTES_PER_ELEMENT);
          new Int32Array(buf)[0] = lo;
          new Int32Array(buf)[1] = hi;
          return new Float64Array(buf)[0];
        }
      }
    },
  };
}

const sl = makeSeqLock();
let writes = 0;
let reads = 0;
let inconsistent = 0;
let last = -1;

const writer = (async () => {
  for (let i = 0; i < 5_000; i++) {
    sl.write(i);
    writes++;
    if (i % 50 === 0) await Promise.resolve();
  }
})();

const reader = (async () => {
  // Read until the writer is done AND we've read at least 1000 times.
  while (writes < 5_000 || reads < 1_000) {
    const v = sl.read();
    if (v < last) inconsistent++;
    last = v;
    reads++;
    if (reads % 20 === 0) await Promise.resolve();
  }
})();

await Promise.all([writer, reader]);

assert.equal(inconsistent, 0, `seqlock produced ${inconsistent} inconsistent reads`);
console.log(
  `seq_lock: ${writes} writes, ${reads} reads, ${inconsistent} inconsistent — OK`,
);