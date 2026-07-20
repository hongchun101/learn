/**
 * Pipeline: N stages, each element flows through all of them in order.
 * The TypeScript reference uses `Promise<T>` chaining. Equivalent code
 * appears in every language module.
 */

import type { Pipeline } from './contracts.js';

export function makePipeline<T>(spec: {
  stages: readonly ((x: T) => Promise<T> | T)[];
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
