// =============================================================================
// Chapter 07 — Project Management & Collaboration (barrel)
// =============================================================================

export type {
  DependencyType,
  TaskStatus,
  Task,
  Milestone,
  Cycle,
} from './models.js';

export {
  parseDay,
  criticalPath,
  onCriticalPath,
  slack,
  cycleFits,
  milestoneSlack,
  burnup,
} from './scheduling.js';

export {
  velocity,
  velocityTrend,
  averageVelocity,
  velocityStd,
  sprintsToComplete,
  carryOverRate,
  predictability,
} from './agile.js';
export type { Sprint, TeamHealth } from './agile.js';

export {
  decisionScore,
  rankOptions,
  consensus,
  collusionPairs,
  meetingCost,
  slantScore,
} from './decisions.js';
export type { DecisionMatrix, Review, WorkingBackwardsDoc } from './decisions.js';

export {
  scoreRisk,
  riskRanking,
  launchReadiness,
  recommendReleaseTier,
  oncallCoverage,
} from './launch.js';
export type { Risk, ScoredRisk, LaunchCheck, OncallSlot, ReleaseTier } from './launch.js';

export { demo } from './demo.js';
