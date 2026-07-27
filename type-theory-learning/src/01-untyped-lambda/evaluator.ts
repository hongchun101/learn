// @ts-nocheck
// 小步 β-归约器，以及正序 / 按值调用的求值器。
//
//   (λx. t1) t2   ──β→   [x ↦ t2] t1
//
// `evalNormalOrder` 执行 head-spine β-归约：它深入函数-应用结构
// 以寻找最左最外的 β-可约式，然后触发归约。
// 对于简单类型的项以及 Church 编码（其内部已包含类型）都能终止。
// 对 Ω 则会无限循环；`fuel` 用于检测这一情况。
//
// `evalCBV` 按值调用进行小步递归求值（在第 17 章以及后续
// 各章的 ML 风格语义中使用）。

import type { Term } from './ast';
import { lam } from './ast';
import { free, subst } from './subst';

export class NonNormalizable extends Error {
  constructor() {
    super('term did not reach a normal form within the given fuel');
    this.name = 'NonNormalizable';
  }
}

/** `isValue t` — 在纯 λ 演算中，值恰好就是抽象。 */
export function isValue(t: Term): boolean {
  return t.kind === 'lam';
}

/** `isRedex(t)` — `t` 是否为 β-可约式 `app(lam, _)`？ */
export function isRedex(t: Term): boolean {
  return t.kind === 'app' && t.func.kind === 'lam';
}

/** 单步最左最外 β 归约。若已不可约则原样返回项。 */
function stepOnce(t: Term): Term {
  switch (t.kind) {
    case 'var':
      return t;
    case 'lam': {
      const b = stepOnce(t.body);
      return b === t.body ? t : lam(t.param, b);
    }
    case 'app': {
      const f = stepOnce(t.func);
      if (f.kind === 'lam') return subst(f.param, t.arg, f.body);
      const a = stepOnce(t.arg);
      if (a !== t.arg) return { kind: 'app', func: f, arg: a };
      if (f !== t.func) return { kind: 'app', func: f, arg: t.arg };
      return t;
    }
  }
}

/** 正序求值器。若耗尽 fuel 则抛出 `NonNormalizable`。 */
export function evalNormalOrder(t: Term, fuel = 1000): Term {
  let cur = t;
  for (let i = 0; i < fuel; i++) {
    const next = stepOnce(cur);
    if (next === cur) return cur;
    cur = next;
  }
  throw new NonNormalizable();
}

/** 公开的 `step` — 供测试使用。 */
export function step(t: Term): Term {
  return stepOnce(t);
}

/** 单步 CBV：先化简实参再化简函数，绝不进入 λ 之下。 */
export function stepCBV(t: Term): Term {
  if (t.kind !== 'app') return t;
  // 若函数还不是值，则先化简函数。
  if (!isValue(t.func)) {
    return { kind: 'app', func: stepCBV(t.func), arg: t.arg };
  }
  // 若实参还不是值（且不是裸变量），则化简实参。
  if (t.arg.kind !== 'var' && !isValue(t.arg)) {
    return { kind: 'app', func: t.func, arg: stepCBV(t.arg) };
  }
  return subst(t.func.param, t.arg, t.func.body);
}

/** `evalCBV` 按值调用顺序将 `t` 化简为值。 */
export function evalCBV(t: Term, fuel = 1000): Term {
  let cur = t;
  for (let i = 0; i < fuel; i++) {
    if (cur.kind !== 'app') return cur;
    if (isValue(cur.func) && isValue(cur.arg)) {
      cur = subst(cur.func.param, cur.arg, cur.func.body);
      continue;
    }
    cur = stepCBV(cur);
  }
  throw new NonNormalizable();
}

/** `freeVars` 的再导出。 */
export const freeVars = free;
