// =============================================================================
// Chapter 05 — Metrics & Data (barrel)
// =============================================================================

export type {
  MetricDirection,
  MetricCategory,
  MetricNode,
  CohortDay,
  Cohort,
  FunnelStep,
  Funnel,
} from './models.js';

export {
  funnelStepRates,
  funnelEndToEnd,
  funnelWorstStep,
  averageRetention,
  dayNRetention,
  buildCohortTable,
  rollingAverage,
} from './funnel.js';

export {
  ltvCac,
  aarrr,
  magicNumber,
  ruleOf40,
  burnMultiple,
} from './business.js';
export type { LtvCacInputs, LtvCacResult, AarrrResult } from './business.js';

export {
  walkMetrics,
  metricsByCategory,
  categoryCounts,
  isBalanced,
  heartIndex,
  gqmCoverage,
  HEART_DESCRIPTIONS,
} from './tree.js';
export type { HeartCategory, HeartScore, Gqm } from './tree.js';

export {
  meanStd,
  zScores,
  detectAnomalies,
  ewma,
  ewmaAnomaly,
  weeklyBaseline,
  expectedReward,
} from './anomaly.js';

export { demo } from './demo.js';
