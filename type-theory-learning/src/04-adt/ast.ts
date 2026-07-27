// @ts-nocheck
// 为积、和、记录、变体扩展的 AST。

export type Var = string;

export type Type =
  | { kind: 'bool' }
  | { kind: 'nat' }
  | { kind: 'fun'; param: Type; body: Type }
  | { kind: 'pair'; left: Type; right: Type }
  | { kind: 'sum'; left: Type; right: Type }
  | { kind: 'record'; fields: ReadonlyArray<readonly [string, Type]> }
  | { kind: 'variant'; alts: ReadonlyArray<readonly [string, Type]> };

export type VariantAlt = readonly [string, Var, Term];

export type Term =
  | { kind: 'var'; name: Var }
  | { kind: 'lam'; param: Var; paramType: Type; body: Term }
  | { kind: 'app'; func: Term; arg: Term }
  | { kind: 'true' }
  | { kind: 'false' }
  | { kind: 'nat'; value: number }
  | { kind: 'succ'; expr: Term }
  | { kind: 'iszero'; expr: Term }
  | { kind: 'pair'; left: Term; right: Term }
  | { kind: 'fst'; expr: Term }
  | { kind: 'snd'; expr: Term }
  | { kind: 'inl'; expr: Term; ofRight: Type }
  | { kind: 'inr'; expr: Term; ofLeft: Type }
  | { kind: 'case'; scrut: Term; leftVar: Var; leftBranch: Term; rightVar: Var; rightBranch: Term }
  | { kind: 'record'; fields: ReadonlyArray<readonly [string, Term]> }
  | { kind: 'proj'; expr: Term; label: string }
  | { kind: 'tag'; tag: string; expr: Term }
  | { kind: 'caseTag'; scrut: Term; alts: ReadonlyArray<VariantAlt> };

// 构造子
export const bool: Type = { kind: 'bool' };
export const nat: Type = { kind: 'nat' };
export const fun = (param: Type, body: Type): Type => ({ kind: 'fun', param, body });
export const pair = (a: Type, b: Type): Type => ({ kind: 'pair', left: a, right: b });
export const sum = (l: Type, r: Type): Type => ({ kind: 'sum', left: l, right: r });
export const recordTy = (fields: ReadonlyArray<readonly [string, Type]>): Type => ({
  kind: 'record',
  fields,
});
export const variantTy = (alts: ReadonlyArray<readonly [string, Type]>): Type => ({
  kind: 'variant',
  alts,
});

export const v = (name: Var): Term => ({ kind: 'var', name });
export const lam = (param: Var, paramType: Type, body: Term): Term => ({
  kind: 'lam',
  param,
  paramType,
  body,
});
export const app = (func: Term, arg: Term): Term => ({ kind: 'app', func, arg });
export const tru: Term = { kind: 'true' };
export const fls: Term = { kind: 'false' };
export const num = (n: number): Term => ({ kind: 'nat', value: n });
export const succ = (e: Term): Term => ({ kind: 'succ', expr: e });
export const iszero = (e: Term): Term => ({ kind: 'iszero', expr: e });
export const mkPair = (l: Term, r: Term): Term => ({ kind: 'pair', left: l, right: r });
export const fst = (e: Term): Term => ({ kind: 'fst', expr: e });
export const snd = (e: Term): Term => ({ kind: 'snd', expr: e });
export const inl = (e: Term, ofRight: Type): Term => ({ kind: 'inl', expr: e, ofRight });
export const inr = (e: Term, ofLeft: Type): Term => ({ kind: 'inr', expr: e, ofLeft });
export const caseT = (
  scrut: Term,
  lv: Var,
  lb: Term,
  rv: Var,
  rb: Term,
): Term => ({ kind: 'case', scrut, leftVar: lv, leftBranch: lb, rightVar: rv, rightBranch: rb });
export const recordT = (fields: ReadonlyArray<readonly [string, Term]>): Term => ({
  kind: 'record',
  fields,
});
export const proj = (e: Term, label: string): Term => ({ kind: 'proj', expr: e, label });
export const tag = (name: string, e: Term): Term => ({ kind: 'tag', tag: name, expr: e });
export const caseTagT = (scrut: Term, alts: ReadonlyArray<VariantAlt>): Term => ({
  kind: 'caseTag',
  scrut,
  alts,
});

export function typeEq(a: Type, b: Type): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'bool':
    case 'nat':
      return true;
    case 'fun':
      return typeEq(a.param, b.param) && typeEq(a.body, b.body);
    case 'pair':
      return typeEq(a.left, b.left) && typeEq(a.right, b.right);
    case 'sum':
      return typeEq(a.left, b.left) && typeEq(a.right, b.right);
    case 'record':
      if (a.fields.length !== b.fields.length) return false;
      for (let i = 0; i < a.fields.length; i++) {
        const fa = a.fields[i]!;
        const fb = b.fields[i]!;
        if (fa[0] !== fb[0] || !typeEq(fa[1], fb[1])) return false;
      }
      return true;
    case 'variant':
      if (a.alts.length !== b.alts.length) return false;
      for (let i = 0; i < a.alts.length; i++) {
        const fa = a.alts[i]!;
        const fb = b.alts[i]!;
        if (fa[0] !== fb[0] || !typeEq(fa[1], fb[1])) return false;
      }
      return true;
  }
}

export function prettyTy(τ: Type): string {
  switch (τ.kind) {
    case 'bool':
      return 'Bool';
    case 'nat':
      return 'Nat';
    case 'fun': {
      const p = τ.param.kind === 'fun' ? `(${prettyTy(τ.param)})` : prettyTy(τ.param);
      return `${p} → ${prettyTy(τ.body)}`;
    }
    case 'pair':
      return `(${prettyTy(τ.left)} × ${prettyTy(τ.right)})`;
    case 'sum':
      return `(${prettyTy(τ.left)} + ${prettyTy(τ.right)})`;
    case 'record':
      return `{${τ.fields.map(([k, vv]) => `${k}: ${prettyTy(vv)}`).join(', ')}}`;
    case 'variant':
      return `<${τ.alts.map(([k, vv]) => `${k}: ${prettyTy(vv)}`).join(', ')}>`;
  }
}
