// =============================================================================
// Chapter 07 — Agile, Velocity & Health
// =============================================================================

export interface Sprint {
  readonly id: string;
  readonly committedPoints: number;
  readonly completedPoints: number;
  /** Number of team members, used to compute velocity per person. */
  readonly teamSize: number;
  /** Number of carry-over stories from previous sprint. */
  readonly carryOver: number;
}

export interface TeamHealth {
  /** Sprint-by-sprint history. */
  readonly sprints: ReadonlyArray<Sprint>;
}

export function velocity(s: Sprint): number {
  return s.completedPoints;
}

export function velocityTrend(sprints: ReadonlyArray<Sprint>): ReadonlyArray<number> {
  return sprints.map(velocity);
}

/** Average velocity over the last N sprints. */
export function averageVelocity(sprints: ReadonlyArray<Sprint>, lastN = 3): number {
  if (sprints.length === 0) return 0;
  const window = sprints.slice(-lastN);
  return window.reduce((a, b) => a + b.completedPoints, 0) / window.length;
}

/** Standard deviation of velocity. */
export function velocityStd(sprints: ReadonlyArray<Sprint>): number {
  if (sprints.length < 2) return 0;
  const xs = sprints.map(velocity);
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1));
}

/** Predict completion of a backlog of points using current avg velocity. */
export function sprintsToComplete(remainingPoints: number, sprints: ReadonlyArray<Sprint>, lastN = 3): number {
  const v = averageVelocity(sprints, lastN);
  if (v <= 0) return Number.POSITIVE_INFINITY;
  return Math.ceil(remainingPoints / v);
}

/** Carry-over rate — share of stories that didn't finish last sprint. */
export function carryOverRate(sprints: ReadonlyArray<Sprint>): number {
  if (sprints.length === 0) return 0;
  const carry = sprints.reduce((a, b) => a + b.carryOver, 0);
  const totalCommitted = sprints.reduce((a, b) => a + b.committedPoints, 0);
  return totalCommitted === 0 ? 0 : carry / totalCommitted;
}

/** Predictability — completed / committed, averaged. */
export function predictability(sprints: ReadonlyArray<Sprint>): number {
  if (sprints.length === 0) return 0;
  const sum = sprints.reduce((a, b) => a + (b.committedPoints === 0 ? 0 : b.completedPoints / b.committedPoints), 0);
  return sum / sprints.length;
}
