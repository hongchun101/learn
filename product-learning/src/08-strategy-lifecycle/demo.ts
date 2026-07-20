// =============================================================================
// Chapter 08 — Demo
// =============================================================================

import {
  bcgBucket,
  geBucket,
  recommendStrategy,
  classifyStage,
  investmentForStage,
  ansoff,
  ansoffRisk,
  portfolioSummary,
  concentrationRisk,
  krProgress,
  okrScore,
  isGoodStrategy,
  chasmPosition,
  wardleyEvolve,
  buildVsBuy,
  type StrategyCheck,
  type Portfolio,
  type KeyResult,
  type Objective,
} from './index.js';

export function demo(): void {
  // 1. BCG & GE
  console.log('[08] BCG star       =', bcgBucket({ marketGrowth: 0.2, relativeShare: 0.7 }));
  console.log('[08] BCG cash-cow   =', bcgBucket({ marketGrowth: 0.05, relativeShare: 0.7 }));
  console.log('[08] BCG ?-mark     =', bcgBucket({ marketGrowth: 0.2, relativeShare: 0.2 }));
  console.log('[08] BCG dog        =', bcgBucket({ marketGrowth: 0.05, relativeShare: 0.2 }));

  // 2. GE/McKinsey
  console.log('[08] GE grow-invest =', geBucket({ marketGrowth: 0.2, relativeShare: 0.7, strategicFit: 8, competitiveStrength: 9 }));
  console.log('[08] strategy for star =', recommendStrategy('star'));

  // 3. Lifecycle
  console.log('[08] stage 2y 30%  =', classifyStage(2, 0.3));
  console.log('[08] stage 5y -10% =', classifyStage(5, -0.1));
  console.log('[08] invest growth =', investmentForStage('growth'));
  console.log('[08] invest decline=', investmentForStage('decline'));

  // 4. Ansoff
  console.log('[08] ansoff current market, current product =', ansoff(true, false, true, false));
  console.log('[08] ansoff risk =', ansoffRisk(ansoff(false, true, true, false)));

  // 5. Portfolio
  const portfolio: Portfolio = {
    products: [
      { id: 'P1', name: 'core', stage: 'maturity', revenue: 100, profit: 30, yearsAlive: 5 },
      { id: 'P2', name: 'new', stage: 'growth', revenue: 20, profit: -5, yearsAlive: 1 },
      { id: 'P3', name: 'old', stage: 'decline', revenue: 5, profit: 1, yearsAlive: 8 },
    ],
  };
  const s = portfolioSummary(portfolio);
  console.log('[08] portfolio     =', `rev=${s.revenue} profit=${s.profit} count=${s.count}`);
  console.log('[08] concentration =', concentrationRisk(portfolio)?.max, (concentrationRisk(portfolio)?.share! * 100).toFixed(0) + '%');

  // 6. OKR
  const krs: KeyResult[] = [
    { id: 'KR1', objectiveId: 'O1', text: 'D7', baseline: 0.2, target: 0.35, actual: 0.3, higherIsBetter: true },
    { id: 'KR2', objectiveId: 'O1', text: 'NPS', baseline: 30, target: 50, actual: 35, higherIsBetter: true },
  ];
  console.log('[08] KR1 progress  =', (krProgress(krs[0]!) * 100).toFixed(0) + '%');
  const obj: Objective = { id: 'O1', title: 'engage', description: 'd' };
  console.log('[08] OKR score     =', (okrScore(obj, krs) * 100).toFixed(0) + '%');

  // 7. Strategy check
  const sc: StrategyCheck = {
    diagnosis: 'we are losing SMB',
    guidingPolicy: 'focus on SMB retention',
    coherentActions: ['- reduce CAC', '- add SSO'],
  };
  console.log('[08] good strategy =', isGoodStrategy(sc).ok);

  // 8. Crossing the chasm
  console.log('[08] chasm e-majority =', chasmPosition('early-majority'));

  // 9. Wardley
  console.log('[08] wardley custom→  =', wardleyEvolve('custom'));
  console.log('[08] build/buy product=', buildVsBuy('product'));
}
