import { describe, it, expect } from 'vitest';
import {
  viralCoefficient,
  viralGrowth,
  cacPayback,
  monthlyCompound,
  nrr,
  seoRoi,
  priceElasticity,
  stickiness,
  powerLawRetention,
  exponentialRetention,
  weeklyFromDaily,
  habitScore,
  smokeTestResult,
  annualizedPrice,
  recommendedTier,
  trialConversion,
  ndr,
  tieredDiscount,
  experimentSampleSize,
  mSPRT,
  cuped,
  ucb1,
  type PricingTier,
  type BanditArm,
  demo as ch06Demo,
} from '../src/06-growth-monetization/index.js';

describe('06 — growth & viral', () => {
  it('viralCoefficient multiplies three rates', () => {
    expect(viralCoefficient({ invitesPerUser: 2, acceptRate: 0.5, activationRate: 0.5 })).toBeCloseTo(0.5, 6);
  });

  it('viralGrowth is exponential', () => {
    expect(viralGrowth(100, 0.5, 1)).toBeCloseTo(100 * Math.E ** 0.5, 6);
  });

  it('cacPayback = cac / (arpu × margin)', () => {
    expect(cacPayback(200, 50, 0.8)).toBe(5);
    expect(cacPayback(200, 0, 0.8)).toBe(Number.POSITIVE_INFINITY);
  });

  it('monthlyCompound applies compound rate', () => {
    expect(monthlyCompound(1000, 0.1, 1)).toBeCloseTo(1100, 6);
  });

  it('nrr = GR + Expansion - Churn', () => {
    // 1.0 + 0.1 - 0.05 = 1.05
    expect(nrr(1.0, 0.1, 0.05)).toBe(1.05);
  });

  it('seoRoi computes revenue and payback', () => {
    const r = seoRoi({ monthlyClicks: 1000, ctr: 0.5, conversionRate: 0.1, ltv: 100, costPerMonth: 500 });
    expect(r.monthlyRevenue).toBe(5000);
    expect(r.netMonthly).toBe(4500);
    expect(r.paybackMonths).toBeCloseTo(0.1, 6);
  });

  it('priceElasticity is %ΔQ / %ΔP', () => {
    expect(priceElasticity(0.1, -0.2)).toBe(-2);
  });
});

describe('06 — retention & stickiness', () => {
  it('stickiness = DAU/MAU', () => {
    expect(stickiness(2000, 10000)).toBe(0.2);
    expect(stickiness(0, 0)).toBe(0);
  });

  it('powerLawRetention', () => {
    expect(powerLawRetention(1, 1, 0.3)).toBe(1);
    expect(powerLawRetention(0, 1, 0.3)).toBe(1);
    expect(powerLawRetention(100, 1, 0.5)).toBeCloseTo(0.1, 6);
  });

  it('exponentialRetention', () => {
    expect(exponentialRetention(0, 0.05)).toBe(1);
    expect(exponentialRetention(20, 0.05)).toBeCloseTo(Math.exp(-1), 6);
  });

  it('exponentialRetention rejects bad inputs', () => {
    expect(() => exponentialRetention(1, -0.1)).toThrow();
  });

  it('weeklyFromDaily samples day 6, 13, 20, ...', () => {
    const daily = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
    const w = weeklyFromDaily(daily);
    expect(w).toEqual([6, 13]);
  });

  it('habitScore = f * r * (1-e) * (1+i) / 10', () => {
    expect(habitScore({ frequency: 5, reward: 1, effort: 0, investment: 0 })).toBeCloseTo(0.5, 6);
  });

  it('smokeTestResult passes when rate ≥ threshold', () => {
    expect(smokeTestResult({ visitors: 1000, clicks: 60, threshold: 0.05 }).pass).toBe(true);
    expect(smokeTestResult({ visitors: 1000, clicks: 10, threshold: 0.05 }).pass).toBe(false);
  });
});

describe('06 — pricing', () => {
  const tiers: PricingTier[] = [
    { id: 'free', name: 'Free', price: 0, periodMonths: 1, features: ['a'] },
    { id: 'p', name: 'P', price: 12, periodMonths: 1, features: ['a', 'b'] },
    { id: 't', name: 'T', price: 99, periodMonths: 12, features: ['a', 'b', 'c'] },
  ];
  it('annualizedPrice is per-month × 12', () => {
    expect(annualizedPrice(tiers[1]!)).toBe(144);
    expect(annualizedPrice(tiers[2]!)).toBe(99);
  });

  it('annualizedPrice rejects bad period', () => {
    expect(() => annualizedPrice({ id: 'x', name: 'x', price: 1, periodMonths: 0, features: [] })).toThrow();
  });

  it('recommendedTier picks cheapest tier with all features', () => {
    expect(recommendedTier(['a', 'b'], tiers)?.id).toBe('p');
    expect(recommendedTier(['a', 'b', 'c'], tiers)?.id).toBe('t');
    expect(recommendedTier(['z'], tiers)).toBeNull();
  });

  it('trialConversion = rate and breakeven', () => {
    expect(trialConversion(100, 10).rate).toBe(0.1);
    expect(trialConversion(100, 10).breakeven).toBe(10);
    expect(trialConversion(0, 0).rate).toBe(0);
  });

  it('ndr computes net dollar retention', () => {
    expect(ndr(100, 10, 0, 0)).toBeCloseTo(110, 6);
  });

  it('tieredDiscount picks the highest matching tier', () => {
    const t = [{ minQty: 10, discount: 0.05 }, { minQty: 50, discount: 0.1 }];
    expect(tieredDiscount(5, t)).toBe(0);
    expect(tieredDiscount(20, t)).toBe(0.05);
    expect(tieredDiscount(100, t)).toBe(0.1);
  });
});

describe('06 — experiments', () => {
  it('experimentSampleSize is positive', () => {
    const n = experimentSampleSize(0.1, 0.02);
    expect(n).toBeGreaterThan(1000);
  });

  it('experimentSampleSize rejects bad inputs', () => {
    expect(() => experimentSampleSize(0, 0.02)).toThrow();
    expect(() => experimentSampleSize(0.1, 1)).toThrow();
  });

  it('mSPRT rejects when effect is large', () => {
    const r = mSPRT(200, 1000, 0.1);
    expect(r.pValue).toBeLessThan(0.05);
    expect(r.reject).toBe(true);
  });

  it('mSPRT does not reject null', () => {
    const r = mSPRT(102, 1000, 0.1);
    expect(r.reject).toBe(false);
  });

  it('CUPED reduces variance when covariate is informative', () => {
    const y = [10, 12, 14, 16, 18, 20, 22, 24];
    const x = [5, 6, 7, 8, 9, 10, 11, 12];
    const r = cuped(y, x);
    expect(r.theta).toBeCloseTo(2, 6);
    expect(r.varianceReduction).toBeGreaterThan(0.5);
  });

  it('UCB1 explores un-pulled arms first', () => {
    const arms: BanditArm[] = [
      { id: 'A', pulls: 100, reward: 100 },
      { id: 'B', pulls: 0, reward: 0 },
    ];
    expect(ucb1(arms)).toBe('B');
  });

  it('UCB1 returns null on empty', () => {
    expect(ucb1([])).toBeNull();
  });
});

describe('06 — demo runs end-to-end without throwing', () => {
  it('demo() prints and returns', () => {
    const captured: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => {
      captured.push(args.map(String).join(' '));
    };
    try {
      ch06Demo();
    } finally {
      console.log = orig;
    }
    expect(captured.length).toBeGreaterThan(5);
    for (const line of captured) {
      expect(line.startsWith('[06]')).toBe(true);
    }
  });
});
