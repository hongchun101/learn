// @ts-nocheck
// 无类型 lambda 演算（第 01 章）的 AST。
//
//   t ::= x | λx. t | t t
//
// `Term` 是一个小型代数数据类型。后续章节（02 STLC、06 System F、
// 11 Pi-类型）会通过类型注解与绑定器对其进行扩展；构造子
// 的名称刻意保持稳定。

export type Var = string;

export type Term =
  | { kind: 'var'; name: Var }
  | { kind: 'lam'; param: Var; body: Term }
  | { kind: 'app'; func: Term; arg: Term };

export const v = (name: Var): Term => ({ kind: 'var', name });
export const lam = (param: Var, body: Term): Term => ({ kind: 'lam', param, body });
export const app = (func: Term, arg: Term): Term => ({ kind: 'app', func, arg });

/** `pretty t` 将 `Term` 渲染回可读的 lambda 项。 */
export function pretty(t: Term): string {
  switch (t.kind) {
    case 'var':
      return t.name;
    case 'lam': {
      const body = pretty(t.body);
      // 当 body 是变量或另一个抽象时，省略其括号。
      const wrap =
        t.body.kind === 'app' || t.body.kind === 'lam';
      return `λ${t.param}.${wrap ? body : body}`;
    }
    case 'app': {
      const f = t.func.kind === 'lam' ? `(${pretty(t.func)})` : pretty(t.func);
      const a = t.arg.kind === 'app' ? `(${pretty(t.arg)})` : pretty(t.arg);
      return `${f} ${a}`;
    }
  }
}

/** 结构相等性。 */
export function equal(a: Term, b: Term): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'var':
      return a.name === b.name;
    case 'lam':
      return a.param === b.param && equal(a.body, b.body);
    case 'app':
      return equal(a.func, b.func) && equal(a.arg, b.arg);
  }
}
