// =============================================================================
// Chapter 04 — Product Design & UX (barrel)
// =============================================================================

export type {
  IaNode,
  FlowAction,
  FlowStep,
  UserFlow,
  NielsenHeuristic,
  HeuristicFinding,
} from './models.js';

export {
  nodeDepth,
  walkIa,
  nodeCount,
  maxDepth,
  cardSortAgreement,
  fanOutViolations,
  orphanPages,
  canReach,
} from './architecture.js';

export {
  happyPath,
  buildStepIndex,
  walkFlow,
  deadEnds,
  unrecoveredErrors,
  stepCount,
} from './flow.js';

export {
  parseHex,
  relativeLuminance,
  contrastRatio,
  evaluateContrast,
  runFormChecks,
  isTouchTargetCompliant,
  MIN_TOUCH_TARGET_PX,
} from './accessibility.js';
export type { ContrastPair, ContrastResult, FormField, A11yCheck } from './accessibility.js';

export {
  NIELSEN_HEURISTICS,
  groupByHeuristic,
  worstHeuristics,
  auditScore,
  severityScore,
} from './heuristics.js';

export { demo } from './demo.js';
