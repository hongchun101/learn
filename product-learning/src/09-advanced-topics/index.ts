// =============================================================================
// Chapter 09 — Advanced Topics (barrel)
// =============================================================================

export {
  gmv,
  platformRevenue,
  metcalfeValue,
  reedValue,
  crossSideEffect,
  minimumViableMarketplace,
  liquidity,
  isHealthy,
} from './platform.js';
export type { Platform } from './platform.js';

export {
  precision,
  recall,
  f1,
  accuracy,
  logLoss,
  evaluate,
  llmCost,
  isSafeOutput,
  hallucinationRate,
  refusalRate,
} from './ai-product.js';
export type { ClassificationPredictions, EvalReport, LlmCall } from './ai-product.js';

export {
  consentRequired,
  legalBasisFor,
  overdueForDeletion,
  dataMinimisationScore,
  detectPii,
  redactPii,
  dsarCompliance,
} from './privacy.js';
export type { DataField, LegalBasis, PiiHit } from './privacy.js';

export {
  formatCurrency,
  formatDate,
  expansionFactor,
  expandedWidth,
  isLocaleLaunchReady,
  localePriority,
  COMMON_LOCALES,
} from './i18n.js';
export type { Locale, LocaleReadiness } from './i18n.js';

export {
  requiredFrameworks,
  cycleMultiplier,
  enterpriseReadinessScore,
  COMPLIANCE,
} from './verticals.js';
export type { Vertical, EnterpriseReadiness } from './verticals.js';

export { demo } from './demo.js';
