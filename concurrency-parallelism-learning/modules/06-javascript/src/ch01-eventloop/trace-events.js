/**
 * Chapter 1 — Trace a real probe through rAF, rIC, MessageChannel,
 * structuredClone, BroadcastChannel, and AbortController.
 *
 * Run with:  node src/ch01-eventloop/trace-events.js
 *
 * Each section prints what it did and a structured marker. The script
 * polls a single "ready" Promise and exits once every primitive has
 * fired; nothing holds the event loop open after that.
 */

import { performance } from 'node:perf_hooks';

const fired = new Set();
const expectFire = (label) =>
  new Promise((resolve) => {
    const check = () => {
      if (fired.has(label)) return resolve();
      setImmediate(check);
    };
    check();
  });

// 1. requestAnimationFrame polyfill.
function rAF(callback) {
  queueMicrotask(() => {
    setImmediate(() => callback(performance.now()));
  });
}

// 2. requestIdleCallback polyfill (matches the browser IdleDeadline shape).
function requestIdleCallbackPolyfill(cb) {
  setImmediate(() => {
    const start = performance.now();
    const deadline = {
      timeRemaining() {
        return Math.max(0, 50 - (performance.now() - start));
      },
      didTimeout: false,
    };
    cb(deadline);
  });
}

const t0 = performance.now();
console.log('--- rAF ---');
rAF((t) => {
  console.log(`rAF fired at +${(t - t0).toFixed(2)}ms`);
  fired.add('rAF');
});

console.log('--- rIC ---');
requestIdleCallbackPolyfill((d) => {
  console.log(`rIC fired, budget=${d.timeRemaining().toFixed(2)}ms`);
  fired.add('rIC');
});

console.log('--- MessageChannel ---');
const ch = new MessageChannel();
ch.port1.onmessage = (ev) => {
  console.log(`MessageChannel got: ${ev.data}`);
  if (ev.data.startsWith('second')) fired.add('messageChannel');
};
ch.port2.postMessage('hello from port2');
ch.port2.postMessage('second message — also queued');

console.log('--- structuredClone ---');
const src = new Uint8Array([1, 2, 3, 4, 5]);
const copy = structuredClone({ numbers: src }, { transfer: [src.buffer] });
console.log('cloned.bytes:', copy.numbers);
console.log('source.byteLength after transfer:', src.byteLength);
fired.add('structuredClone');

console.log('--- BroadcastChannel ---');
const bc1 = new BroadcastChannel('demo');
const bc2 = new BroadcastChannel('demo');
let bcCount = 0;
const onBc = () => {
  bcCount++;
  if (bcCount >= 2) fired.add('broadcastChannel');
};
bc1.onmessage = (ev) => {
  console.log(`bc1 received: ${ev.data}`);
  onBc();
};
bc2.onmessage = (ev) => {
  console.log(`bc2 received: ${ev.data}`);
  onBc();
};
bc1.postMessage('from bc1');
bc2.postMessage('from bc2');

console.log('--- AbortController ---');
const userCtrl = new AbortController();
const timeoutCtrl = AbortSignal.timeout(100);
const anySignal = AbortSignal.any([userCtrl.signal, timeoutCtrl]);
anySignal.addEventListener('abort', () => {
  console.log(`anySignal aborted, reason=${anySignal.reason?.name ?? 'none'}`);
  fired.add('abort');
});
userCtrl.abort(new Error('user clicked cancel'));

const needed = ['rAF', 'rIC', 'messageChannel', 'structuredClone', 'broadcastChannel', 'abort'];
await Promise.all(needed.map(expectFire));

console.log('--- end ---');
ch.port1.close();
ch.port2.close();
bc1.close();
bc2.close();
process.exit(0);