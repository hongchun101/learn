// =============================================================================
// Chapter 09 — Privacy, Security, Compliance
// =============================================================================
// Goal: privacy is a product surface, not just a legal checkbox. This file
// implements GDPR principles: data minimisation, retention windows,
// consent rates, DSAR accounting, and a PII detector (lightweight regex).
//
// References:
//   * GDPR Articles 5, 6, 17, 20, 25, 32, 35.
//   * NIST 800-53, "Security and Privacy Controls".
// =============================================================================

export type LegalBasis = 'consent' | 'contract' | 'legal-obligation' | 'vital-interest' | 'public-task' | 'legitimate-interest';

export interface DataField {
  readonly id: string;
  readonly name: string;
  /** What category of data. */
  readonly category: 'pii' | 'sensitive' | 'behavioural' | 'derived';
  /** Whether the user has given consent. */
  readonly consent: boolean;
  /** Retention in days. */
  readonly retentionDays: number;
  /** When the data was last updated, ISO string. */
  readonly lastUpdated: string;
}

/** A PII field requires consent, sensitive requires explicit consent. */
export function consentRequired(f: DataField): boolean {
  return f.category === 'pii' || f.category === 'sensitive';
}

export function legalBasisFor(f: DataField): LegalBasis {
  if (f.consent) return 'consent';
  if (f.category === 'behavioural') return 'legitimate-interest';
  return 'contract';
}

/** Is this field overdue for deletion per the retention window? */
export function overdueForDeletion(f: DataField, now: string): boolean {
  const updated = Date.parse(f.lastUpdated);
  const due = updated + f.retentionDays * 24 * 60 * 60 * 1000;
  return Date.parse(now) > due;
}

/** Data minimisation score — 0..1, higher = leaner. */
export function dataMinimisationScore(
  fields: ReadonlyArray<DataField>,
  required: ReadonlyArray<string>,
): number {
  if (fields.length === 0) return 1;
  const requiredSet = new Set(required);
  const used = fields.filter((f) => requiredSet.has(f.id)).length;
  return required.length === 0 ? 1 : used / required.length;
}

/** PII detection — light-weight, no regex blowups. */
const PII_PATTERNS: ReadonlyArray<{ name: string; regex: RegExp }> = [
  { name: 'email', regex: /\b[\w._%+-]+@[\w.-]+\.[A-Za-z]{2,}\b/ },
  { name: 'phone', regex: /\b(?:\+?\d{1,3}[ -]?)?\(?\d{3}\)?[ -]?\d{3}[ -]?\d{4}\b/ },
  { name: 'ssn-us', regex: /\b\d{3}-\d{2}-\d{4}\b/ },
  { name: 'credit-card', regex: /\b(?:\d[ -]?){13,16}\b/ },
  { name: 'ip', regex: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/ },
];

export interface PiiHit {
  readonly type: string;
  readonly match: string;
  readonly index: number;
}

export function detectPii(text: string): ReadonlyArray<PiiHit> {
  const out: PiiHit[] = [];
  for (const p of PII_PATTERNS) {
    let m: RegExpExecArray | null;
    const re = new RegExp(p.regex.source, p.regex.flags + 'g');
    while ((m = re.exec(text)) !== null) {
      out.push({ type: p.name, match: m[0], index: m.index });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  return out;
}

/** Redact detected PII. */
export function redactPii(text: string, replacement = '[REDACTED]'): string {
  let out = text;
  for (const hit of detectPii(text)) {
    out = out.replace(hit.match, replacement);
  }
  return out;
}

/** DSAR accounting — days to fulfil a deletion request (GDPR: ≤30). */
export function dsarCompliance(days: number, maxDays = 30): boolean {
  return days <= maxDays;
}
