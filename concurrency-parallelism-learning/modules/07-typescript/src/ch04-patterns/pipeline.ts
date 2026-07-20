/**
 * Chapter 4 — Pattern 2: N-stage pipeline.
 *
 * Each item flows through every stage in order. The same `T` flows
 * from stage to stage; this is the typed proof that `stages` are
 * homogeneous. The contract permits mixed sync/async stages.
 *
 * The pipeline runs *element-by-element*: each item waits for all
 * stages to finish before the next item enters stage 0. That is the
 * simplest soundness story; a stage-parallel variant would need an
 * explicit type change.
 */

export interface Pipeline<T> {
  readonly stages: ReadonlyArray<(x: T) => T | Promise<T>>;
  readonly source: ReadonlyArray<T>;
  run(): Promise<T[]>;
}

export function makePipeline<T>(spec: {
  stages: ReadonlyArray<(x: T) => T | Promise<T>>;
  source: ReadonlyArray<T>;
}): Pipeline<T>['run'] {
  const { stages, source } = spec;
  return async (): Promise<T[]> => {
    const results: T[] = [];
    for (const x of source) {
      let v: T = x;
      for (const stage of stages) v = await stage(v);
      results.push(v);
    }
    return results;
  };
}