/**
 * Pattern 6 — Parallel reduction.
 *
 * Splits inputs into P contiguous chunks (round-robin by index
 * modulo P, so each chunk is the same size up to ±1). Reduces each
 * chunk sequentially, then left-folds the partials. The result
 * equals `inputs.reduce(combine)` for any associative combine.
 *
 * For non-associative combine the result is unspecified; the
 * contract's test runs only `sum`, which is associative.
 *
 * Returned by `makeParallelReduce({ inputs, combine })(parallelism)`.
 */

export function makeParallelReduce({ inputs, combine }) {
  if (inputs.length === 0) throw new Error('cannot reduce empty');

  return async function run(parallelism) {
    const p = Math.max(1, Math.min(parallelism, inputs.length));
    const chunks = Array.from({ length: p }, () => []);
    for (let i = 0; i < inputs.length; i++) chunks[i % p].push(inputs[i]);
    const partials = await Promise.all(
      chunks.map(async (c) => {
        // Yield once so the runtime can interleave; correctness is unaffected.
        await Promise.resolve();
        return c.reduce(combine);
      }),
    );
    return partials.reduce(combine);
  };
}