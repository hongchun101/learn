// =============================================================================
// Chapter 07 — Project Management & Cross-Functional Collaboration
// =============================================================================
// Goal: a PM is a multiplier, not a producer. The chapter turns the most
// common ceremonies, dependencies, and capacity models into computable
// primitives.
//
// References:
//   * Schwaber & Sutherland, "Scrum Guide".
//   * Marty Cagan, "Empowered", 2020.
//   * John Cutler, "The Product Mindset".
// =============================================================================

export type DependencyType = 'FS' | 'SS' | 'FF' | 'SF'; // finish-to-start, start-to-start, etc.
export type TaskStatus = 'todo' | 'in-progress' | 'blocked' | 'in-review' | 'done';

export interface Task {
  readonly id: string;
  readonly title: string;
  readonly owner: string;
  readonly estimateDays: number;
  readonly status: TaskStatus;
  readonly dependsOn: ReadonlyArray<string>;
  /** Start date (ISO string, day-precision). */
  readonly startAt: string;
  /** Optional team. */
  readonly team?: string;
}

export interface Milestone {
  readonly id: string;
  readonly name: string;
  readonly targetDate: string;
  readonly taskIds: ReadonlyArray<string>;
}

export interface Cycle {
  /** Number of weeks. */
  readonly weeks: number;
  /** Engineering capacity in person-weeks. */
  readonly capacity: number;
  /** Optional work-in-progress limit. */
  readonly wipLimit?: number;
}
