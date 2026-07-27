// 在值层面的线性使用分析器。
//
//   linear  : 恰好 1 次使用
//   affine  : 0 或 1 次使用
//   relevant: 任意 ≥ 1 次使用
//
// 我们用 Map<name, count> 记录使用计数。

export type Mode = 'linear' | 'affine' | 'relevant';

export interface UseState {
  readonly uses: Map<string, number>;
}

export const emptyUses: UseState = { uses: new Map() };

export function use(st: UseState, name: string, mode: Mode): UseState {
  const next = new Map(st.uses);
  const cur = next.get(name) ?? 0;
  next.set(name, cur + 1);
  if (mode === 'linear' && cur + 1 > 1) throw new Error(`linear ${name} used twice`);
  if (mode === 'affine' && cur + 1 > 1) throw new Error(`affine ${name} used twice`);
  return { uses: next };
}

/** `unusedOk` —— 该变量在当前计数下是否允许未被使用？
 *  - linear：    必须恰好使用 1 次 → 未使用 OK 当且仅当 count === 1？否。
 *                 "0 是否仍可接受？" 对 linear 而言是否定的。重新解读为：当
 *                 *使用次数满足* 该 mode 时返回 true（这样我们就可以在
 *                 末尾直接放下进一步的检查）。
 */
export function unusedOk(mode: Mode, count: number): boolean {
  if (mode === 'linear') return count >= 1;
  if (mode === 'affine') return count <= 1;
  return count >= 1;
}
