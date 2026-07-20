/**
 * Chapter 4 — pattern index. Re-exports the six typed pattern
 * implementations and the local `FanOutFanIn` / `Pipeline` /
 * `Barrier` / `MpmcQueue` / `ParallelReduce` / `RateLimiter` types.
 *
 * Tests import from here; the harness imports the *reference* from
 * the top-level cross-lang via `../../../../../src/cross-lang/index.js`
 * to confirm the typed wrappers preserve the contract.
 */

export { makeFanOutFanIn } from './fan-out.js';
export type { FanOutFanIn } from './fan-out.js';
export { makePipeline } from './pipeline.js';
export type { Pipeline } from './pipeline.js';
export { makeRateLimiter } from './rate-limit.js';
export type { RateLimiter, RateLimiterSpec } from './rate-limit.js';
export { makeBarrier } from './barrier.js';
export type { Barrier } from './barrier.js';
export { makeMpmcQueue } from './mpmc.js';
export type { MpmcQueue } from './mpmc.js';
export { makeParallelReduce } from './reduce.js';
export type { ParallelReduce } from './reduce.js';