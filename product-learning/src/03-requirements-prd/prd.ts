// =============================================================================
// Chapter 03 — PRD Validation & Generation
// =============================================================================
// Goal: a PRD that is missing goal statements, has unbounded scope, or
// contains a story with no acceptance criteria is not a PRD. This file
// encodes a validator + a markdown renderer.
// =============================================================================

import type { Prd, UserStory, AcceptanceCriterion } from './models.js';

export interface PrdValidationIssue {
  readonly severity: 'error' | 'warning';
  readonly message: string;
}

export function validatePrd(prd: Prd): PrdValidationIssue[] {
  const issues: PrdValidationIssue[] = [];
  if (!prd.problem.trim()) {
    issues.push({ severity: 'error', message: 'problem statement is empty' });
  }
  if (prd.goals.length === 0) {
    issues.push({ severity: 'error', message: 'no goals defined' });
  }
  if (prd.nonGoals.length === 0) {
    issues.push({ severity: 'warning', message: 'no non-goals — out-of-scope is unclear' });
  }
  if (prd.successMetrics.length === 0) {
    issues.push({ severity: 'error', message: 'no success metrics' });
  }
  if (prd.stories.length === 0) {
    issues.push({ severity: 'error', message: 'no user stories' });
  }
  for (const story of prd.stories) {
    if (story.acceptance.length === 0) {
      issues.push({ severity: 'error', message: `story ${story.id} has no acceptance criteria` });
    }
    if (!story.asA.trim() || !story.iWant.trim() || !story.soThat.trim()) {
      issues.push({ severity: 'error', message: `story ${story.id} is missing who/why` });
    }
  }
  for (const m of prd.successMetrics) {
    if (!m.target.trim()) {
      issues.push({ severity: 'warning', message: `metric ${m.id} has no target` });
    }
  }
  const storyIds = new Set(prd.stories.map((s) => s.id));
  for (const m of prd.moscow) {
    if (!storyIds.has(m.storyId)) {
      issues.push({ severity: 'error', message: `MoSCoW references missing story ${m.storyId}` });
    }
  }
  return issues;
}

export function isPrdReady(prd: Prd): boolean {
  return validatePrd(prd).every((i) => i.severity !== 'error');
}

export function renderPrdMarkdown(prd: Prd): string {
  const lines: string[] = [];
  lines.push(`# ${prd.title}`);
  lines.push('');
  lines.push(`> Status: **${prd.status}** · Author: ${prd.author}`);
  lines.push('');
  lines.push('## Problem');
  lines.push(prd.problem);
  lines.push('');
  lines.push('## Goals');
  for (const g of prd.goals) lines.push(`- ${g}`);
  lines.push('');
  if (prd.nonGoals.length > 0) {
    lines.push('## Non-goals');
    for (const g of prd.nonGoals) lines.push(`- ${g}`);
    lines.push('');
  }
  lines.push('## Success metrics');
  for (const m of prd.successMetrics) {
    lines.push(`- **${m.name}** — target: ${m.target}`);
  }
  lines.push('');
  lines.push('## User stories');
  for (const s of prd.stories) {
    lines.push(`### ${s.id} — ${s.asA} → ${s.iWant} (${s.soThat})`);
    if (s.storyPoints) lines.push(`_Story points: ${s.storyPoints}_`);
    for (const a of s.acceptance) {
      lines.push(`- **${a.id}** Given ${a.given}, when ${a.when}, then ${a.then}`);
    }
    lines.push('');
  }
  if (prd.nfrs.length > 0) {
    lines.push('## Non-functional requirements');
    for (const n of prd.nfrs) {
      lines.push(`- **${n.attribute}** — ${n.target} (${n.measurement})`);
    }
    lines.push('');
  }
  if (prd.openQuestions.length > 0) {
    lines.push('## Open questions');
    for (const q of prd.openQuestions) lines.push(`- ${q}`);
    lines.push('');
  }
  if (prd.changelog.length > 0) {
    lines.push('## Changelog');
    for (const c of prd.changelog) lines.push(`- ${c.at} · ${c.author} · ${c.note}`);
  }
  return lines.join('\n');
}

/** Factory for a well-formed acceptance criterion. */
export function givenWhenThen(
  id: string,
  given: string,
  when: string,
  then: string,
): AcceptanceCriterion {
  return { id, given, when, then };
}

/** Convenience: a minimal "happy-path" story. */
export function makeStory(
  id: string,
  asA: string,
  iWant: string,
  soThat: string,
  acceptance: AcceptanceCriterion[],
  storyPoints?: 1 | 2 | 3 | 5 | 8 | 13 | 21,
): UserStory {
  return { id, asA, iWant, soThat, acceptance, ...(storyPoints !== undefined ? { storyPoints } : {}) };
}
