/**
 * Chapter 4 — A custom Transform stream.
 *
 * Doubles every number that passes through it. Demonstrates:
 *   - subclassing stream.Transform
 *   - the _transform(chunk, encoding, callback) protocol
 *   - the _flush(callback) tail protocol
 *
 * Run with:  node src/ch04-streams/transform.js
 */

import { Transform } from 'node:stream';
import assert from 'node:assert/strict';

class Doubler extends Transform {
  constructor(opts = {}) {
    super({ objectMode: true, ...opts });
    this._sum = 0;
  }
  _transform(chunk, _encoding, cb) {
    const v = chunk * 2;
    this._sum += v;
    cb(null, v);
  }
  _flush(cb) {
    this.push({ kind: 'stats', sum: this._sum });
    cb();
  }
}

const doubler = new Doubler();
const out = [];
doubler.on('data', (v) => out.push(v));

for (let i = 1; i <= 10; i++) doubler.write(i);
doubler.end();

await new Promise((resolve) => doubler.on('end', resolve));

assert.equal(out.length, 11, `expected 10 numbers + 1 stats, got ${out.length}`);
assert.deepEqual(
  out.slice(0, 10),
  [2, 4, 6, 8, 10, 12, 14, 16, 18, 20],
  'first 10 should be doubled inputs',
);
assert.deepEqual(out[10], { kind: 'stats', sum: 110 });
console.log(`transform: doubled 1..10 → sum=110 — OK`);