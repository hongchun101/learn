// =============================================================================
// Chapter 08 — Strategy: Vision, Mission, Goals, OKRs
// =============================================================================

export interface Objective {
  readonly id: string;
  readonly title: string;
  /** Narrative. */
  readonly description: string;
}

export interface KeyResult {
  readonly id: string;
  readonly objectiveId: string;
  readonly text: string;
  /** Baseline. */
  readonly baseline: number;
  /** Target. */
  readonly target: number;
  /** Most recent actual. */
  readonly actual: number;
  /** Higher is better? */
  readonly higherIsBetter: boolean;
}

export function krProgress(kr: KeyResult): number {
  if (kr.target === kr.baseline) return kr.actual >= kr.target ? 1 : 0;
  const direction = kr.higherIsBetter ? 1 : -1;
  const span = (kr.target - kr.baseline) * direction;
  if (span === 0) return 1;
  const reached = (kr.actual - kr.baseline) * direction;
  return Math.max(0, Math.min(1, reached / span));
}

export function okrScore(objective: Objective, krs: ReadonlyArray<KeyResult>): number {
  const own = krs.filter((k) => k.objectiveId === objective.id);
  if (own.length === 0) return 0;
  return own.reduce((a, b) => a + krProgress(b), 0) / own.length;
}

/** A "Good Strategy" check — strategy is a diagnosis → guiding policy → coherent action. */
export interface StrategyCheck {
  readonly diagnosis: string;
  readonly guidingPolicy: string;
  readonly coherentActions: ReadonlyArray<string>;
}

export function isGoodStrategy(s: StrategyCheck): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!s.diagnosis.trim()) missing.push('diagnosis');
  if (!s.guidingPolicy.trim()) missing.push('guiding policy');
  if (s.coherentActions.length === 0) missing.push('coherent actions');
  return { ok: missing.length === 0, missing };
}

/** Crossing the Chasm — current vs. required adoption. */
export function chasmPosition(
  current: 'innovators' | 'early-adopters' | 'early-majority' | 'late-majority' | 'laggards',
): 'pre-chasm' | 'in-chasm' | 'post-chasm' {
  if (current === 'innovators' || current === 'early-adopters') return 'pre-chasm';
  if (current === 'early-majority') return 'in-chasm';
  return 'post-chasm';
}

/** Wardley map evolution — stage of a component over time. */
export type WardleyStage = 'genesis' | 'custom' | 'product' | 'commodity';

export function wardleyEvolve(stage: WardleyStage): WardleyStage {
  switch (stage) {
    case 'genesis': return 'custom';
    case 'custom': return 'product';
    case 'product': return 'commodity';
    case 'commodity': return 'commodity';
  }
}

/** Choose build-vs-buy based on Wardley stage. */
export function buildVsBuy(stage: WardleyStage): 'build' | 'differentiate' | 'buy' {
  if (stage === 'genesis') return 'build';
  if (stage === 'custom') return 'differentiate';
  if (stage === 'product') return 'differentiate';
  return 'buy';
}
