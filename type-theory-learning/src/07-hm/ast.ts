// 一个微型的 HM 语言。

export type Var = string;

export type Term =
  | { kind: 'var'; name: Var }
  | { kind: 'lam'; param: Var; body: Term }
  | { kind: 'app'; func: Term; arg: Term }
  | { kind: 'let'; name: Var; expr: Term; body: Term }
  | { kind: 'num'; value: number }
  | { kind: 'bool'; value: boolean };

// 类型是由类型变量、Int / Bool 构造子和 → 构造子构成的树。
export type Id = number;

export interface TVar {
  kind: 'tvar';
  id: Id;
}
export interface TCon {
  kind: 'tcon';
  name: 'Int' | 'Bool';
}
export interface TFun {
  kind: 'tfun';
  param: Type;
  body: Type;
}
export type Type = TVar | TCon | TFun;

let nextId = 0;
export const fresh = (): TVar => {
  nextId++;
  return { kind: 'tvar', id: nextId };
};
