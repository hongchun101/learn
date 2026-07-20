// =============================================================================
// Chapter 03 — Kano Model, MoSCoW, Story Points
// =============================================================================
// Goal: classify features into Kano categories and bucket MoSCoW so the team
// can negotiate scope.
// =============================================================================

import type { UserStory, Moscow } from './models.js';

/** Kano category of a feature. */
export type KanoCategory =
  | 'must-be' // basic expectations; absence causes dissatisfaction
  | 'one-dimensional' // more is better
  | 'attractive' // delighters
  | 'indifferent' // user doesn't care
  | 'reverse'; // more causes dissatisfaction

/** Result of pairing a "with" / "without" survey pair. */
export interface KanoPair {
  /** How the user would feel if the feature existed. */
  readonly withAnswer: 'like' | 'expect' | 'neutral' | 'dislike';
  /** How the user would feel if it did not exist. */
  readonly withoutAnswer: 'like' | 'expect' | 'neutral' | 'dislike';
}

/** Canonical Kano matrix lookup. */
const KANO_MATRIX: Readonly<Record<string, KanoCategory>> = {
  'like|dislike': 'attractive',
  'like|expect': 'attractive',
  'like|neutral': 'attractive',
  'like|like': 'reverse',
  'expect|dislike': 'one-dimensional',
  'expect|expect': 'must-be',
  'expect|neutral': 'one-dimensional',
  'expect|like': 'reverse',
  'neutral|dislike': 'indifferent',
  'neutral|expect': 'indifferent',
  'neutral|neutral': 'indifferent',
  'neutral|like': 'reverse',
  'dislike|dislike': 'must-be',
  'dislike|expect': 'one-dimensional',
  'dislike|neutral': 'one-dimensional',
  'dislike|like': 'reverse',
};

export function kanoCategory(pair: KanoPair): KanoCategory {
  const key = `${pair.withAnswer}|${pair.withoutAnswer}`;
  return KANO_MATRIX[key] ?? 'indifferent';
}

/** Pick the must-haves and de-prioritize indifferents. */
export function rankedKano(
  pairs: ReadonlyArray<{ id: string; pair: KanoPair }>,
): ReadonlyArray<{ id: string; category: KanoCategory; rank: number }> {
  const order: Record<KanoCategory, number> = {
    'must-be': 1,
    'one-dimensional': 2,
    attractive: 3,
    indifferent: 4,
    reverse: 5,
  };
  return pairs
    .map((p) => ({ id: p.id, category: kanoCategory(p.pair), rank: order[kanoCategory(p.pair)] }))
    .sort((a, b) => a.rank - b.rank);
}

/** MoSCoW — given a budget of "must" + "should" + "could" stories, returns the largest fit. */
export function moscowBucket(
  stories: ReadonlyArray<UserStory>,
  storyMoscow: ReadonlyMap<string, Moscow>,
  budgetPoints: number,
): UserStory[] {
  const order: Record<Moscow, number> = { must: 0, should: 1, could: 2, wont: 3 };
  const ranked = [...stories]
    .map((s) => ({ s, m: storyMoscow.get(s.id) ?? 'wont' }))
    .sort((a, b) => order[a.m] - order[b.m]);
  let acc = 0;
  const out: UserStory[] = [];
  for (const { s, m } of ranked) {
    if (m === 'wont') continue;
    const points = s.storyPoints ?? 0;
    if (acc + points > budgetPoints) continue;
    out.push(s);
    acc += points;
  }
  return out;
}

/** Story-points → time estimate (1pt ≈ 1 ideal day). */
export function storyPointToDays(points: number, productivity = 0.5): number {
  if (productivity <= 0 || productivity > 1) {
    throw new Error('productivity must be in (0,1]');
  }
  return points / productivity;
}

/** Capacity check — given a team and a sprint length, can we ship? */
export function sprintCapacity(
  teamSize: number,
  daysPerSprint: number,
  focusFactor = 0.6,
): number {
  if (focusFactor <= 0 || focusFactor > 1) {
    throw new Error('focusFactor must be in (0,1]');
  }
  return teamSize * daysPerSprint * focusFactor;
}
