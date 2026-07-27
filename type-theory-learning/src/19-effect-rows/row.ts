// 效应行：开放（可扩展）与封闭（穷举）。

export type Eff = 'pure' | 'io' | 'state' | 'exn' | 'nondet';

export type EffectRow =
  | { kind: 'open'; var: string; tail: EffectRow }
  | { kind: 'closed'; effs: ReadonlyArray<Eff> };

export const empty: EffectRow = { kind: 'closed', effs: [] };

export const insert = (e: Eff, r: EffectRow): EffectRow => {
  if (r.kind === 'closed') return { kind: 'closed', effs: dedupe([...r.effs, e]) };
  return { kind: 'open', var: r.var, tail: insert(e, r.tail) };
};

export const has = (e: Eff, r: EffectRow): boolean => {
  if (r.kind === 'closed') return r.effs.includes(e);
  return has(e, r.tail);
};

export function dedupe<T>(xs: ReadonlyArray<T>): T[] {
  const out: T[] = [];
  for (const x of xs) if (!out.includes(x)) out.push(x);
  return out;
}

export const unify = (a: EffectRow, b: EffectRow): EffectRow => {
  if (a.kind === 'closed' && b.kind === 'closed') return { kind: 'closed', effs: dedupe([...a.effs, ...b.effs]) };
  if (a.kind === 'closed') return { kind: 'open', var: 'rho', tail: a };
  if (b.kind === 'closed') return { kind: 'open', var: 'rho', tail: b };
  if (a.var === b.var) return a;
  return { kind: 'open', var: 'rho', tail: { kind: 'closed', effs: [] } };
};
