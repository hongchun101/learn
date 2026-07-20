// =============================================================================
// Chapter 07 — Decision-Making, Stakeholder Management, Conflict
// =============================================================================
// Goal: a PM spends half their time in meetings. This file encodes
// the most common group-decision protocols and a stakeholder mapping
// helper that overlaps with chapter 3 but adds collaboration-specific
// insights.
// =============================================================================

/** A weighted decision matrix. */
export interface DecisionMatrix {
  readonly criteria: ReadonlyArray<{ id: string; weight: number }>;
  readonly options: ReadonlyArray<{ id: string; name: string; scores: Readonly<Record<string, number>> }>;
}

export function decisionScore(matrix: DecisionMatrix, optionId: string): number {
  const opt = matrix.options.find((o) => o.id === optionId);
  if (!opt) return 0;
  return matrix.criteria.reduce((acc, c) => acc + c.weight * (opt.scores[c.id] ?? 0), 0);
}

export function rankOptions(matrix: DecisionMatrix): ReadonlyArray<{ id: string; name: string; score: number }> {
  return [...matrix.options]
    .map((o) => ({ id: o.id, name: o.name, score: decisionScore(matrix, o.id) }))
    .sort((a, b) => b.score - a.score);
}

/** Consensus — does a straw poll reach a supermajority? */
export function consensus(votes: ReadonlyArray<'yes' | 'no' | 'abstain'>, threshold = 0.66): boolean {
  const effective = votes.filter((v) => v !== 'abstain');
  if (effective.length === 0) return false;
  const yes = effective.filter((v) => v === 'yes').length;
  return yes / effective.length >= threshold;
}

/** Conflict-of-interest filter — exclude self-graded reviews. */
export interface Review {
  readonly reviewer: string;
  readonly subject: string;
  readonly score: number;
}

/** Detect reciprocated high scores — may indicate collusion. */
export function collusionPairs(reviews: ReadonlyArray<Review>, threshold = 4.5): ReadonlyArray<[string, string]> {
  const bySubject = new Map<string, Review[]>();
  for (const r of reviews) {
    const bucket = bySubject.get(r.subject) ?? [];
    bucket.push(r);
    bySubject.set(r.subject, bucket);
  }
  const out: [string, string][] = [];
  for (const [subject, list] of bySubject) {
    const mutual = list.filter((r) => r.score >= threshold && r.reviewer === subject);
    if (mutual.length > 0) {
      out.push([mutual[0]!.reviewer, subject]);
    }
  }
  return out;
}

/** Meeting cost — attendees × duration × loaded hourly rate. */
export function meetingCost(
  attendees: number,
  durationMin: number,
  loadedHourlyRate: number,
): number {
  return (attendees * durationMin * loadedHourlyRate) / 60;
}

/** Working-backwards press release — a named Amazon artifact. */
export interface WorkingBackwardsDoc {
  /** A fictional press release. */
  readonly headline: string;
  readonly summary: string;
  /** Customer problem & solution. */
  readonly problem: string;
  readonly solution: string;
  /** "Quote" from a customer. */
  readonly quote: string;
  /** "How will we know it worked?" */
  readonly successMetrics: ReadonlyArray<string>;
}

/** Score a working-backwards doc — internal-vs-customer slant. */
export function slantScore(doc: WorkingBackwardsDoc): { customer: number; internal: number } {
  const ctas = (doc.problem + doc.solution + doc.quote).toLowerCase();
  const customerWords = (ctas.match(/\b(customer|user|client)\b/g) ?? []).length;
  const internalWords = (ctas.match(/\b(we|our|us|system|engineer)\b/g) ?? []).length;
  return { customer: customerWords, internal: internalWords };
}
