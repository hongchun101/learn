/**
 * Chapter 2 — A fixed-size worker pool with `worker_threads`.
 *
 * The pool owns P long-lived threads. Each one loops on a shared
 * `next` counter inside a SharedArrayBuffer. Each worker sums its
 * slice locally and posts a message back to the main thread. The
 * main thread writes the result into `out[i]` where `i` came from
 * the message, so output order is preserved by index, not by
 * completion.
 *
 * Run with:  node src/ch02-workers/worker_pool.js
 */

import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const WORKER_PATH = join(__dirname, 'worker.js');

async function runPool(jobs, parallelism) {
  const len = jobs.length;
  const out = new Array(len);

  const sab = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  const counter = new Int32Array(sab);
  counter[0] = 0;

  const workers = [];
  for (let p = 0; p < parallelism; p++) {
    const w = new Worker(WORKER_PATH, {
      workerData: {
        counterSab: sab,
        inputs: jobs,
        len,
      },
    });
    workers.push(
      new Promise((resolve, reject) => {
        w.on('message', (msg) => {
          out[msg.index] = msg.value;
        });
        w.once('error', reject);
        w.once('exit', (code) => {
          if (code !== 0) return reject(new Error(`worker exit ${code}`));
          resolve();
        });
      }),
    );
  }
  await Promise.all(workers);
  return out;
}

const N = 32;
const jobs = Array.from({ length: N }, (_, i) => i);
const parallelism = 8;
const out = await runPool(jobs, parallelism);
assert.deepEqual(out, jobs.map((x) => x * 2), 'pool output must equal doubled inputs in order');
console.log(`worker_pool: ${N} jobs × ${parallelism} workers — OK`);
console.log('first 8:', out.slice(0, 8));
console.log('last  8:', out.slice(-8));