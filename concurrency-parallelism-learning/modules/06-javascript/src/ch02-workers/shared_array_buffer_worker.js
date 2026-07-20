/**
 * Chapter 2 — Worker entry for the SAB parallel reduction demo.
 *
 * Each worker:
 *   1. Sums its slice into the shared Float64 partial slot.
 *   2. Stores 1 in its done flag.
 *   3. If every worker has stored 1, marks the global "all done" flag
 *      and notifies the main thread, which is blocked in Atomics.wait.
 */

import { workerData } from 'node:worker_threads';

const { workerId, slice, sab, intBytes, parallelism } = workerData;
const partials = new Float64Array(sab, intBytes, parallelism);
const flags = new Int32Array(sab, 0, parallelism + 1);

let s = 0;
for (let i = 0; i < slice.length; i++) s += slice[i];
partials[workerId] = s;

Atomics.store(flags, workerId, 1);

let allDone = 1;
for (let i = 0; i < parallelism; i++) allDone &= Atomics.load(flags, i);
if (allDone) {
  Atomics.store(flags, parallelism, 1);
  Atomics.notify(flags, parallelism, 1);
}