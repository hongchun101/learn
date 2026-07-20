// =============================================================================
// Chapter 09 — Vertical & Domain-Specific Products
// =============================================================================
// Goal: a PM working in a vertical (healthcare, fintech, gov, edtech)
// has to internalise domain-specific rules. This file encodes the most
// common regulatory and design constraints as computable checks.
// =============================================================================

export type Vertical = 'healthcare' | 'fintech' | 'gov' | 'edtech' | 'enterprise' | 'consumer' | 'devtools';

/** Compliance frameworks per vertical. */
export const COMPLIANCE: Readonly<Record<Vertical, ReadonlyArray<string>>> = {
  healthcare: ['HIPAA', 'GDPR', 'FDA-21CFR11'],
  fintech: ['PCI-DSS', 'SOX', 'KYC-AML'],
  gov: ['FedRAMP', 'FISMA', 'Section-508'],
  edtech: ['FERPA', 'COPPA', 'GDPR'],
  enterprise: ['SOC2', 'ISO-27001'],
  consumer: ['GDPR', 'CCPA'],
  devtools: ['SOC2'],
};

export function requiredFrameworks(v: Vertical): ReadonlyArray<string> {
  return COMPLIANCE[v];
}

/** Cycle-time adjustment for compliance-heavy verticals (slower). */
export function cycleMultiplier(v: Vertical): number {
  if (v === 'gov') return 2.5;
  if (v === 'healthcare' || v === 'fintech') return 1.5;
  if (v === 'edtech') return 1.2;
  return 1.0;
}

/** B2B product: 4 enterprise sales readiness signals. */
export interface EnterpriseReadiness {
  readonly sso: boolean;
  readonly scim: boolean;
  readonly auditLogs: boolean;
  readonly sla: boolean;
  readonly dpia: boolean;
}

export function enterpriseReadinessScore(r: EnterpriseReadiness): number {
  const items = [r.sso, r.scim, r.auditLogs, r.sla, r.dpia];
  return items.filter(Boolean).length / items.length;
}
