// =============================================================================
// Chapter 03 — Requirements & PRD
// =============================================================================
// Goal: turn fuzzy stakeholder asks into a structured PRD. The chapter covers
// Kano categories, MoSCoW prioritization, user stories, acceptance criteria
// in Given/When/Then form, NFRs, and a PRD validator.
//
// References:
//   * Kano, "Attractive Quality and Must-be Quality", 1984.
//   * Atlassian, "MoSCoW prioritization".
//   * Jeff Patton, "User Story Mapping", 2014.
// =============================================================================

/** Type of requirement. */
export type RequirementKind =
  | 'functional'
  | 'non-functional'
  | 'constraint'
  | 'interface'
  | 'data'
  | 'security';

/** A single user story. */
export interface UserStory {
  readonly id: string;
  /** "As a [user], I want to [action], so that [outcome]." */
  readonly asA: string;
  readonly iWant: string;
  readonly soThat: string;
  /** Acceptance criteria in Given/When/Then form. */
  readonly acceptance: ReadonlyArray<AcceptanceCriterion>;
  /** Optional story points (Fibonacci 1,2,3,5,8,13,21). */
  readonly storyPoints?: 1 | 2 | 3 | 5 | 8 | 13 | 21;
}

export interface AcceptanceCriterion {
  readonly id: string;
  readonly given: string;
  readonly when: string;
  readonly then: string;
}

/** A non-functional requirement. */
export interface Nfr {
  readonly id: string;
  readonly attribute: 'performance' | 'security' | 'availability' | 'usability' | 'i18n' | 'compliance' | 'scalability';
  /** Measurable target, e.g. "p95 < 200ms". */
  readonly target: string;
  /** How the target is measured. */
  readonly measurement: string;
}

/** MoSCoW priority. */
export type Moscow = 'must' | 'should' | 'could' | 'wont';

/** A complete PRD section. */
export interface PrdSection {
  readonly id: string;
  readonly title: string;
  readonly body: string;
}

export interface Prd {
  readonly id: string;
  readonly title: string;
  readonly author: string;
  readonly status: 'draft' | 'review' | 'approved' | 'shipped' | 'archived';
  readonly problem: string;
  readonly goals: ReadonlyArray<string>;
  readonly nonGoals: ReadonlyArray<string>;
  readonly successMetrics: ReadonlyArray<{ id: string; name: string; target: string }>;
  readonly stories: ReadonlyArray<UserStory>;
  readonly nfrs: ReadonlyArray<Nfr>;
  readonly moscow: ReadonlyArray<{ storyId: string; bucket: Moscow }>;
  readonly openQuestions: ReadonlyArray<string>;
  readonly changelog: ReadonlyArray<{ at: string; author: string; note: string }>;
}
