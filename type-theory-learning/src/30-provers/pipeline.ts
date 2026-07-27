// 一个微型的证明搜索流水线，模拟 Lean 4 中 tactic 的工作方式。
// 我们分阶段列出目标，并对它们依次运行若干 "tactic"。

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
