// =============================================================================
// Chapter 06 — Growth & Monetization (barrel)
// =============================================================================

export {
  viralCoefficient,
  viralGrowth,
  cacPayback,
  monthlyCompound,
  nrr,
  seoRoi,
  priceElasticity,
} from './models.js';
export type { ViralLoop, SeoContent } from './models.js';

export {
  stickiness,
  powerLawRetention,
  exponentialRetention,
  weeklyFromDaily,
  habitScore,
  smokeTestResult,
} from './retention.js';
export type { HabitInputs, SmokeTest } from './retention.js';

export {
  annualizedPrice,
  recommendedTier,
  trialConversion,
  ndr,
  tieredDiscount,
} from './pricing.js';
export type { PricingTier } from './pricing.js';

export {
  experimentSampleSize,
  mSPRT,
  cuped,
  ucb1,
} from './experiments.js';
export type { BanditArm } from './experiments.js';

export { demo } from './demo.js';
