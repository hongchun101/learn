/**
 * Pattern 4 — N-party barrier.
 *
 * `arriveAndWait()` blocks until exactly `parties` calls have been
 * made since the last generation, then releases every caller and
 * resets. Synchronization is `Promise.withResolvers()` — no timers.
 *
 * The contract's test creates a barrier of 4 and verifies that all
 * four tasks complete after a barrier round. The implementation is
 * one-shot per generation (no reuse beyond the contract's call) but
 * is written so a "reset on full" step makes it trivially cyclic.
 *
 * Returned by `makeBarrier(parties)`.
 */

export function makeBarrier(parties) {
  if (parties < 1) throw new Error('parties must be >= 1');
  let arrived = 0;
  let waiters = [];

  return async function arriveAndWait() {
    const w = Promise.withResolvers();
    waiters.push(w.resolve);
    arrived++;
    if (arrived >= parties) {
      const ws = waiters;
      waiters = [];
      arrived = 0;
      for (const r of ws) r();
    }
    await w.promise;
  };
}