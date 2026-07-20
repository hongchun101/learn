/**
 * Reference implementation in TypeScript.
 *
 * Runs N independent inputs through a worker using a worker pool of size P,
 * preserving input order. The same algorithm is reproduced in every other
 * language module so cross-language comparison is line-by-line.
 */

import type { FanOutFanIn } from './contracts.js';

export function makeFanOutFanIn<I, O>(spec: {
  work: (input: I) => Promise<O>;
  inputs: readonly I[];
  parallelism: number;
}): FanOutFanIn<I, O>['run'] {
  const { work, inputs, parallelism } = spec;
  if (parallelism < 1) throw new Error('parallelism must be >= 1');
  return async (): Promise<O[]> => {
    const out: (O | undefined)[] = new Array(inputs.length);
    let next = 0;
    async function worker(): Promise<void> {
      for (;;) {
        const i = next++;
        if (i >= inputs.length) return;
        const v = await work(inputs[i]!);
        out[i] = v;
      }
    }
    const runners: Promise<void>[] = [];
    const k = Math.min(parallelism, inputs.length);
    for (let i = 0; i < k; i++) runners.push(worker());
    await Promise.all(runners);
    return out as O[];
  };
}
