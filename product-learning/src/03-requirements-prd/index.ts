// =============================================================================
// Chapter 03 — Requirements & PRD (barrel)
// =============================================================================

export type {
  RequirementKind,
  UserStory,
  AcceptanceCriterion,
  Nfr,
  Moscow,
  PrdSection,
  Prd,
} from './models.js';

export {
  kanoCategory,
  rankedKano,
  moscowBucket,
  storyPointToDays,
  sprintCapacity,
} from './kano.js';
export type { KanoCategory, KanoPair } from './kano.js';

export {
  validatePrd,
  isPrdReady,
  renderPrdMarkdown,
  givenWhenThen,
  makeStory,
} from './prd.js';
export type { PrdValidationIssue } from './prd.js';

export {
  stakeholderQuadrant,
  uncoveredRequirements,
  orphanMetrics,
  racisViolations,
} from './stakeholders.js';
export type { Stakeholder, StakeholderQuadrant, RequirementLink, RacisAssignment, Racis } from './stakeholders.js';

export {
  pert,
  widebandDelphi,
  referenceClassForecast,
  calendarWeeks,
} from './estimation.js';
export type { PertEstimate, PertResult, ReferenceClass } from './estimation.js';

export { demo } from './demo.js';
