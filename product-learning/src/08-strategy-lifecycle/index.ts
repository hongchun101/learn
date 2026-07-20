// =============================================================================
// Chapter 08 — Strategy & Lifecycle (barrel)
// =============================================================================

export type {
  LifecycleStage,
  ProductStrategyInputs,
  BcgBucket,
  GeBucket,
  Product,
  Portfolio,
} from './models.js';

export {
  bcgBucket,
  geBucket,
  recommendStrategy,
} from './portfolio.js';

export {
  classifyStage,
  investmentForStage,
  ansoff,
  ansoffRisk,
  portfolioSummary,
  revenueByStage,
  concentrationRisk,
} from './lifecycle.js';
export type { AnsoffQuadrant } from './lifecycle.js';

export {
  krProgress,
  okrScore,
  isGoodStrategy,
  chasmPosition,
  wardleyEvolve,
  buildVsBuy,
} from './strategy.js';
export type { Objective, KeyResult, StrategyCheck, WardleyStage } from './strategy.js';

export { demo } from './demo.js';
