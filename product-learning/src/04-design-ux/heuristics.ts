// =============================================================================
// Chapter 04 — Heuristic Evaluation
// =============================================================================
// Goal: a heuristic audit produces a list of findings; we need to score
// and group them. This file encodes the 10 Nielsen heuristics as a
// constant lookup, and provides group-by helpers for triage.
// =============================================================================

import type { HeuristicFinding, NielsenHeuristic } from './models.js';
import { auditScore, severityScore } from './models.js';

export const NIELSEN_HEURISTICS: Readonly<Record<NielsenHeuristic, string>> = {
  visibility: 'Visibility of system status',
  'match-real-world': 'Match between system and the real world',
  'user-control': 'User control and freedom',
  consistency: 'Consistency and standards',
  'error-prevention': 'Error prevention',
  'recognition-not-recall': 'Recognition rather than recall',
  flexibility: 'Flexibility and efficiency of use',
  minimalist: 'Aesthetic and minimalist design',
  'error-recovery': 'Help users recognize, diagnose, and recover from errors',
  'help-docs': 'Help and documentation',
};

/** Group findings by heuristic. */
export function groupByHeuristic(
  findings: ReadonlyArray<HeuristicFinding>,
): ReadonlyMap<NielsenHeuristic, ReadonlyArray<HeuristicFinding>> {
  const out = new Map<NielsenHeuristic, HeuristicFinding[]>();
  for (const f of findings) {
    const bucket = out.get(f.heuristic) ?? [];
    bucket.push(f);
    out.set(f.heuristic, bucket);
  }
  return out;
}

/** Worst-N heuristics by total severity score. */
export function worstHeuristics(
  findings: ReadonlyArray<HeuristicFinding>,
  n: number,
): ReadonlyArray<{ heuristic: NielsenHeuristic; score: number; title: string }> {
  const grouped = groupByHeuristic(findings);
  return [...grouped.entries()]
    .map(([heuristic, list]) => ({ heuristic, score: auditScore(list), title: NIELSEN_HEURISTICS[heuristic] }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

export { auditScore, severityScore };
