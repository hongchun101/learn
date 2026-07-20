// =============================================================================
// Chapter 07 — Scheduling, Critical Path, Capacity
// =============================================================================

import type { Task, Milestone, Cycle } from './models.js';

/** Parse a YYYY-MM-DD into a UTC day timestamp. */
export function parseDay(s: string): number {
  return Date.parse(s.slice(0, 10) + 'T00:00:00Z');
}

/** Critical path method — earliest start for each task. */
export function criticalPath(
  tasks: ReadonlyArray<Task>,
): ReadonlyMap<string, { earliestStart: number; earliestFinish: number }> {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const earliest = new Map<string, { earliestStart: number; earliestFinish: number }>();
  // Topological order: a task is processed when all its deps are processed.
  const remaining = new Set(tasks.map((t) => t.id));
  while (remaining.size > 0) {
    let progressed = false;
    for (const id of remaining) {
      const t = byId.get(id)!;
      const deps = t.dependsOn.map((d) => byId.get(d)!).filter((d) => remaining.has(d.id));
      if (deps.length > 0) continue;
      const depFinish = t.dependsOn.length === 0
        ? parseDay(t.startAt)
        : Math.max(...t.dependsOn.map((d) => earliest.get(d)!.earliestFinish));
      earliest.set(id, {
        earliestStart: depFinish,
        earliestFinish: depFinish + t.estimateDays * 24 * 60 * 60 * 1000,
      });
      remaining.delete(id);
      progressed = true;
    }
    if (!progressed) {
      throw new Error('cycle detected in task graph');
    }
  }
  return earliest;
}

/** Critical-path tasks — those with zero slack. */
export function onCriticalPath(
  tasks: ReadonlyArray<Task>,
): ReadonlyArray<string> {
  const earliest = criticalPath(tasks);
  let maxFinish = 0;
  for (const v of earliest.values()) maxFinish = Math.max(maxFinish, v.earliestFinish);
  const out: string[] = [];
  for (const [id, v] of earliest) {
    if (v.earliestFinish === maxFinish) out.push(id);
  }
  return out;
}

/** Slack — for a given target finish, how much room does each task have? */
export function slack(
  tasks: ReadonlyArray<Task>,
  targetFinish: number,
): ReadonlyMap<string, number> {
  const earliest = criticalPath(tasks);
  const out = new Map<string, number>();
  for (const [id, v] of earliest) {
    out.set(id, targetFinish - v.earliestFinish);
  }
  return out;
}

/** Cycle capacity — how many story points fit? */
export function cycleFits(cycle: Cycle, storyPointsTotal: number, pointsPerWeek: number): { fits: boolean; weeksUsed: number } {
  const weeksUsed = pointsPerWeek === 0 ? Infinity : storyPointsTotal / pointsPerWeek;
  return { fits: weeksUsed <= cycle.weeks && storyPointsTotal <= cycle.capacity, weeksUsed };
}

/** Milestone slack — how late can each task slip? */
export function milestoneSlack(
  tasks: ReadonlyArray<Task>,
  milestone: Milestone,
): ReadonlyMap<string, number> {
  const target = parseDay(milestone.targetDate);
  const full = slack(tasks, target);
  const out = new Map<string, number>();
  for (const id of milestone.taskIds) {
    out.set(id, full.get(id) ?? 0);
  }
  return out;
}

/** Burnup — committed vs done over time. */
export function burnup(
  committed: number,
  daily: ReadonlyArray<{ day: number; done: number }>,
): ReadonlyArray<{ day: number; totalDone: number; remaining: number }> {
  const out: { day: number; totalDone: number; remaining: number }[] = [];
  let acc = 0;
  for (const d of daily) {
    acc += d.done;
    out.push({ day: d.day, totalDone: acc, remaining: Math.max(0, committed - acc) });
  }
  return out;
}
