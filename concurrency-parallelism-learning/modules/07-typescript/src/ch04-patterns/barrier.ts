/**
 * Chapter 4 — Pattern 4: N-party barrier.
 *
 * Reusable: after `parties` calls to `arriveAndWait`, the next call
 * begins a new generation. Each call resolves once the local
 * generation completes.
 */

export interface Barrier {
  readonly parties: number;
  arriveAndWait(): Promise<void>;
}

export function makeBarrier(parties: number): Barrier {
  if (parties < 1) throw new Error('parties must be >= 1');
  let arrived = 0;
  let waiters: Array<() => void> = [];
  return {
    parties,
    async arriveAndWait(): Promise<void> {
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
    },
  };
}