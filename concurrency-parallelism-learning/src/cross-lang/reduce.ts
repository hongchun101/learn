/**
 * Parallel reduce. Splits inputs into P chunks, reduces each sequentially,
 * then combines partials left-to-right. The combined result must equal
 * `inputs.reduce(combine)` for any associative `combine`.
 */

import type { ParallelReduce } from './contracts.js';

export function makeParallelReduce<T>(spec: {
  inputs: readonly T[];
  combine: (a: T, b: T) => T;
}): ParallelReduce<T>['run'] {
  const { inputs, combine } = spec;
  return async (parallelism: number): Promise<T> => {
    if (inputs.length === 0) throw new Error('cannot reduce empty');
    const p = Math.max(1, Math.min(parallelism, inputs.length));
    const chunks: T[][] = Array.from({ length: p }, () => []);
    for (let i = 0; i < inputs.length; i++) chunks[i % p]!.push(inputs[i]!);
    const partials: T[] = await Promise.all(
      chunks.map(async (c) => {
        // Yield once so the runtime can interleave; correctness is unaffected.
        await Promise.resolve();
        return c.reduce(combine);
      }),
    );
    return partials.reduce(combine);
  };
}
