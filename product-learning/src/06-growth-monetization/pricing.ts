// =============================================================================
// Chapter 06 — Pricing & Monetization Models
// =============================================================================
// Goal: pricing is the most leveraged growth lever. This file implements
// the most-cited pricing models and the math behind plan upgrades, ARPU,
// and elasticity.
// =============================================================================

/** A pricing tier. */
export interface PricingTier {
  readonly id: string;
  readonly name: string;
  /** Price per period. */
  readonly price: number;
  /** Period in months (1 = monthly, 12 = annual). */
  readonly periodMonths: number;
  /** Features included — keys matched against feature ids. */
  readonly features: ReadonlyArray<string>;
}

/** Annualised price = monthly × 12; or just price × (12 / periodMonths). */
export function annualizedPrice(t: PricingTier): number {
  if (t.periodMonths <= 0) throw new Error('periodMonths must be > 0');
  return (t.price * 12) / t.periodMonths;
}

/** Plan upgrade — which tier should the user be on given the features they use? */
export function recommendedTier(
  usedFeatures: ReadonlyArray<string>,
  tiers: ReadonlyArray<PricingTier>,
): PricingTier | null {
  if (tiers.length === 0) return null;
  // Pick the cheapest tier that contains all used features.
  for (const t of [...tiers].sort((a, b) => a.price - b.price)) {
    if (usedFeatures.every((f) => t.features.includes(f))) return t;
  }
  return null;
}

/** Free-trial conversion math. */
export function trialConversion(
  trialStarts: number,
  conversions: number,
): { rate: number; breakeven: number } {
  if (trialStarts <= 0) return { rate: 0, breakeven: Number.POSITIVE_INFINITY };
  const rate = conversions / trialStarts;
  // breakeven CAC: arpu × rate − cost ≤ 0 → arpu ≤ cost / rate
  return { rate, breakeven: rate > 0 ? 1 / rate : Number.POSITIVE_INFINITY };
}

/** Net dollar retention — NRR per cohort. */
export function ndr(
  startingArr: number,
  expansion: number,
  contraction: number,
  churn: number,
): number {
  if (startingArr <= 0) return 0;
  return ((startingArr + expansion - contraction - churn) / startingArr) * 100;
}

/** Tiered discount — incremental volume discount. */
export function tieredDiscount(quantity: number, tiers: ReadonlyArray<{ minQty: number; discount: number }>): number {
  if (tiers.length === 0) return 0;
  const sorted = [...tiers].sort((a, b) => b.minQty - a.minQty);
  for (const t of sorted) {
    if (quantity >= t.minQty) return t.discount;
  }
  return 0;
}
