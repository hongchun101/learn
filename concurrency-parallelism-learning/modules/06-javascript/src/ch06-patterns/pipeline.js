/**
 * Pattern 2 — N-stage pipeline.
 *
 * Each element of `source` flows through every stage in order. A
 * stage is a function `(x) => Promise<T> | T`. The implementation
 * uses a simple for-loop because order is preserved by construction.
 *
 * There is no real parallelism here: this pattern is about *stages*
 * (e.g., parse → validate → enrich → persist), and the work is
 * naturally serial within an element. Different elements could be
 * pipelined in parallel, but the contract for this task is "one
 * output per source element, in order", so we go element-by-element.
 *
 * Returned by `makePipeline({ stages, source })`.
 */

export function makePipeline({ stages, source }) {
  return async function run() {
    const out = [];
    for (const x of source) {
      let v = x;
      for (const stage of stages) v = await stage(v);
      out.push(v);
    }
    return out;
  };
}