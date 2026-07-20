// =============================================================================
// Chapter 03 — Stakeholder Map & Requirements Traceability
// =============================================================================
// Goal: a requirement is no good if it is not traced back to a stakeholder
// and forward to a metric. This file turns that into a small graph.
// =============================================================================

export interface Stakeholder {
  readonly id: string;
  readonly name: string;
  readonly role: 'business' | 'engineering' | 'design' | 'cs' | 'data' | 'legal' | 'security' | 'exec';
  /** Power on a 1..5 scale (ability to veto). */
  readonly power: 1 | 2 | 3 | 4 | 5;
  /** Interest on a 1..5 scale. */
  readonly interest: 1 | 2 | 3 | 4 | 5;
}

/** Power/interest quadrant: 'manage-closely' | 'keep-satisfied' | 'keep-informed' | 'monitor'. */
export type StakeholderQuadrant = 'manage-closely' | 'keep-satisfied' | 'keep-informed' | 'monitor';

export function stakeholderQuadrant(s: Stakeholder): StakeholderQuadrant {
  if (s.power >= 4 && s.interest >= 4) return 'manage-closely';
  if (s.power >= 4) return 'keep-satisfied';
  if (s.interest >= 4) return 'keep-informed';
  return 'monitor';
}

export interface RequirementLink {
  readonly requirementId: string;
  readonly stakeholderId: string;
  readonly metricId?: string;
  /** Why this stakeholder cares. */
  readonly rationale: string;
}

/** Coverage check — every requirement is traced to at least one stakeholder. */
export function uncoveredRequirements(
  requirements: ReadonlyArray<string>,
  links: ReadonlyArray<RequirementLink>,
): string[] {
  const traced = new Set(links.map((l) => l.requirementId));
  return requirements.filter((r) => !traced.has(r));
}

/** Coverage check — every metric is reached by at least one requirement. */
export function orphanMetrics(
  metricIds: ReadonlyArray<string>,
  links: ReadonlyArray<RequirementLink>,
): string[] {
  const reached = new Set<string>();
  for (const l of links) {
    if (l.metricId) reached.add(l.metricId);
  }
  return metricIds.filter((m) => !reached.has(m));
}

/** RACI assignment for a deliverable. */
export type Racis = 'R' | 'A' | 'C' | 'I';

export interface RacisAssignment {
  readonly deliverable: string;
  readonly responsible: string;
  readonly accountable: string;
  readonly consulted: ReadonlyArray<string>;
  readonly informed: ReadonlyArray<string>;
}

/** Validate RACI: exactly one A per deliverable. */
export function racisViolations(assignments: ReadonlyArray<RacisAssignment>): string[] {
  const out: string[] = [];
  for (const a of assignments) {
    if (a.responsible === a.accountable) {
      out.push(`${a.deliverable}: R and A are the same person (${a.responsible})`);
    }
    if (!a.accountable) {
      out.push(`${a.deliverable}: no A`);
    }
  }
  return out;
}
