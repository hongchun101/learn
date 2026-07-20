// =============================================================================
// Chapter 09 — Demo
// =============================================================================

import {
  gmv,
  platformRevenue,
  metcalfeValue,
  minimumViableMarketplace,
  isHealthy,
  precision,
  recall,
  f1,
  logLoss,
  llmCost,
  isSafeOutput,
  hallucinationRate,
  refusalRate,
  detectPii,
  redactPii,
  overdueForDeletion,
  dsarCompliance,
  formatCurrency,
  formatDate,
  expansionFactor,
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
} from './index.js';

export function demo(): void {
  // 1. Platform
  const platform: Platform = {
    id: 'p1',
    producers: 500,
    consumers: 10000,
    transactions: 3000,
    takeRate: 0.1,
    avgTransactionValue: 50,
  };
  console.log('[09] GMV            =', gmv(platform));
  console.log('[09] platform rev   =', platformRevenue(platform));
  console.log('[09] metcalfe n=1k  =', metcalfeValue(1000));
  console.log('[09] MVP marketplace =', minimumViableMarketplace(1000, 20, 2));
  console.log('[09] platform healthy=', isHealthy(platform).healthy);

  // 2. AI evaluation
  const p: ClassificationPredictions = { tp: 80, fp: 10, fn: 20, tn: 890 };
  console.log('[09] precision      =', precision(p).toFixed(2));
  console.log('[09] recall         =', recall(p).toFixed(2));
  console.log('[09] F1             =', f1(p).toFixed(2));

  // 3. Log loss
  console.log('[09] log loss 0.9/1 =', logLoss(0.9, 1).toFixed(3));
  console.log('[09] log loss 0.1/1 =', logLoss(0.1, 1).toFixed(3));

  // 4. LLM cost
  const c: LlmCall = { promptTokens: 1000, completionTokens: 500, promptCostPer1k: 0.01, completionCostPer1k: 0.03 };
  console.log('[09] LLM cost       =', llmCost(c).toFixed(4));

  // 5. Safety
  console.log('[09] safe output    =', isSafeOutput('Hello world', ['hack', 'bomb']).safe);
  console.log('[09] unsafe output  =', isSafeOutput('How to hack a server', ['hack']).safe);

  // 6. Hallucination & refusal
  const results = [{ hallucinated: false }, { hallucinated: true }, { hallucinated: false }];
  console.log('[09] halluc rate    =', (hallucinationRate(results) * 100).toFixed(0) + '%');
  const refusals = [{ refused: true }, { refused: false }, { refused: true }];
  console.log('[09] refusal rate   =', (refusalRate(refusals) * 100).toFixed(0) + '%');

  // 7. PII
  const text = 'Contact alice@example.com or call 555-123-4567 from ip 10.0.0.1';
  console.log('[09] PII hits       =', detectPii(text).map((h) => h.type).join(','));
  console.log('[09] redacted       =', redactPii(text));

  // 8. Data retention
  const field: DataField = { id: 'f', name: 'email', category: 'pii', consent: true, retentionDays: 30, lastUpdated: '2025-01-01' };
  console.log('[09] overdue        =', overdueForDeletion(field, '2026-01-01'));
  console.log('[09] DSAR 25 days   =', dsarCompliance(25));
  console.log('[09] DSAR 35 days   =', dsarCompliance(35));

  // 9. i18n
  const us: Locale = { tag: 'en-US', currency: 'USD', dateFormat: 'MDY', decimal: '.', thousand: ',' };
  const de: Locale = { tag: 'de-DE', currency: 'EUR', dateFormat: 'DMY', decimal: ',', thousand: '.' };
  console.log('[09] 1234.5 en-US   =', formatCurrency(1234.5, us));
  console.log('[09] 1234.5 de-DE   =', formatCurrency(1234.5, de));
  console.log('[09] 2026-03-08 en-US=', formatDate(2026, 3, 8, us));
  console.log('[09] 2026-03-08 de-DE=', formatDate(2026, 3, 8, de));
  console.log('[09] expand en→de   =', expansionFactor('en-US', 'de-DE').toFixed(2));
  const lr: LocaleReadiness = { locale: 'de-DE', stringCoverage: 1.0, legalReview: true, support: true, currency: true, paymentMethod: true };
  console.log('[09] DE ready       =', isLocaleLaunchReady(lr));
  console.log('[09] priority 5M,1  =', localePriority(5_000_000, 1));

  // 10. Verticals
  console.log('[09] healthcare    =', requiredFrameworks('healthcare').join(','));
  console.log('[09] gov multiplier=', cycleMultiplier('gov'));
  const er: EnterpriseReadiness = { sso: true, scim: true, auditLogs: true, sla: true, dpia: false };
  console.log('[09] enterprise    =', (enterpriseReadinessScore(er) * 100).toFixed(0) + '%');
}
