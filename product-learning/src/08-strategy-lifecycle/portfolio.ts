// =============================================================================
// Chapter 08 — BCG Growth-Share & GE/McKinsey
// =============================================================================

import type {
  ProductStrategyInputs,
  BcgBucket,
  GeBucket,
} from './models.js';
/** BCG: high share + high growth = star, high share + low growth = cash cow, etc. */
export function bcgBucket(i: ProductStrategyInputs): BcgBucket {
  const highGrowth = i.marketGrowth >= 0.1;
  const highShare = i.relativeShare >= 0.5;
  if (highGrowth && highShare) return 'star';
  if (!highGrowth && highShare) return 'cash-cow';
  if (highGrowth && !highShare) return 'question-mark';
  return 'dog';
}

/** GE/McKinsey nine-box. Inputs: business strength vs. industry attractiveness. */
export function geBucket(i: ProductStrategyInputs): GeBucket {
  if (i.strategicFit === undefined || i.competitiveStrength === undefined) {
    throw new Error('strategicFit and competitiveStrength required for GE');
  }
  const fit = i.strategicFit;
  const strength = i.competitiveStrength;
  // Bins: 1-3 low, 4-6 mid, 7-10 high
  if (fit >= 7 && strength >= 7) return 'grow-invest';
  if (fit >= 4 && strength >= 7) return 'grow-build';
  if (fit < 4 && strength >= 7) return 'protect-position';
  if (fit >= 7 && strength >= 4 && strength < 7) return 'selectivity-earnings';
  if (fit >= 4 && fit < 7 && strength >= 4 && strength < 7) return 'selectivity-risk';
  if (fit < 4 && strength >= 4 && strength < 7) return 'manage-for-cash';
  if (fit >= 7 && strength < 4) return 'phased-exit';
  if (fit >= 4 && strength < 4) return 'harvest';
  return 'divest';
}

/** Recommend strategy given a BCG bucket. */
export function recommendStrategy(b: BcgBucket): string {
  switch (b) {
    case 'star': return 'invest to hold leadership';
    case 'cash-cow': return 'harvest cash, fund stars';
    case 'question-mark': return 'invest selectively or divest';
    case 'dog': return 'harvest or divest';
  }
}
