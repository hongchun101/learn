/**
 * Chapter 4 — Backpressure: a fast producer + slow consumer.
 *
 * The producer respects `drain` — it stops writing until the consumer
 * signals it has caught up. The consumer applies an artificial 1ms
 * delay per chunk to demonstrate the throttle.
 *
 * Run with:  node src/ch04-streams/backpressure.js
 */

import { Readable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';

const TOTAL = 1000;
const HIGH_WATER = 16;

// A producer that writes as fast as the consumer can drain.
function fastProducer() {
  let sent = 0;
  return new Readable({
    objectMode: true,
    highWaterMark: HIGH_WATER,
    read() {
      while (sent < TOTAL) {
        const ok = this.push({ i: sent++ });
        if (!ok) return; // backpressure
      }
      this.push(null);
    },
  });
}

// A slow consumer that reads one item every 1ms.
async function slowConsumer(src) {
  const out = [];
  for await (const v of src) {
    await delay(1);
    out.push(v);
  }
  return out;
}

const t0 = performance.now();
const items = await slowConsumer(fastProducer());
const elapsed = performance.now() - t0;

assert.equal(items.length, TOTAL, `expected ${TOTAL} items, got ${items.length}`);
assert.ok(elapsed >= TOTAL, `expected ≥ ${TOTAL}ms, got ${elapsed.toFixed(1)}ms`);
console.log(
  `backpressure: producer+consumer drained ${items.length} items with 1ms/item delay in ${elapsed.toFixed(1)}ms — OK`,
);