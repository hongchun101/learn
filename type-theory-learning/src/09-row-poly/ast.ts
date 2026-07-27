// 一个微型的行多态记录演算。

export type Var = string;
export type Label = string;

export type Type =
  | { kind: 'int' }
  | { kind: 'bool' }
  | { kind: 'var'; name: Var }
  | { kind: 'arr'; param: Type; body: Type }
  | { kind: 'rec'; row: Row }
  | { kind: 'row_var'; name: Var };

export type Row =
  | { kind: 'closed' }
  | { kind: 'open'; row: Row; label: Label; field: Type }
  | { kind: 'open_var'; name: Var };

export type Term =
  | { kind: 'var'; name: Var }
  | { kind: 'lam'; param: Var; body: Term }
  | { kind: 'app'; func: Term; arg: Term }
  | { kind: 'recLit'; fields: ReadonlyArray<readonly [Label, Term]> }
  | { kind: 'proj'; expr: Term; label: Label };

export const int: Type = { kind: 'int' };
export const bool: Type = { kind: 'bool' };
