/**
 * Chapter 4 — Pattern 6: associative parallel reduction.
 *
 * Splits inputs into P chunks, reduces each sequentially, then
 * combines partials left-to-right. For an associative `combine`,
 * the result equals `inputs.reduce(combine)`.
 */

export interface ParallelReduce<T> {
  readonly inputs: ReadonlyArray<T>;
  readonly combine: (a: T, b: T) => T;
  run(parallelism: number): Promise<T>;
}

export function makeParallelReduce<T>(spec: {
  inputs: ReadonlyArray<T>;
  combine: (a: T, b: T) => T;
}): ParallelReduce<T>['run'] {
  const { inputs, combine } = spec;
  return async (parallelism: number): Promise<T> => {
    if (inputs.length === 0) throw new Error('cannot reduce empty');
    const p = Math.max(1, Math.min(parallelism, inputs.length));
    const chunks: T[][] = Array.from({ length: p }, () => []);
    for (let i = 0; i < inputs.length; i++) {
      const item = inputs[i];
      const chunk = chunks[i % p];
      if (item !== undefined && chunk) chunk.push(item);
    }
    const partials: T[] = await Promise.all(
      chunks.map(async (c) => {
        await Promise.resolve();
        return c.reduce(combine);
      }),
    );
    return partials.reduce(combine);
  };
}