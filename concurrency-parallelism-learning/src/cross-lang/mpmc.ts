/**
 * Bounded MPMC queue using a single mutex + circular buffer.
 * Reference implementation; the same shape is implemented in every other
 * language module.
 */

import type { MpmcQueue } from './contracts.js';

type Waiter = { kind: 'p' | 'c'; resolve: () => void };

export function makeMpmcQueue<T>(capacity: number): MpmcQueue<T> {
  if (capacity < 1) throw new Error('capacity must be >= 1');
  const buf: (T | undefined)[] = new Array(capacity);
  let head = 0; // dequeue index
  let tail = 0; // enqueue index
  let size = 0;
  let closed = false;
  const mu = { lock: false } as { lock: boolean };
  const waiters: Waiter[] = [];

  function wakeMatching(kind: 'p' | 'c'): void {
    const idx = waiters.findIndex((w) => w.kind === kind);
    if (idx >= 0) {
      const w = waiters[idx]!;
      waiters.splice(idx, 1);
      w.resolve();
    }
  }

  return {
    capacity,
    async enqueue(item: T): Promise<void> {
      for (;;) {
        if (closed) throw new Error('queue closed');
        if (mu.lock || size >= capacity) {
          const w = Promise.withResolvers<void>();
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
    async dequeue(timeoutMs: number): Promise<T | undefined> {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        if (mu.lock || (size === 0 && !closed)) {
          const w = Promise.withResolvers<void>();
          waiters.push({ kind: 'c', resolve: w.resolve });
          const race = new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), Math.max(0, deadline - Date.now())));
          const winner = await Promise.race([w.promise.then(() => 'go' as const), race]);
          if (winner === 'timeout') return undefined;
          continue;
        }
        if (size === 0) return undefined; // closed and empty
        mu.lock = true;
        const v = buf[head] as T;
        buf[head] = undefined;
        head = (head + 1) % capacity;
        size--;
        mu.lock = false;
        wakeMatching('p');
        return v;
      }
    },
    close(): void {
      closed = true;
      const ws = waiters.splice(0, waiters.length);
      for (const w of ws) w.resolve();
    },
  };
}
