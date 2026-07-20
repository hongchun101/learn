// =============================================================================
// Chapter 02 — User Research
// =============================================================================
// Goal: turn user research from a soft skill into a set of precise, computable
// primitives — interview scripts, persona synthesis, affinity-diagram coding,
// survey design, qualitative-coding, and reachability math.
//
// References:
//   * Tomer Sharon, "It's Our Research", 2012.
//   * Indi Young, "Mental Models", 2008.
//   * Karen McGrane, "Going Responsive" — for recruitment.
//   * Erika Hall, "Just Enough Research", 2013.
// =============================================================================

/** A user being recruited for a study. */
export interface Recruit {
  readonly id: string;
  /** Free-text segment descriptor. */
  readonly segment: string;
  /** Self-reported experience with the problem, 1..5. */
  readonly experienceLevel: 1 | 2 | 3 | 4 | 5;
  /** Self-reported usage of the existing product, 1..5. */
  readonly usageLevel: 1 | 2 | 3 | 4 | 5;
  /** Time zone / locale, for scheduling. */
  readonly timezone: string;
}

/** A study design — what question we are trying to answer. */
export interface StudyDesign {
  readonly id: string;
  /** Hypothesis the study is testing. */
  readonly question: string;
  /** Whether the study is qualitative (interview) or quantitative (survey). */
  readonly kind: 'interview' | 'survey' | 'diary' | 'field-study' | 'usability';
  /** Number of participants planned. */
  readonly sampleSize: number;
  /** Inclusion criteria as predicates. */
  readonly inclusion: ReadonlyArray<keyof Recruit>;
  /** Exclusion criteria. */
  readonly exclusion: ReadonlyArray<keyof Recruit>;
}

/** A coded observation from an interview. */
export interface Observation {
  readonly id: string;
  readonly participantId: string;
  /** The free-text excerpt. */
  readonly quote: string;
  /** Verbatim emotional tag — neutral, frustrated, delighted, confused. */
  readonly sentiment: 'neutral' | 'frustrated' | 'delighted' | 'confused';
  /** Coded theme this observation belongs to. */
  readonly theme: string;
}

/** A quantitative survey response. */
export interface SurveyResponse {
  readonly id: string;
  readonly participantId: string;
  /** Each answer keyed by question id. */
  readonly answers: Readonly<Record<string, number | string | boolean>>;
  /** Optional completion time in seconds. */
  readonly secondsToComplete?: number;
}
