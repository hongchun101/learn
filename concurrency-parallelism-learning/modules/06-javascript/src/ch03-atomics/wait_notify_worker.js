/**
 * Chapter 3 — Worker entry for the wait/notify demo.
 *
 * The worker is the *producer*: it writes values 1..N into a shared
 * Int32 slot and notifies the consumer (which is blocked on the main
 * thread). After each write, the worker waits for the slot to be
 * reset to 0, signalling "I consumed your value".
 */

import { workerData } from 'node:worker_threads';

const { counterSab, n } = workerData;
const view = new Int32Array(counterSab);

for (let i = 1; i <= n; i++) {
  // Wait for slot 0 to be 0 (consumer drained the previous value).
  // Use a small timeout in case the consumer has already moved on.
  for (;;) {
    if (Atomics.load(view, 0) === 0) break;
    const r = Atomics.wait(view, 0, Atomics.load(view, 0), 1000);
    if (r === 'timed-out') {
      // Possibly the consumer set it to 0 between load and wait; loop.
      continue;
    }
    break;
  }
  Atomics.store(view, 0, i);
  Atomics.notify(view, 0, 1);
}