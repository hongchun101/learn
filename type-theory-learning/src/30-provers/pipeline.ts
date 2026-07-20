// A tiny proof-search pipeline mimicking what a tactic in Lean 4 would do.
// We stage goals and run a couple of "tactics" against them.

export interface Goal {
  id: number;
  judgment: string;
}

export interface Proof {
  goals: Goal[];
  steps: string[];
}

export const proof = (judgment: string): Proof => ({ goals: [{ id: 1, judgment }], steps: [] });

export const intro = (p: Proof): Proof => ({ goals: p.goals, steps: [...p.steps, 'intro'] });
export const apply = (p: Proof, rule: string): Proof => ({ goals: p.goals, steps: [...p.steps, `apply ${rule}`] });
export const exact = (p: Proof, term: string): Proof => ({ goals: p.goals, steps: [...p.steps, `exact ${term}`] });
