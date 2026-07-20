// =============================================================================
// Chapter 01 — Product Manager Fundamentals (barrel)
// =============================================================================

export type {
  ProductRole,
  LifecycleStage,
  ProblemStatement,
  ValueProposition,
  UserSegment,
  Hypothesis,
  Metric,
  Feature,
  Experiment,
  DecisionLogEntry,
} from './models.js';
export {
  riceScore,
  iceScore,
  wsjfScore,
  riceToBucket,
  rankByRice,
} from './priority.js';
export type { RiceInputs, IceInputs, WsjfInputs } from './priority.js';

export {
  circlesTotal,
  isReadyToBuild,
  riskiestUnknown,
  buildJobStatement,
  pickCheapestExperiment,
  rankSegments,
} from './mental-models.js';
export type { CirclesScore, JobStatement, PmfScore, OstNode, FourRisks } from './mental-models.js';

export {
  isConsistentSizing,
  bottomUpSizing,
  arrOpportunity,
  paretoTop,
  disciplineScore,
  classifyReversibility,
} from './opportunities.js';
export type { MarketSizing, DecisionReversibility } from './opportunities.js';

export { demo } from './demo.js';
