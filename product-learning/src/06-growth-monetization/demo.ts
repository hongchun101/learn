// =============================================================================
// Chapter 06 — Demo
// =============================================================================

import {
  viralCoefficient,
  viralGrowth,
  cacPayback,
  monthlyCompound,
  seoRoi,
  priceElasticity,
  stickiness,
  powerLawRetention,
  exponentialRetention,
  habitScore,
  smokeTestResult,
  annualizedPrice,
  recommendedTier,
  ndr,
  tieredDiscount,
  experimentSampleSize,
  mSPRT,
  cuped,
  ucb1,
  type PricingTier,
  type ViralLoop,
  type BanditArm,
} from './index.js';

export function demo(): void {
  // 1. Viral coefficient
  const v: ViralLoop = { invitesPerUser: 5, acceptRate: 0.3, activationRate: 0.5 };
  console.log('[06] K-factor       =', viralCoefficient(v).toFixed(2));
  console.log('[06] viral growth 6 =', viralGrowth(1000, viralCoefficient(v), 6).toFixed(0));

  // 2. CAC payback
  console.log('[06] CAC payback    =', cacPayback(200, 50, 0.8).toFixed(1), 'mo');

  // 3. Monthly compound
  console.log('[06] 10% MoM x 12   =', monthlyCompound(1000, 0.1, 12).toFixed(0));

  // 4. NRR
  console.log('[06] NDR 110%       =', ndr(100, 15, 5, 0).toFixed(1) + '%');

  // 5. SEO
  const seo = seoRoi({ monthlyClicks: 5000, ctr: 0.2, conversionRate: 0.02, ltv: 200, costPerMonth: 1000 });
  console.log('[06] SEO net/mo     =', seo.netMonthly.toFixed(0), 'payback=' + (seo.paybackMonths?.toFixed(1) ?? '∞') + 'mo');

  // 6. Price elasticity
  console.log('[06] price elast    =', priceElasticity(0.1, -0.2).toFixed(2));

  // 7. Stickiness
  console.log('[06] stickiness     =', (stickiness(2000, 10000) * 100).toFixed(0) + '%');

  // 8. Power law & exponential retention
  console.log('[06] power-law D30  =', (powerLawRetention(30, 1, 0.3) * 100).toFixed(1) + '%');
  console.log('[06] exp D30 λ=0.05 =', (exponentialRetention(30, 0.05) * 100).toFixed(1) + '%');

  // 9. Habit
  console.log('[06] habit score    =', habitScore({ frequency: 5, reward: 0.8, effort: 0.2, investment: 0.3 }).toFixed(2));

  // 10. Smoke test
  console.log('[06] smoke test     =', smokeTestResult({ visitors: 1000, clicks: 60, threshold: 0.05 }).pass);

  // 11. Pricing
  const tiers: PricingTier[] = [
    { id: 'free', name: 'Free', price: 0, periodMonths: 1, features: ['read'] },
    { id: 'pro', name: 'Pro', price: 20, periodMonths: 1, features: ['read', 'write'] },
    { id: 'team', name: 'Team', price: 50, periodMonths: 1, features: ['read', 'write', 'sso'] },
  ];
  console.log('[06] annual pro     =', annualizedPrice(tiers[1]!));
  console.log('[06] tier for [read,write,sso] =', recommendedTier(['read', 'write', 'sso'], tiers)?.id);

  // 12. NDR
  console.log('[06] NDR 110%       =', ndr(100, 15, 5, 0).toFixed(1) + '%');

  // 13. Tiered discount
  console.log('[06] discount 100u  =', (tieredDiscount(100, [{ minQty: 50, discount: 0.1 }, { minQty: 10, discount: 0.05 }]) * 100).toFixed(0) + '%');

  // 14. Sample size
  console.log('[06] sample size    =', experimentSampleSize(0.1, 0.02));

  // 15. mSPRT
  const s = mSPRT(120, 1000, 0.1);
  console.log('[06] mSPRT p=0.001? =', s.pValue < 0.05, 'p=' + s.pValue.toFixed(4));

  // 16. CUPED
  const c = cuped([10, 12, 14, 16, 18], [9, 11, 14, 15, 19]);
  console.log('[06] CUPED theta    =', c.theta.toFixed(3), 'reduction=' + (c.varianceReduction * 100).toFixed(0) + '%');

  // 17. UCB1
  const arms: BanditArm[] = [
    { id: 'A', pulls: 100, reward: 10 },
    { id: 'B', pulls: 80, reward: 12 },
    { id: 'C', pulls: 50, reward: 4 },
  ];
  console.log('[06] UCB1 best arm  =', ucb1(arms));
}
