/**
 * Chapter 4 — Pattern 3: token-bucket rate limiter.
 *
 * The producer may emit at most `ratePerSec` items per second on
 * average. Internally we use a virtual clock and `setTimeout` only
 * because the algorithm requires *real* delay between tokens — there
 * is no synchronisation primitive that can substitute for time.
 */

export interface RateLimiterSpec {
  ratePerSec: number;
  durationMs: number;
}

export interface RateLimiter {
  run(spec: RateLimiterSpec): Promise<{ produced: number }>;
}

export function makeRateLimiter(): RateLimiter['run'] {
  return async (spec: RateLimiterSpec): Promise<{ produced: number }> => {
    const { ratePerSec, durationMs } = spec;
    if (ratePerSec <= 0) throw new Error('ratePerSec must be > 0');
    if (durationMs < 0) throw new Error('durationMs must be >= 0');
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
        const w = Promise.withResolvers<void>();
        setTimeout(w.resolve, wait);
        await w.promise;
      }
    }
    return { produced };
  };
}