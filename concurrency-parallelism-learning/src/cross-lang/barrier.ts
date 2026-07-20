/**
 * Cyclic-ish barrier. `arriveAndWait()` blocks until `parties` calls have
 * been made since the last generation. Reference implementation.
 */

import type { Barrier } from './contracts.js';

export function makeBarrier(parties: number): Barrier['arriveAndWait'] {
  if (parties < 1) throw new Error('parties must be >= 1');
  let arrived = 0;
  let waiters: Array<() => void> = [];
  return async () => {
    const w = Promise.withResolvers<void>();
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
