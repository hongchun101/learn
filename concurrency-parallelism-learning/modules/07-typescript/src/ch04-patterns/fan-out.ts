/**
 * Chapter 4 — Pattern 1: ordered fan-out / fan-in.
 *
 * Faithful re-implementation of the cross-language contract, plus
 * the typed `Worker<I, O>` brand from chapter 1. The output array is
 * index-preserving: `out[i] = await work(inputs[i])` regardless of
 * which worker finishes first.
 *
 * No `setTimeout` for synchronisation — we use `Promise.withResolvers`
 * only for queueing waiters.
 */

import type { Worker } from '../ch01-types/typed-pool.js';

export interface FanOutFanIn<I, O> {
  readonly work: Worker<I, O>;
  readonly inputs: ReadonlyArray<I>;
  readonly parallelism: number;
  run(): Promise<O[]>;
}

export function makeFanOutFanIn<I, O>(spec: {
  work: Worker<I, O>;
  inputs: ReadonlyArray<I>;
  parallelism: number;
}): FanOutFanIn<I, O>['run'] {
  const { work, inputs, parallelism } = spec;
  if (parallelism < 1) throw new Error('parallelism must be >= 1');
  return async (): Promise<O[]> => {
    const out: Array<O | undefined> = new Array(inputs.length);
    let next = 0;
    async function worker(): Promise<void> {
      for (;;) {
        const i = next++;
        if (i >= inputs.length) return;
        const input = inputs[i];
        if (input === undefined) return;
        const v = await work(input);
        out[i] = v;
      }
    }
    const runners: Array<Promise<void>> = [];
    const k = Math.min(parallelism, inputs.length);
    for (let i = 0; i < k; i++) runners.push(worker());
    await Promise.all(runners);
    return out as O[];
  };
}