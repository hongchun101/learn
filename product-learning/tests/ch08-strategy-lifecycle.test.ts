import { describe, it, expect } from 'vitest';
import {
  bcgBucket,
  geBucket,
  recommendStrategy,
  classifyStage,
  investmentForStage,
  ansoff,
  ansoffRisk,
  portfolioSummary,
  revenueByStage,
  concentrationRisk,
  krProgress,
  okrScore,
  isGoodStrategy,
  chasmPosition,
  wardleyEvolve,
  buildVsBuy,
  type KeyResult,
  type Objective,
  type StrategyCheck,
  demo as ch08Demo,
} from '../src/08-strategy-lifecycle/index.js';

describe('08 — BCG & GE', () => {
  it('BCG star', () => {
    expect(bcgBucket({ marketGrowth: 0.15, relativeShare: 0.7 })).toBe('star');
  });
  it('BCG cash-cow', () => {
    expect(bcgBucket({ marketGrowth: 0.05, relativeShare: 0.7 })).toBe('cash-cow');
  });
  it('BCG question-mark', () => {
    expect(bcgBucket({ marketGrowth: 0.2, relativeShare: 0.2 })).toBe('question-mark');
  });
  it('BCG dog', () => {
    expect(bcgBucket({ marketGrowth: 0.05, relativeShare: 0.2 })).toBe('dog');
  });
  it('GE all 9 boxes sample', () => {
    expect(geBucket({ marketGrowth: 0.5, relativeShare: 0.5, strategicFit: 9, competitiveStrength: 9 })).toBe('grow-invest');
    expect(geBucket({ marketGrowth: 0.5, relativeShare: 0.5, strategicFit: 5, competitiveStrength: 5 })).toBe('selectivity-risk');
    expect(geBucket({ marketGrowth: 0.5, relativeShare: 0.5, strategicFit: 2, competitiveStrength: 2 })).toBe('divest');
  });
  it('recommendStrategy per bucket', () => {
    expect(recommendStrategy('star')).toMatch(/invest/);
    expect(recommendStrategy('dog')).toMatch(/divest|harvest/);
  });
});

describe('08 — lifecycle', () => {
  it('classifyStage', () => {
    expect(classifyStage(0, 0)).toBe('introduction');
    expect(classifyStage(1, 0.2)).toBe('growth');
    expect(classifyStage(5, -0.1)).toBe('decline');
    expect(classifyStage(10, 0.05)).toBe('maturity');
  });
  it('investmentForStage', () => {
    expect(investmentForStage('growth')).toBe('invest');
    expect(investmentForStage('decline')).toBe('harvest');
  });
  it('ansoff quadrants', () => {
    expect(ansoff(true, false, true, false)).toBe('market-penetration');
    expect(ansoff(false, true, true, false)).toBe('market-development');
    expect(ansoff(true, false, false, true)).toBe('product-development');
    expect(ansoff(false, true, false, true)).toBe('diversification');
  });
  it('ansoffRisk', () => {
    expect(ansoffRisk('market-penetration')).toBe('low');
    expect(ansoffRisk('diversification')).toBe('high');
  });
  it('portfolioSummary', () => {
    const s = portfolioSummary({
      products: [
        { id: 'a', name: 'a', stage: 'maturity', revenue: 100, profit: 10, yearsAlive: 5 },
        { id: 'b', name: 'b', stage: 'growth', revenue: 50, profit: 5, yearsAlive: 2 },
      ],
    });
    expect(s.revenue).toBe(150);
    expect(s.profit).toBe(15);
  });
  it('revenueByStage', () => {
    const r = revenueByStage({
      products: [
        { id: 'a', name: 'a', stage: 'maturity', revenue: 100, profit: 10, yearsAlive: 5 },
        { id: 'b', name: 'b', stage: 'growth', revenue: 50, profit: 5, yearsAlive: 2 },
        { id: 'c', name: 'c', stage: 'maturity', revenue: 50, profit: 0, yearsAlive: 5 },
      ],
    });
    expect(r.maturity).toBe(150);
    expect(r.growth).toBe(50);
  });
  it('concentrationRisk', () => {
    const cr = concentrationRisk({
      products: [
        { id: 'a', name: 'a', stage: 'maturity', revenue: 100, profit: 0, yearsAlive: 5 },
        { id: 'b', name: 'b', stage: 'growth', revenue: 0, profit: 0, yearsAlive: 2 },
      ],
    });
    expect(cr?.max).toBe('maturity');
    expect(cr?.share).toBe(1);
  });
});

describe('08 — OKRs & strategy', () => {
  it('krProgress higher-is-better', () => {
    const kr: KeyResult = { id: '1', objectiveId: 'o', text: 't', baseline: 0, target: 10, actual: 5, higherIsBetter: true };
    expect(krProgress(kr)).toBeCloseTo(0.5, 6);
  });
  it('krProgress lower-is-better', () => {
    const kr: KeyResult = { id: '1', objectiveId: 'o', text: 't', baseline: 10, target: 0, actual: 5, higherIsBetter: false };
    expect(krProgress(kr)).toBeCloseTo(0.5, 6);
  });
  it('krProgress clamps', () => {
    const kr: KeyResult = { id: '1', objectiveId: 'o', text: 't', baseline: 0, target: 10, actual: 100, higherIsBetter: true };
    expect(krProgress(kr)).toBe(1);
  });
  it('okrScore averages KR progress', () => {
    const obj: Objective = { id: 'o', title: 't', description: 'd' };
    const krs: KeyResult[] = [
      { id: '1', objectiveId: 'o', text: 'a', baseline: 0, target: 10, actual: 10, higherIsBetter: true },
      { id: '2', objectiveId: 'o', text: 'b', baseline: 0, target: 10, actual: 0, higherIsBetter: true },
    ];
    expect(okrScore(obj, krs)).toBeCloseTo(0.5, 6);
  });
  it('isGoodStrategy flags missing parts', () => {
    const sc: StrategyCheck = { diagnosis: '', guidingPolicy: 'p', coherentActions: [] };
    const r = isGoodStrategy(sc);
    expect(r.ok).toBe(false);
    expect(r.missing).toContain('diagnosis');
  });
  it('isGoodStrategy passes for complete strategy', () => {
    const sc: StrategyCheck = { diagnosis: 'd', guidingPolicy: 'p', coherentActions: ['a'] };
    expect(isGoodStrategy(sc).ok).toBe(true);
  });
  it('chasmPosition', () => {
    expect(chasmPosition('early-adopters')).toBe('pre-chasm');
    expect(chasmPosition('early-majority')).toBe('in-chasm');
    expect(chasmPosition('laggards')).toBe('post-chasm');
  });
  it('wardleyEvolve advances and saturates', () => {
    expect(wardleyEvolve('genesis')).toBe('custom');
    expect(wardleyEvolve('custom')).toBe('product');
    expect(wardleyEvolve('product')).toBe('commodity');
    expect(wardleyEvolve('commodity')).toBe('commodity');
  });
  it('buildVsBuy per Wardley stage', () => {
    expect(buildVsBuy('genesis')).toBe('build');
    expect(buildVsBuy('product')).toBe('differentiate');
    expect(buildVsBuy('commodity')).toBe('buy');
  });
});

describe('08 — demo runs end-to-end without throwing', () => {
  it('demo() prints and returns', () => {
    const captured: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => {
      captured.push(args.map(String).join(' '));
    };
    try {
      ch08Demo();
    } finally {
      console.log = orig;
    }
    expect(captured.length).toBeGreaterThan(5);
    for (const line of captured) {
      expect(line.startsWith('[08]')).toBe(true);
    }
  });
});
