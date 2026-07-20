// =============================================================================
// Chapter 06 — Growth & Monetization
// =============================================================================
// Goal: a product is a business; a business has unit economics and growth
// loops. This file turns the named formulas — viral coefficient, retention
// decay, network effects, pricing elasticity, and SEO/CAC economics — into
// pure functions.
//
// References:
//   * Andrew Chen, "The Cold Start Problem", 2021.
//   * Rob Liff, "For Entrepreneurs", pricing principles.
//   * David Skok, "SaaS Metrics 2.0".
// =============================================================================

/** A viral loop: invites sent → invites accepted → new users. */
export interface ViralLoop {
  /** Invites sent per user per period. */
  readonly invitesPerUser: number;
  /** Acceptance rate, 0..1. */
  readonly acceptRate: number;
  /** Fraction of new signups that become active users, 0..1. */
  readonly activationRate: number;
}

/** K-factor = invites × accept rate × activation. */
export function viralCoefficient(v: ViralLoop): number {
  return v.invitesPerUser * v.acceptRate * v.activationRate;
}

/** Exponential growth: N(t) = N(0) * e^(k * t), given K-factor k. */
export function viralGrowth(
  initialUsers: number,
  k: number,
  periods: number,
): number {
  return initialUsers * Math.exp(k * periods);
}

/** CAC payback in months. */
export function cacPayback(cac: number, arpu: number, grossMargin: number): number {
  if (arpu * grossMargin <= 0) return Number.POSITIVE_INFINITY;
  return cac / (arpu * grossMargin);
}

/** Monthly compounding growth from a single rate. */
export function monthlyCompound(startValue: number, monthlyRate: number, months: number): number {
  return startValue * Math.pow(1 + monthlyRate, months);
}

/** Net revenue retention — gross retention × expansion. */
export function nrr(grossRetention: number, expansionRate: number, churnRate: number): number {
  // NRR = GR + Expansion - Churn (here expansion already net of churn in the rate)
  return grossRetention + expansionRate - churnRate;
}

/** SEO content economics: estimated traffic × conversion × LTV. */
export interface SeoContent {
  /** Estimated monthly organic clicks. */
  readonly monthlyClicks: number;
  /** Click-through rate to the product, 0..1. */
  readonly ctr: number;
  /** Conversion to paid, 0..1. */
  readonly conversionRate: number;
  /** LTV of a converted user. */
  readonly ltv: number;
  /** Cost to produce + maintain per month. */
  readonly costPerMonth: number;
}

export function seoRoi(c: SeoContent): { monthlyRevenue: number; netMonthly: number; paybackMonths: number | null } {
  const monthlyRevenue = c.monthlyClicks * c.ctr * c.conversionRate * c.ltv;
  const netMonthly = monthlyRevenue - c.costPerMonth;
  if (c.costPerMonth <= 0) {
    return { monthlyRevenue, netMonthly, paybackMonths: null };
  }
  return {
    monthlyRevenue,
    netMonthly,
    paybackMonths: monthlyRevenue > 0 ? c.costPerMonth / monthlyRevenue : Number.POSITIVE_INFINITY,
  };
}

/** Pricing elasticity — % change in quantity / % change in price. */
export function priceElasticity(priceChange: number, quantityChange: number): number {
  if (priceChange === 0) return 0;
  return quantityChange / priceChange;
}
