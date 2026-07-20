/**
 * Chapter 4 — Cross-language contract check.
 *
 * Imports the *top-level* reference implementations via the correct
 * relative path and runs each one against the same scenario inputs
 * the local patterns use. If the reference and the local
 * implementations ever diverge, this file's tests catch it.
 *
 * Note the path: from `src/ch04-patterns/`, the top-level
 * `src/cross-lang/index.js` is four directories up. The earlier
 * "misleading example" of three segments was describing the old layout.
 * This module-local path is `../../../../src/cross-lang/index.js`.
 */

import {
  makeFanOutFanIn as refFanOut,
  makePipeline as refPipeline,
  makeRateLimiter as refRate,
  makeBarrier as refBarrier,
  makeMpmcQueue as refMpmc,
  makeParallelReduce as refReduce,
} from '../../../../src/cross-lang/index.js';

export const reference = {
  makeFanOutFanIn: refFanOut,
  makePipeline: refPipeline,
  makeRateLimiter: refRate,
  makeBarrier: refBarrier,
  makeMpmcQueue: refMpmc,
  makeParallelReduce: refReduce,
} as const;