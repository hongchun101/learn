// System F 的 AST。
//
//   τ ::= α | τ → τ | ∀α. τ
//   t ::= x | λα. t | t [τ] | λx:τ. t | t t | (constants)

export type Var = string;

export type Type =
  | { kind: 'var'; name: Var }
  | { kind: 'fun'; param: Type; body: Type }
  | { kind: 'all'; var: Var; body: Type };

export type Term =
  | { kind: 'var'; name: Var }
  | { kind: 'tlam'; var: Var; body: Term }
  | { kind: 'tapp'; expr: Term; type: Type }
  | { kind: 'lam'; param: Var; paramType: Type; body: Term }
  | { kind: 'app'; func: Term; arg: Term }
  | { kind: 'true' }
  | { kind: 'false' };

export const v = (name: Var): Term => ({ kind: 'var', name });
export const tlam = (var_: Var, body: Term): Term => ({ kind: 'tlam', var: var_, body });
export const tapp = (expr: Term, type: Type): Term => ({ kind: 'tapp', expr, type });
export const lam = (param: Var, paramType: Type, body: Term): Term => ({
  kind: 'lam',
  param,
  paramType,
  body,
});
export const app = (func: Term, arg: Term): Term => ({ kind: 'app', func, arg });
export const tru: Term = { kind: 'true' };
export const fls: Term = { kind: 'false' };

export const tv = (name: Var): Type => ({ kind: 'var', name });
export const fun = (param: Type, body: Type): Type => ({ kind: 'fun', param, body });
export const forall = (var_: Var, body: Type): Type => ({ kind: 'all', var: var_, body });
