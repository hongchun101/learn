/**
 * Chapter 4 — Pattern 5: bounded MPMC queue.
 *
 * Single-mutex, circular-buffer implementation. `dequeue(timeoutMs)`
 * returns `undefined` after the timeout; `close()` releases every
 * waiter. No `setTimeout` for synchronisation — only for the
 * `dequeue` timeout the algorithm mandates.
 */

export interface MpmcQueue<T> {
  readonly capacity: number;
  enqueue(item: T): Promise<void>;
  dequeue(timeoutMs: number): Promise<T | undefined>;
  close(): void;
}

interface Waiter {
  kind: 'p' | 'c';
  resolve: () => void;
}

export function makeMpmcQueue<T>(capacity: number): MpmcQueue<T> {
  if (capacity < 1) throw new Error('capacity must be >= 1');
  const buf: Array<T | undefined> = new Array<T | undefined>(capacity);
  let head = 0;
  let tail = 0;
  let size = 0;
  let closed = false;
  let locked = false;
  const waiters: Waiter[] = [];

  function wakeMatching(kind: 'p' | 'c'): void {
    const idx = waiters.findIndex((w) => w.kind === kind);
    if (idx >= 0) {
      const w = waiters[idx];
      if (w) {
        waiters.splice(idx, 1);
        w.resolve();
      }
    }
  }

  return {
    capacity,
    async enqueue(item: T): Promise<void> {
      for (;;) {
        if (closed) throw new Error('queue closed');
        if (locked || size >= capacity) {
          const w = Promise.withResolvers<void>();
          waiters.push({ kind: 'p', resolve: w.resolve });
          await w.promise;
          continue;
        }
        locked = true;
        buf[tail] = item;
        tail = (tail + 1) % capacity;
        size++;
        locked = false;
        wakeMatching('c');
        return;
      }
    },
    async dequeue(timeoutMs: number): Promise<T | undefined> {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        if (locked || (size === 0 && !closed)) {
          const w = Promise.withResolvers<void>();
          waiters.push({ kind: 'c', resolve: w.resolve });
          const race = new Promise<'timeout'>((r) =>
            setTimeout(() => r('timeout'), Math.max(0, deadline - Date.now())),
          );
          const winner = await Promise.race([
            w.promise.then(() => 'go' as const),
            race,
          ]);
          if (winner === 'timeout') return undefined;
          continue;
        }
        if (size === 0) return undefined;
        locked = true;
        const v = buf[head] as T;
        buf[head] = undefined;
        head = (head + 1) % capacity;
        size--;
        locked = false;
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