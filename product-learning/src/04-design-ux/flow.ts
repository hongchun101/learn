// =============================================================================
// Chapter 04 — User Flow Analysis
// =============================================================================

import type { UserFlow, FlowStep, FlowAction } from './models.js';

/** Reconstruct the full path a user takes in a happy-path flow. */
export function happyPath(flow: UserFlow): ReadonlyArray<string> {
  return [flow.entry, ...flow.happyPath];
}

/** Build a step graph: state → state' index. */
export function buildStepIndex(
  flow: UserFlow,
): ReadonlyMap<string, FlowStep> {
  const out = new Map<string, FlowStep>();
  for (const s of flow.steps) {
    out.set(`${s.state}→${describeAction(s.action)}`, s);
  }
  return out;
}

function describeAction(a: FlowAction): string {
  switch (a.kind) {
    case 'click':
      return `click(${a.target})`;
    case 'navigate':
      return `nav(${a.url})`;
    case 'submit':
      return `submit(${a.form})`;
    case 'back':
      return 'back';
    case 'error':
      return `error(${a.message})`;
  }
}

/** Walk a flow from `entry`, returning the visited states. */
export function walkFlow(flow: UserFlow, start?: string): ReadonlyArray<string> {
  const entry = start ?? flow.entry;
  const visited: string[] = [entry];
  let current = entry;
  const stepMap = new Map<string, FlowStep>();
  for (const s of flow.steps) stepMap.set(s.state, s);
  const seen = new Set<string>([entry]);
  while (true) {
    const s = stepMap.get(current);
    if (!s) break;
    if (seen.has(s.next)) break;
    visited.push(s.next);
    seen.add(s.next);
    current = s.next;
  }
  return visited;
}

/** Find dead ends — terminal states that have no outgoing step. */
export function deadEnds(flow: UserFlow): string[] {
  const froms = new Set(flow.steps.map((s) => s.state));
  const tos = new Set(flow.steps.map((s) => s.next));
  const all = new Set([...froms, ...tos, flow.entry]);
  return [...all].filter((n) => !froms.has(n));
}

/** Detect a step whose action is an error and never recovers. */
export function unrecoveredErrors(flow: UserFlow): ReadonlyArray<FlowStep> {
  return flow.steps.filter(
    (s) => s.action.kind === 'error' && s.next === s.state,
  );
}

/** Sum of state transitions in a flow — a "step count" UX metric. */
export function stepCount(flow: UserFlow): number {
  return flow.steps.length;
}
