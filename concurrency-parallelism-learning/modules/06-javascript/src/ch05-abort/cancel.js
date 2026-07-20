/**
 * Chapter 5 — Cancellation with AbortController / AbortSignal.
 *
 * Three real-world patterns:
 *   1. Abort a "fetch-like" promise when a timeout fires.
 *   2. Abort a setTimeout via an external controller.
 *   3. Destroy a stream when the signal aborts.
 *
 * Uses AbortController directly (rather than AbortSignal.timeout) to
 * keep the timing explicit and reproducible.
 *
 * Run with:  node src/ch05-abort/cancel.js
 */

import { setTimeout as delay } from 'node:timers/promises';
import { Readable } from 'node:stream';
import assert from 'node:assert/strict';

// 1. fetch-like + manual abort
async function fetchDemo() {
  const ctrl = new AbortController();
  setTimeout(() => {
    const err = new Error('timeout');
    err.name = 'AbortError';
    ctrl.abort(err);
  }, 50);
  const promise = new Promise((_resolve, reject) => {
    ctrl.signal.addEventListener(
      'abort',
      () => {
        const err = ctrl.signal.reason;
        if (!err.name) err.name = 'AbortError';
        reject(err);
      },
      { once: true },
    );
  });
  // Silence any pre-await rejection tick to avoid unhandled-rejection
  // warnings; the await below still receives the rejection.
  promise.catch(() => {});
  try {
    await promise;
    assert.fail('fetch should have aborted');
  } catch (err) {
    assert.equal(err.name, 'AbortError', `expected AbortError, got ${err.name}`);
  }
}

// 2. setTimeout + AbortSignal
async function timerDemo() {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(new Error('user cancel')), 10);
  try {
    await delay(100, undefined, { signal: ctrl.signal });
    assert.fail('delay should have aborted');
  } catch (err) {
    assert.equal(err.name, 'AbortError', `expected AbortError, got ${err.name}`);
  }
}

// 3. stream + destroy via abort
async function streamDemo() {
  const r = new Readable({ read() {} });
  const ctrl = new AbortController();
  ctrl.signal.addEventListener('abort', () => {
    r.destroy(new Error('stream cancel'));
  });
  setTimeout(() => ctrl.abort(), 10);
  try {
    for await (const _ of r) {
      /* never */
    }
    assert.fail('stream should have errored');
  } catch (err) {
    assert.ok(err, `expected error, got ${err}`);
  }
}

await fetchDemo();
await timerDemo();
await streamDemo();

console.log('cancel: fetch / timer / stream all abort cleanly via AbortController — OK');