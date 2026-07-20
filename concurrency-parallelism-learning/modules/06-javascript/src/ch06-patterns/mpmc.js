/**
 * Pattern 5 — Bounded MPMC queue.
 *
 * Circular buffer + in-process mutex. Producers and consumers are
 * symmetric (MPMC). The contract adds two wrinkles:
 *
 *   - dequeue(timeoutMs) resolves with `undefined` on timeout.
 *   - close() releases every blocked waiter with `undefined`.
 *
 * This is in-process, so the implementation uses
 * `Promise.withResolvers()` for wait/notify and a single shared
 * boolean for the mutex. For an inter-agent MPMC, swap the mutex for
 * `Atomics.compareExchange` and the wait/notify for
 * `Atomics.wait` / `Atomics.notify` over a shared Int32 flag.
 *
 * Returned by `makeMpmcQueue(capacity)`.
 */

export function makeMpmcQueue(capacity) {
  if (capacity < 1) throw new Error('capacity must be >= 1');
  const buf = new Array(capacity);
  let head = 0;
  let tail = 0;
  let size = 0;
  let closed = false;
  const mu = { lock: false };
  const waiters = []; // { kind: 'p' | 'c', resolve }

  function wakeMatching(kind) {
    const idx = waiters.findIndex((w) => w.kind === kind);
    if (idx >= 0) {
      const w = waiters[idx];
      waiters.splice(idx, 1);
      w.resolve();
    }
  }

  return {
    capacity,
    async enqueue(item) {
      for (;;) {
        if (closed) throw new Error('queue closed');
        if (mu.lock || size >= capacity) {
          const w = Promise.withResolvers();
          waiters.push({ kind: 'p', resolve: w.resolve });
          await w.promise;
          continue;
        }
        mu.lock = true;
        buf[tail] = item;
        tail = (tail + 1) % capacity;
        size++;
        mu.lock = false;
        wakeMatching('c');
        return;
      }
    },
    async dequeue(timeoutMs) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        if (mu.lock || (size === 0 && !closed)) {
          const w = Promise.withResolvers();
          waiters.push({ kind: 'c', resolve: w.resolve });
          const remaining = Math.max(0, deadline - Date.now());
          let timer;
          const timeoutP = new Promise((r) => {
            timer = setTimeout(() => r('timeout'), remaining);
          });
          const winner = await Promise.race([
            w.promise.then(() => 'go'),
            timeoutP,
          ]);
          clearTimeout(timer);
          if (winner === 'timeout') return undefined;
          continue;
        }
        if (size === 0) return undefined; // closed and empty
        mu.lock = true;
        const v = buf[head];
        buf[head] = undefined;
        head = (head + 1) % capacity;
        size--;
        mu.lock = false;
        wakeMatching('p');
        return v;
      }
    },
    close() {
      closed = true;
      const ws = waiters.splice(0, waiters.length);
      for (const w of ws) w.resolve();
    },
  };
}