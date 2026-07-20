/**
 * Chapter 2 — Worker thread entry. Called by worker_pool.js.
 *
 * Each worker reads a shared "next" counter via Atomics.add, runs the
 * trivial work, and posts the (index, value) pair back to the main
 * thread. The main thread writes it into out[index], so output order
 * is preserved regardless of completion order.
 */

import { parentPort, workerData } from 'node:worker_threads';

const { counterSab, inputs, len } = workerData;
const counter = new Int32Array(counterSab);

for (;;) {
  const i = Atomics.add(counter, 0, 1);
  if (i >= len) {
    parentPort?.close();
    break;
  }
  parentPort.postMessage({ index: i, value: inputs[i] * 2 });
}