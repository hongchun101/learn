/**
 * Pattern 3 — Token-bucket rate limiter.
 *
 * At any wall-clock moment, you may "produce" if a token is available.
 * Tokens refill at `ratePerSec` per second. The implementation tracks
 * the next moment a produce is allowed, not the number of available
 * tokens (equivalent for the test).
 *
 * Used here: the cross-language test drives a fake clock and expects
 * the count to fall in [rate*seconds - 1, rate*seconds + 2] to allow
 * for the clock granularity in `vi.advanceTimersByTimeAsync`.
 *
 * Returned by `makeRateLimiter()`.
 */

export function makeRateLimiter() {
  return async function run({ ratePerSec, durationMs }) {
    const start = Date.now();
    let produced = 0;
    let nextAllowed = start;
    const intervalMs = 1000 / ratePerSec;
    while (Date.now() - start < durationMs) {
      const now = Date.now();
      if (now >= nextAllowed) {
        produced++;
        nextAllowed = now + intervalMs;
      } else {
        const wait = Math.max(0, nextAllowed - now);
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
    }
    return { produced };
  };
}