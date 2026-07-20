import { describe, it, expect, vi } from 'vitest';
import {
  withCancel,
  raceWithCancel,
  withTimeout,
} from '../src/ch03-typesafe-cancel/cancel.js';
import type { CancelError } from '../src/ch03-typesafe-cancel/cancel.js';

describe('ch03-cancellation: withCancel / raceWithCancel / withTimeout', () => {
  it('withCancel resolves when p resolves first', async () => {
    const c = new AbortController();
    const out = await withCancel(Promise.resolve('ok'), c.signal);
    expect(out).toBe('ok');
  });

  it('withCancel rejects with CancelError when signal aborts', async () => {
    const c = new AbortController();
    // Build a never-settling promise via Promise.withResolvers; we
    // never call its resolver, so the only way out is via the abort.
    const slow = Promise.withResolvers<string>();
    const p = withCancel(slow.promise, c.signal);
    c.abort(new Error('manual'));
    let caught: CancelError | null = null;
    try {
      await p;
    } catch (err) {
      caught = err as CancelError;
    }
    expect(caught).not.toBeNull();
    expect(caught?.kind).toBe('cancelled');
    expect((caught?.reason as Error).message).toBe('manual');
  });

  it('raceWithCancel calls onAbort exactly once', async () => {
    const c = new AbortController();
    let calls = 0;
    const slow = Promise.withResolvers<number>();
    const p = raceWithCancel(slow.promise, c.signal, () => {
      calls++;
    });
    c.abort();
    await expect(p).rejects.toMatchObject({ kind: 'cancelled' });
    expect(calls).toBe(1);
  });

  it('withTimeout throws CancelError after the configured timeout', async () => {
    vi.useFakeTimers();
    try {
      // Body reacts to the abort signal: when the timer fires, we
      // settle the body's promise with a CancelError-shaped rejection.
      const p = withTimeout((signal) => {
        return new Promise<number>((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            const err = Object.assign(new Error('cancelled'), {
              kind: 'cancelled' as const,
            });
            reject(err);
          });
        });
      }, 100);
      // Attach a handler so the rejection isn't flagged as unhandled
      // during the brief window between `c.abort()` and `await`.
      p.catch(() => undefined);
      // Advance the fake clock past the timeout so the internal
      // setTimeout fires and aborts the controller.
      await vi.advanceTimersByTimeAsync(150);
      await expect(p).rejects.toMatchObject({ kind: 'cancelled' });
    } finally {
      vi.useRealTimers();
    }
  });
});