/**
 * Chapter 4 — A custom Readable stream.
 *
 * Demonstrates:
 *   - subclassing stream.Readable
 *   - the _read() pull-based protocol
 *   - backpressure (return false from push() when downstream is full)
 *   - object mode
 *
 * Run with:  node src/ch04-streams/readable.js
 */

import { Readable } from 'node:stream';
import assert from 'node:assert/strict';

class NumberStream extends Readable {
  constructor({ max = 1000, highWaterMark = 16 } = {}) {
    super({ objectMode: true, highWaterMark });
    this._max = max;
    this._sent = 0;
  }
  _read() {
    while (this._sent < this._max) {
      const v = this._sent++;
      const ok = this.push(v);
      if (!ok) return; // downstream full; resume on 'data' / read()
    }
    this.push(null); // EOF
  }
}

const stream = new NumberStream({ max: 1000, highWaterMark: 16 });
const collected = [];
let totalEvents = 0;
stream.on('data', (v) => {
  totalEvents++;
  collected.push(v);
});

await new Promise((resolve) => stream.on('end', resolve));

assert.equal(collected.length, 1000, `expected 1000 items, got ${collected.length}`);
assert.equal(collected[0], 0);
assert.equal(collected[999], 999);
assert.ok(totalEvents > 0);
console.log(`readable: pushed ${collected.length} items, ${totalEvents} data events — OK`);