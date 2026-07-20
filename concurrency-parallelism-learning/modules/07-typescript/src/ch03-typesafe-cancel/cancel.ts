/**
 * Chapter 3 — Typesafe cancellation: withCancel / raceWithCancel.
 *
 * The contract: a promise can be cancelled. The implementation:
 *  - `withCancel(p, signal)` resolves with `p`'s value, or rejects
 *    with a tagged `CancelError` if `signal` aborts before `p` settles.
 *  - `raceWithCancel(p, signal, onAbort)` is the same plus a typed
 *    side effect that runs *exactly once* when the signal flips.
 *
 * Both use `Promise.withResolvers()` so the synchronisation is
 * `await`-friendly and no callback nesting is required.
 */

/** Tagged cancellation error. Discriminate via `kind`. */
export interface CancelError extends Error {
  readonly kind: 'cancelled';
  readonly reason: unknown;
}
function makeCancelError(reason: unknown): CancelError {
  const err: CancelError = Object.assign(
    new Error(`cancelled: ${String(reason)}`),
    { kind: 'cancelled' as const, reason },
  );
  return err;
}

/**
 * Return `p` or a `CancelError`. If `signal` is already aborted, the
 * returned promise rejects immediately with a `CancelError`.
 */
export function withCancel<T>(
  p: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(makeCancelError(signal.reason));
  }
  const w = Promise.withResolvers<T>();
  const onAbort = (): void => {
    w.reject(makeCancelError(signal.reason));
  };
  signal.addEventListener('abort', onAbort, { once: true });
  void p.then(
    (v) => {
      signal.removeEventListener('abort', onAbort);
      w.resolve(v);
    },
    (e) => {
      signal.removeEventListener('abort', onAbort);
      w.reject(e);
    },
  );
  return w.promise;
}

/**
 * Same as `withCancel`, but also invokes `onAbort` exactly once when
 * the signal aborts. The hook is called *before* the rejection is
 * settled so it can perform cleanup (close a socket, release a
 * permit, etc.).
 */
export function raceWithCancel<T>(
  p: Promise<T>,
  signal: AbortSignal,
  onAbort: () => void | Promise<void>,
): Promise<T> {
  if (signal.aborted) {
    void Promise.resolve(onAbort()).catch(() => undefined);
    return Promise.reject(makeCancelError(signal.reason));
  }
  const w = Promise.withResolvers<T>();
  let aborted = false;
  const onAbortHandler = (): void => {
    if (aborted) return;
    aborted = true;
    void Promise.resolve(onAbort())
      .catch(() => undefined)
      .finally(() => {
        w.reject(makeCancelError(signal.reason));
      });
  };
  signal.addEventListener('abort', onAbortHandler, { once: true });
  void p.then(
    (v) => {
      if (aborted) return;
      signal.removeEventListener('abort', onAbortHandler);
      w.resolve(v);
    },
    (e) => {
      if (aborted) return;
      signal.removeEventListener('abort', onAbortHandler);
      w.reject(e);
    },
  );
  return w.promise;
}

/**
 * Run `body` with an `AbortSignal` that aborts after `timeoutMs`.
 * The body sees the signal and is expected to clean up. Returns the
 * body's result or rejects with a `CancelError`.
 */
export async function withTimeout<T>(
  body: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const c = new AbortController();
  let settled = false;
  const timer = setTimeout(() => {
    settled = true;
    c.abort(new Error('timeout'));
  }, timeoutMs);
  try {
    return await body(c.signal);
  } finally {
    clearTimeout(timer);
    // Only abort if the timer didn't already fire. Otherwise the
    // body has already reacted and we don't want to dispatch a
    // second abort that would re-reject an already-settled promise.
    if (!settled) c.abort();
  }
}