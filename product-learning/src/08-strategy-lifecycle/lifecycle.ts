// =============================================================================
// Chapter 08 — Product Life-Cycle & Ansoff
// =============================================================================

import type { Portfolio, LifecycleStage } from './models.js';

/** Classify a product's stage from years alive + revenue trend. */
export function classifyStage(
  yearsAlive: number,
  /** Most recent vs prior year. */
  recentGrowth: number,
): LifecycleStage {
  if (yearsAlive < 1) return 'introduction';
  if (yearsAlive < 3 && recentGrowth > 0.1) return 'growth';
  if (recentGrowth < -0.05) return 'decline';
  if (recentGrowth < 0.1) return 'maturity';
  return 'growth';
}

/** Recommend investment per stage. */
export function investmentForStage(s: LifecycleStage): 'invest' | 'maintain' | 'harvest' | 'sunset' {
  if (s === 'introduction' || s === 'growth') return 'invest';
  if (s === 'maturity') return 'maintain';
  if (s === 'decline') return 'harvest';
  return 'sunset';
}

/** Ansoff matrix — given a current and new combo, return the risk. */
export type AnsoffQuadrant = 'market-penetration' | 'market-development' | 'product-development' | 'diversification';

export function ansoff(
  currentMarket: boolean,
  newMarket: boolean,
  currentProduct: boolean,
  newProduct: boolean,
): AnsoffQuadrant {
  if (currentMarket && currentProduct && !newMarket && !newProduct) return 'market-penetration';
  if (!currentMarket && currentProduct) return 'market-development';
  if (currentMarket && !currentProduct) return 'product-development';
  return 'diversification';
}

/** Risk per Ansoff quadrant (subjective, widely-cited). */
export function ansoffRisk(q: AnsoffQuadrant): 'low' | 'med' | 'high' {
  if (q === 'market-penetration') return 'low';
  if (q === 'market-development' || q === 'product-development') return 'med';
  return 'high';
}

/** Total revenue & profit of a portfolio. */
export function portfolioSummary(p: Portfolio): { revenue: number; profit: number; count: number } {
  return {
    revenue: p.products.reduce((a, b) => a + b.revenue, 0),
    profit: p.products.reduce((a, b) => a + b.profit, 0),
    count: p.products.length,
  };
}

/** Revenue by lifecycle stage. */
export function revenueByStage(p: Portfolio): Readonly<Record<LifecycleStage, number>> {
  const out: Record<LifecycleStage, number> = { introduction: 0, growth: 0, maturity: 0, decline: 0 };
  for (const product of p.products) out[product.stage] += product.revenue;
  return out;
}

/** Pivoting — does the portfolio over-rely on a single stage? */
export function concentrationRisk(p: Portfolio): { max: LifecycleStage; share: number } | null {
  const stages = revenueByStage(p);
  const total = Object.values(stages).reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  let maxStage: LifecycleStage = 'introduction';
  let maxValue = -1;
  for (const [k, v] of Object.entries(stages) as [LifecycleStage, number][]) {
    if (v > maxValue) {
      maxValue = v;
      maxStage = k;
    }
  }
  return { max: maxStage, share: maxValue / total };
}
