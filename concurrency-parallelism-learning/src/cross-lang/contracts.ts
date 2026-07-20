/**
 * Cross-language contract surface.
 *
 * Every language module implements the same canonical tasks against this
 * contract. The tests in `tests/cross-lang/*.test.ts` verify the TypeScript
 * reference; the equivalent tests in each module verify the local
 * implementation. This is how we keep "covers all mainstream languages"
 * honest — same task, same property, every language.
 */

export type Worker<I, O> = (input: I) => Promise<O> | O;

/** Task 1 — Fan-out, fan-in. */
export interface FanOutFanIn<I, O> {
  work: Worker<I, O>;
  inputs: readonly I[];
  parallelism: number;
  /** Must return outputs in the same order as inputs. */
  run: () => Promise<O[]>;
}

/** Task 2 — Pipeline of N stages. */
export interface Pipeline<T> {
  stages: readonly ((x: T) => Promise<T> | T)[];
  source: ReadonlyArray<T>;
  /** Must return one output per source element, in order. */
  run: () => Promise<T[]>;
}

/** Task 3 — Rate-limited producer with backpressure. */
export interface RateLimiter {
  run: (spec: { ratePerSec: number; durationMs: number }) => Promise<{ produced: number }>;
}

/** Task 4 — Barrier: all N workers must reach point X before any proceeds past it. */
export interface Barrier {
  parties: number;
  /** Each `arriveAndWait` must block until all `parties` have arrived. */
  arriveAndWait: () => Promise<void>;
}

/** Task 5 — MPMC queue (message-passing primitive). */
export interface MpmcQueue<T> {
  capacity: number;
  enqueue: (item: T) => Promise<void>;
  dequeue: (timeoutMs: number) => Promise<T | undefined>;
  close: () => void;
}

/** Task 6 — Parallel reduction. */
export interface ParallelReduce<T> {
  inputs: readonly T[];
  combine: (a: T, b: T) => T;
  /** Must equal inputs.reduce(combine) for an associative combine. */
  run: (parallelism: number) => Promise<T>;
}
