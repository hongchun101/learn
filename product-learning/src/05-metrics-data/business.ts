// =============================================================================
// Chapter 05 — Unit Economics & AARRR
// =============================================================================
// Goal: a healthy product is a sustainable business. This file computes
// LTV, CAC, payback period, AARRR conversions, and the HEART metric tree.
// =============================================================================

/** Inputs for unit economics. */
export interface LtvCacInputs {
  /** Average revenue per user per period (typically month). */
  readonly arpu: number;
  /** Gross margin, 0..1. */
  readonly grossMargin: number;
  /** Monthly churn rate, 0..1. */
  readonly monthlyChurn: number;
  /** Customer acquisition cost. */
  readonly cac: number;
}

export interface LtvCacResult {
  /** Lifetime value = arpu × margin / churn. */
  readonly ltv: number;
  /** LTV / CAC ratio. */
  readonly ratio: number;
  /** Payback in months = cac / (arpu × margin). */
  readonly paybackMonths: number;
}

/** Standard LTV formula. Churn = 0 → infinite LTV. */
export function ltvCac(i: LtvCacInputs): LtvCacResult {
  if (i.arpu < 0 || i.grossMargin < 0 || i.grossMargin > 1 || i.cac < 0) {
    throw new Error('invalid inputs');
  }
  if (i.monthlyChurn === 0) {
    return {
      ltv: Number.POSITIVE_INFINITY,
      ratio: Number.POSITIVE_INFINITY,
      paybackMonths: i.arpu * i.grossMargin > 0 ? i.cac / (i.arpu * i.grossMargin) : 0,
    };
  }
  const ltv = (i.arpu * i.grossMargin) / i.monthlyChurn;
  return {
    ltv,
    ratio: i.cac === 0 ? Number.POSITIVE_INFINITY : ltv / i.cac,
    paybackMonths: i.arpu * i.grossMargin === 0 ? Number.POSITIVE_INFINITY : i.cac / (i.arpu * i.grossMargin),
  };
}

/** AARRR per-stage conversion inputs. */
export interface AarrrResult {
  readonly acquisition: number;
  readonly activation: number;
  readonly retention: number;
  readonly referral: number;
  readonly revenue: number;
}

/** Multiply the five AARRR conversions. */
export function aarrr(r: AarrrResult): number {
  return r.acquisition * r.activation * r.retention * r.referral * r.revenue;
}

/** Magic number — net new ARR divided by sales & marketing spend. */
export function magicNumber(netNewArr: number, smSpend: number): number {
  if (smSpend <= 0) throw new Error('smSpend must be > 0');
  return netNewArr / smSpend;
}

/** Rule of 40 — SaaS growth + margin should exceed 40%. */
export function ruleOf40(growthRate: number, profitMargin: number): boolean {
  return growthRate + profitMargin > 0.4;
}

/** Burn multiple — net burn / net new ARR. < 1 is good. */
export function burnMultiple(netBurn: number, netNewArr: number): number {
  if (netNewArr <= 0) throw new Error('netNewArr must be > 0');
  return netBurn / netNewArr;
}
