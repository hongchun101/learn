import { describe, it, expect } from 'vitest';
import {
  gmv,
  platformRevenue,
  metcalfeValue,
  minimumViableMarketplace,
  liquidity,
  isHealthy,
  precision,
  recall,
  f1,
  accuracy,
  logLoss,
  evaluate,
  llmCost,
  isSafeOutput,
  hallucinationRate,
  refusalRate,
  consentRequired,
  legalBasisFor,
  overdueForDeletion,
  dataMinimisationScore,
  detectPii,
  redactPii,
  dsarCompliance,
  formatCurrency,
  formatDate,
  expansionFactor,
  expandedWidth,
  isLocaleLaunchReady,
  localePriority,
  requiredFrameworks,
  cycleMultiplier,
  enterpriseReadinessScore,
  type Platform,
  type ClassificationPredictions,
  type LlmCall,
  type DataField,
  type Locale,
  type LocaleReadiness,
  type EnterpriseReadiness,
  demo as ch09Demo,
} from '../src/09-advanced-topics/index.js';

describe('09 — platform', () => {
  const p: Platform = {
    id: 'p',
    producers: 100,
    consumers: 1000,
    transactions: 300,
    takeRate: 0.1,
    avgTransactionValue: 50,
  };
  it('GMV = transactions × ATV', () => {
    expect(gmv(p)).toBe(15000);
  });
  it('platformRevenue = GMV × take rate', () => {
    expect(platformRevenue(p)).toBe(1500);
  });
  it('metcalfeValue = n²', () => {
    expect(metcalfeValue(10)).toBe(100);
  });
  it('minimumViableMarketplace', () => {
    const r = minimumViableMarketplace(1000, 20, 2);
    expect(r.consumers).toBe(500);
    expect(r.producers).toBe(25);
  });
  it('liquidity = tx/consumer', () => {
    expect(liquidity(p)).toBe(0.3);
  });
  it('isHealthy when liquidity > 0.25 and ratio sane', () => {
    expect(isHealthy(p).healthy).toBe(true);
  });
});

describe('09 — AI evaluation', () => {
  const p: ClassificationPredictions = { tp: 80, fp: 10, fn: 20, tn: 890 };
  it('precision', () => {
    expect(precision(p)).toBeCloseTo(80 / 90, 6);
  });
  it('recall', () => {
    expect(recall(p)).toBeCloseTo(80 / 100, 6);
  });
  it('f1', () => {
    const pr = 80 / 90;
    const rc = 80 / 100;
    expect(f1(p)).toBeCloseTo((2 * pr * rc) / (pr + rc), 6);
  });
  it('accuracy', () => {
    expect(accuracy(p)).toBeCloseTo(970 / 1000, 6);
  });
  it('logLoss', () => {
    expect(logLoss(0.9, 1)).toBeLessThan(0.2);
    expect(logLoss(0.1, 1)).toBeGreaterThan(2);
  });
  it('evaluate returns report', () => {
    const r = evaluate(p);
    expect(r.precision).toBeGreaterThan(0);
    expect(r.recall).toBeGreaterThan(0);
  });
  it('llmCost = prompt/1k * pCost + completion/1k * cCost', () => {
    const c: LlmCall = { promptTokens: 1000, completionTokens: 500, promptCostPer1k: 0.01, completionCostPer1k: 0.03 };
    expect(llmCost(c)).toBeCloseTo(0.01 + 0.015, 6);
  });
  it('isSafeOutput', () => {
    expect(isSafeOutput('hello', ['bomb']).safe).toBe(true);
    expect(isSafeOutput('bomb', ['bomb']).safe).toBe(false);
  });
  it('hallucinationRate / refusalRate', () => {
    expect(hallucinationRate([{ hallucinated: true }, { hallucinated: false }])).toBe(0.5);
    expect(refusalRate([{ refused: true }])).toBe(1);
  });
});

describe('09 — privacy & PII', () => {
  it('detectPii catches email, phone, ssn, ip, cc', () => {
    const text = 'alice@example.com 555-123-4567 123-45-6789 10.0.0.1 4111-1111-1111-1111';
    const hits = detectPii(text);
    const types = new Set(hits.map((h) => h.type));
    expect(types.has('email')).toBe(true);
    expect(types.has('phone')).toBe(true);
    expect(types.has('ssn-us')).toBe(true);
    expect(types.has('ip')).toBe(true);
  });
  it('redactPii replaces', () => {
    const out = redactPii('email me at alice@example.com', '[X]');
    expect(out).toContain('[X]');
    expect(out).not.toContain('alice@example.com');
  });
  it('consentRequired', () => {
    expect(consentRequired({ id: 'a', name: 'a', category: 'pii', consent: true, retentionDays: 1, lastUpdated: 'x' })).toBe(true);
    expect(consentRequired({ id: 'a', name: 'a', category: 'behavioural', consent: false, retentionDays: 1, lastUpdated: 'x' })).toBe(false);
  });
  it('legalBasisFor', () => {
    const f: DataField = { id: 'a', name: 'a', category: 'behavioural', consent: false, retentionDays: 1, lastUpdated: 'x' };
    expect(legalBasisFor(f)).toBe('legitimate-interest');
  });
  it('overdueForDeletion', () => {
    const f: DataField = { id: 'a', name: 'a', category: 'pii', consent: true, retentionDays: 30, lastUpdated: '2025-01-01' };
    expect(overdueForDeletion(f, '2026-01-01')).toBe(true);
  });
  it('dataMinimisationScore', () => {
    const fields: DataField[] = [
      { id: 'a', name: 'a', category: 'pii', consent: true, retentionDays: 1, lastUpdated: 'x' },
      { id: 'b', name: 'b', category: 'pii', consent: true, retentionDays: 1, lastUpdated: 'x' },
    ];
    expect(dataMinimisationScore(fields, ['a'])).toBe(1);
    expect(dataMinimisationScore(fields, ['a', 'b', 'c'])).toBeCloseTo(2 / 3, 6);
  });
  it('dsarCompliance', () => {
    expect(dsarCompliance(25)).toBe(true);
    expect(dsarCompliance(35)).toBe(false);
  });
});

describe('09 — i18n', () => {
  const us: Locale = { tag: 'en-US', currency: 'USD', dateFormat: 'MDY', decimal: '.', thousand: ',' };
  const de: Locale = { tag: 'de-DE', currency: 'EUR', dateFormat: 'DMY', decimal: ',', thousand: '.' };
  it('formatCurrency locale-aware', () => {
    expect(formatCurrency(1234.5, us)).toBe('USD 1,234.50');
    expect(formatCurrency(1234.5, de)).toBe('EUR 1.234,50');
  });
  it('formatDate', () => {
    expect(formatDate(2026, 3, 8, us)).toBe('03/08/2026');
    expect(formatDate(2026, 3, 8, de)).toBe('08/03/2026');
  });
  it('expansionFactor en→de ≈ 1.35', () => {
    expect(expansionFactor('en-US', 'de-DE')).toBeCloseTo(1.35, 2);
  });
  it('expandedWidth', () => {
    expect(expandedWidth(100, 'en-US', 'de-DE')).toBeCloseTo(135, 6);
  });
  it('isLocaleLaunchReady', () => {
    const ok: LocaleReadiness = { locale: 'de', stringCoverage: 1, legalReview: true, support: true, currency: true, paymentMethod: true };
    const bad: LocaleReadiness = { ...ok, paymentMethod: false, stringCoverage: 0.9 };
    expect(isLocaleLaunchReady(ok)).toBe(true);
    expect(isLocaleLaunchReady(bad)).toBe(false);
  });
  it('localePriority = market × readiness × strategic', () => {
    expect(localePriority(1000, 0.5, 2)).toBe(1000);
  });
});

describe('09 — verticals', () => {
  it('requiredFrameworks', () => {
    expect(requiredFrameworks('healthcare')).toContain('HIPAA');
    expect(requiredFrameworks('gov')).toContain('FedRAMP');
  });
  it('cycleMultiplier', () => {
    expect(cycleMultiplier('gov')).toBeGreaterThan(cycleMultiplier('consumer'));
  });
  it('enterpriseReadinessScore', () => {
    const all: EnterpriseReadiness = { sso: true, scim: true, auditLogs: true, sla: true, dpia: true };
    expect(enterpriseReadinessScore(all)).toBe(1);
    const none: EnterpriseReadiness = { sso: false, scim: false, auditLogs: false, sla: false, dpia: false };
    expect(enterpriseReadinessScore(none)).toBe(0);
  });
});

describe('09 — demo runs end-to-end without throwing', () => {
  it('demo() prints and returns', () => {
    const captured: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => {
      captured.push(args.map(String).join(' '));
    };
    try {
      ch09Demo();
    } finally {
      console.log = orig;
    }
    expect(captured.length).toBeGreaterThan(5);
    for (const line of captured) {
      expect(line.startsWith('[09]')).toBe(true);
    }
  });
});
