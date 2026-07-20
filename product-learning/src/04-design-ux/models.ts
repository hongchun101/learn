// =============================================================================
// Chapter 04 — Product Design & UX
// =============================================================================
// Goal: design is a system of small, defensible primitives. This chapter
// turns information architecture, user flows, Nielsen's heuristics, and
// WCAG accessibility into computable primitives.
//
// References:
//   * Nielsen, "10 Usability Heuristics for User Interface Design", 1994.
//   * W3C, "Web Content Accessibility Guidelines (WCAG) 2.2", 2023.
//   * Rosenfeld & Morville, "Information Architecture for the Web", 3rd ed.
//   * Don Norman, "The Design of Everyday Things", revised ed.
// =============================================================================

/** A node in an information-architecture tree. */
export interface IaNode {
  readonly id: string;
  readonly label: string;
  readonly children: ReadonlyArray<IaNode>;
  /** Optional metadata: the IA scheme the node is grouped under. */
  readonly facet?: string;
}

/** A user flow — a sequence of (state, action → state') transitions. */
export type FlowAction =
  | { kind: 'click'; target: string }
  | { kind: 'navigate'; url: string }
  | { kind: 'submit'; form: string }
  | { kind: 'back' }
  | { kind: 'error'; message: string };

export interface FlowStep {
  readonly state: string;
  readonly action: FlowAction;
  readonly next: string;
}

export interface UserFlow {
  readonly id: string;
  readonly name: string;
  readonly entry: string;
  readonly steps: ReadonlyArray<FlowStep>;
  readonly happyPath: ReadonlyArray<string>;
}

/** Nielsen's 10 usability heuristics. */
export type NielsenHeuristic =
  | 'visibility'
  | 'match-real-world'
  | 'user-control'
  | 'consistency'
  | 'error-prevention'
  | 'recognition-not-recall'
  | 'flexibility'
  | 'minimalist'
  | 'error-recovery'
  | 'help-docs';

/** A single heuristic violation, used for design audits. */
export interface HeuristicFinding {
  readonly heuristic: NielsenHeuristic;
  readonly severity: 'minor' | 'major' | 'critical';
  readonly screen: string;
  readonly description: string;
}

/** Severity score — used to triage an audit. */
export function severityScore(severity: HeuristicFinding['severity']): number {
  if (severity === 'critical') return 3;
  if (severity === 'major') return 2;
  return 1;
}

/** Total severity score of a heuristic audit. */
export function auditScore(findings: ReadonlyArray<HeuristicFinding>): number {
  return findings.reduce((acc, f) => acc + severityScore(f.severity), 0);
}
