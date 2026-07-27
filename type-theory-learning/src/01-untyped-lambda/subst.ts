// lambda 演算的避免捕获替换与自由变量工具。
//
//   [x ↦ s] t       （替换）
//   FV(t)           （自由变量）
//
// 在替换时重命名绑定器，以隐式保持 α-等价性并避免
// 阴影（shadowing）错误。

import type { Term, Var } from './ast';
import { lam, v } from './ast';

/** 将变量 `name` 在 `t` 中全部重命名为 `fresh`。 */
function rename(name: Var, fresh: Var, t: Term): Term {
  switch (t.kind) {
    case 'var':
      return t.name === name ? v(fresh) : t;
    case 'lam':
      return lam(t.param === name ? fresh : t.param, rename(name, fresh, t.body));
    case 'app':
      return {
        kind: 'app',
        func: rename(name, fresh, t.func),
        arg: rename(name, fresh, t.arg),
      };
  }
}

/** `free(t)` 返回 `t` 中自由变量的集合。 */
export function free(t: Term): Set<Var> {
  switch (t.kind) {
    case 'var':
      return new Set([t.name]);
    case 'lam': {
      const s = free(t.body);
      s.delete(t.param);
      return s;
    }
    case 'app': {
      const a = free(t.func);
      for (const x of free(t.arg)) a.add(x);
      return a;
    }
  }
}

/** 通过追加数字后缀，生成一个不在 `avoid` 集合中的名字。 */
export function freshName(base: Var, avoid: ReadonlySet<Var>): Var {
  let n = 0;
  let candidate = base;
  while (avoid.has(candidate)) {
    candidate = `${base}${n++}`;
  }
  return candidate;
}

/**
 * `subst(x, s, t)` 是避免捕获的替换 `[x ↦ s] t`。
 *
 * 必要时对绑定器进行重命名：若 `t` 中的某个绑定器与 `s` 的某个
 * 自由变量同名，则为 `t` 的函数体重新生成一个不冲突的绑定器。
 */
export function subst(x: Var, s: Term, t: Term): Term {
  switch (t.kind) {
    case 'var':
      return t.name === x ? s : t;
    case 'lam': {
      if (t.param === x) {
        return t;
      }
      const fvS = free(s);
      if (fvS.has(t.param)) {
        const fresh = freshName(t.param, new Set([...free(t.body), ...fvS]));
        const renamed = rename(t.param, fresh, t.body);
        return lam(fresh, subst(x, s, renamed));
      }
      return lam(t.param, subst(x, s, t.body));
    }
    case 'app':
      return {
        kind: 'app',
        func: subst(x, s, t.func),
        arg: subst(x, s, t.arg),
      };
  }
}

/**
 * `alphaEq(a, b)` ≡ a ≡_α b。比较两个项在绑定器重命名下的相等性。
 * 在每一对绑定器处，都挑选一个尚未使用的新名字，并将两边
 * 变量都绑定到该名字；随后通过映射递归比较子项。
 */
export function alphaEq(a: Term, b: Term): boolean {
  const leftToFresh = new Map<Var, Var>();
  const rightToFresh = new Map<Var, Var>();
  return go(a, b);

  function go(ta: Term, tb: Term): boolean {
    if (ta.kind === 'var' && tb.kind === 'var') {
      return (leftToFresh.get(ta.name) ?? ta.name) === (rightToFresh.get(tb.name) ?? tb.name);
    }
    if (ta.kind === 'lam' && tb.kind === 'lam') {
      const used = new Set<Var>([
        ...Array.from(leftToFresh.values()),
        ...Array.from(rightToFresh.values()),
      ]);
      const fresh = freshName(ta.param, used);
      leftToFresh.set(ta.param, fresh);
      rightToFresh.set(tb.param, fresh);
      const r = go(ta.body, tb.body);
      leftToFresh.delete(ta.param);
      rightToFresh.delete(tb.param);
      return r;
    }
    if (ta.kind === 'app' && tb.kind === 'app') {
      return go(ta.func, tb.func) && go(ta.arg, tb.arg);
    }
    return false;
  }
}
