/**
 * Chapter 1 — Event loop ordering proof.
 *
 * One runnable script, no workers, no SAB. Just demonstrates the lane
 * ordering that every JS runtime guarantees:
 *
 *   1. Synchronous script body runs to completion.
 *   2. Every queued microtask drains before the next task.
 *   3. Microtasks queued during a microtask run before any new task.
 *
 * Run with:  node src/ch01-eventloop/run.js
 */

import assert from 'node:assert/strict';

const trace = [];
const log = (label) => trace.push(label);

log('script:start');

// Schedule a microtask that itself schedules a microtask. Both must
// run before any macrotask the script queues later.
Promise.resolve().then(() => {
  log('microtask:1');
  Promise.resolve().then(() => log('microtask:1.1'));
});
Promise.resolve().then(() => log('microtask:2'));

// A single macrotask. It must fire *after* every queued microtask.
setImmediate(() => log('task:setImmediate'));

log('script:end');

// On the next macrotask boundary, every queued microtask has drained
// and the setImmediate has fired. That's the assertion point.
setImmediate(() => {
  try {
    assert.deepEqual(trace, [
      'script:start',
      'script:end',
      'microtask:1',
      'microtask:2',
      'microtask:1.1',
      'task:setImmediate',
    ]);
    console.log('EVENT-LOOP ORDERING OK');
    console.log(trace.join('\n'));
  } catch (err) {
    console.error('EVENT-LOOP ORDERING FAILED');
    console.error(trace.join('\n'));
    process.exitCode = 1;
  }
});