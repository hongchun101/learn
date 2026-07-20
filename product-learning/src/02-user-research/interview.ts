// =============================================================================
// Chapter 02 — Interview Script, Coding & Affinity Diagrams
// =============================================================================
// Goal: a good interview follows a script, codes observations into themes,
// and the themes build an affinity diagram. This file encodes each step as
// a pure function so the same observation can be re-coded and re-grouped.
// =============================================================================

import type { Observation, Recruit } from './models.js';

export type InterviewPhase = 'rapport' | 'context' | 'present-state' | 'past-behavior' | 'wrap';

/** A single scripted question in an interview guide. */
export interface ScriptedQuestion {
  readonly id: string;
  readonly phase: InterviewPhase;
  readonly prompt: string;
  /** Probe questions to ask if the answer is short. */
  readonly probes: ReadonlyArray<string>;
}

/** Build a default "context → present state → past behavior → wrap" interview. */
export function defaultInterviewGuide(topic: string): ScriptedQuestion[] {
  return [
    { id: 'Q1', phase: 'rapport', prompt: `Tell me a bit about your role and what you focus on day-to-day.`, probes: ['What does your team look like?'] },
    { id: 'Q2', phase: 'context', prompt: `Walk me through the last time you had to deal with ${topic}.`, probes: ['What was the trigger?', 'Who else was involved?'] },
    { id: 'Q3', phase: 'present-state', prompt: `What tools or workarounds are you using today?`, probes: ['How often?', 'What works? What does not?'] },
    { id: 'Q4', phase: 'past-behavior', prompt: `Tell me about a time you wished the workflow was different.`, probes: ['What did you try instead?'] },
    { id: 'Q5', phase: 'wrap', prompt: `If you could wave a magic wand and have one thing change tomorrow, what would it be?`, probes: [] },
  ];
}

/** Sentiment scoring — counts how each sentiment is represented in the data. */
export function sentimentBreakdown(
  observations: ReadonlyArray<Observation>,
): Record<Observation['sentiment'], number> {
  const out: Record<Observation['sentiment'], number> = {
    neutral: 0,
    frustrated: 0,
    delighted: 0,
    confused: 0,
  };
  for (const o of observations) out[o.sentiment] += 1;
  return out;
}

/** Theme frequency — used for an affinity diagram. */
export function themeFrequencies(
  observations: ReadonlyArray<Observation>,
): ReadonlyMap<string, number> {
  const out = new Map<string, number>();
  for (const o of observations) {
    out.set(o.theme, (out.get(o.theme) ?? 0) + 1);
  }
  return out;
}

/** Inter-rater agreement — Cohen's kappa on two coders' theme assignments. */
export function cohensKappa(
  coderA: ReadonlyArray<string>,
  coderB: ReadonlyArray<string>,
): number {
  if (coderA.length === 0 || coderA.length !== coderB.length) {
    throw new Error('coder arrays must be equal and non-empty');
  }
  const n = coderA.length;
  const labels = new Set<string>([...coderA, ...coderB]);
  let agree = 0;
  for (let i = 0; i < n; i++) if (coderA[i] === coderB[i]) agree += 1;
  const pObserved = agree / n;
  let pExpected = 0;
  for (const l of labels) {
    const pA = coderA.filter((x) => x === l).length / n;
    const pB = coderB.filter((x) => x === l).length / n;
    pExpected += pA * pB;
  }
  if (pExpected === 1) return 1;
  return (pObserved - pExpected) / (1 - pExpected);
}

/** A persona, synthesised from observations + recruits. */
export interface Persona {
  readonly id: string;
  readonly name: string;
  /** Short narrative. */
  readonly narrative: string;
  /** Top 3 themes that came up most. */
  readonly topThemes: ReadonlyArray<{ theme: string; count: number }>;
  /** Average experience × usage across the cluster. */
  readonly experience: number;
  readonly usage: number;
}

/**
 * Roll up participants into personas. The simplest clustering: split by
 * experience × usage quadrant — high/high, high/low, low/high, low/low.
 * Within each quadrant, the persona's top themes are the most-cited.
 */
export function synthesizePersonas(
  recruits: ReadonlyArray<Recruit>,
  observations: ReadonlyArray<Observation>,
  perCluster = 3,
): Persona[] {
  const byCluster = new Map<string, { recruits: Recruit[]; observations: Observation[] }>();
  for (const r of recruits) {
    const key = `${r.experienceLevel >= 3 ? 'H' : 'L'}${r.usageLevel >= 3 ? 'H' : 'L'}`;
    const bucket = byCluster.get(key) ?? { recruits: [], observations: [] };
    bucket.recruits.push(r);
    byCluster.set(key, bucket);
  }
  const idsByCluster = new Map<string, Set<string>>();
  for (const [k, v] of byCluster) {
    idsByCluster.set(k, new Set(v.recruits.map((r) => r.id)));
  }
  for (const o of observations) {
    for (const [k, ids] of idsByCluster) {
      if (ids.has(o.participantId)) {
        const bucket = byCluster.get(k);
        if (bucket) bucket.observations.push(o);
        break;
      }
    }
  }
  const out: Persona[] = [];
  let i = 0;
  for (const [key, bucket] of byCluster) {
    const freqs = themeFrequencies(bucket.observations);
    const top = [...freqs.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, perCluster)
      .map(([theme, count]) => ({ theme, count }));
    const exp =
      bucket.recruits.reduce((a, r) => a + r.experienceLevel, 0) / (bucket.recruits.length || 1);
    const use =
      bucket.recruits.reduce((a, r) => a + r.usageLevel, 0) / (bucket.recruits.length || 1);
    out.push({
      id: `P${++i}`,
      name: `Persona ${key}`,
      narrative: `${bucket.recruits.length} participants in quadrant ${key}`,
      topThemes: top,
      experience: exp,
      usage: use,
    });
  }
  return out;
}
