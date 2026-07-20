// =============================================================================
// Chapter 08 — Product Strategy, Portfolio & Lifecycle
// =============================================================================
// Goal: a single product is a tactic; a portfolio is a strategy. The
// chapter covers BCG growth-share matrix, product life-cycle stage, the
// GE/McKinsey nine-box, Wardley maps, and the Ansoff matrix.
//
// References:
//   * Henderson, "The Product Portfolio Matrix", 1970 (BCG).
//   * Christensen, "The Innovator's Dilemma", 1997.
//   * Moore, "Crossing the Chasm", 1991.
// =============================================================================

export type LifecycleStage = 'introduction' | 'growth' | 'maturity' | 'decline';

export interface ProductStrategyInputs {
  /** Market growth rate, 0..1. */
  readonly marketGrowth: number;
  /** Relative market share, 0..1. */
  readonly relativeShare: number;
  /** Strategic fit, 0..10. */
  readonly strategicFit?: number;
  /** Competitive strength, 0..10. */
  readonly competitiveStrength?: number;
}

export type BcgBucket = 'star' | 'cash-cow' | 'question-mark' | 'dog';
export type GeBucket =
  | 'grow-invest'
  | 'grow-build'
  | 'harvest'
  | 'divest'
  | 'selectivity-earnings'
  | 'selectivity-risk'
  | 'protect-position'
  | 'manage-for-cash'
  | 'phased-exit';

export interface Product {
  readonly id: string;
  readonly name: string;
  readonly stage: LifecycleStage;
  /** Revenue. */
  readonly revenue: number;
  /** Profit. */
  readonly profit: number;
  /** Years since launch. */
  readonly yearsAlive: number;
}

export interface Portfolio {
  readonly products: ReadonlyArray<Product>;
}
