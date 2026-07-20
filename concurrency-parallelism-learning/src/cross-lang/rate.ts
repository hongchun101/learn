/**
 * Token-bucket rate limiter. Producer may not enqueue more than
 * `ratePerSec` items per second on average. Reference implementation; the
 * same algorithm is implemented in every language module.
 */

import type { RateLimiter } from './contracts.js';

export function makeRateLimiter(): RateLimiter['run'] {
  return async (spec: { ratePerSec: number; durationMs: number }) => {
    const { ratePerSec, durationMs } = spec;
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
