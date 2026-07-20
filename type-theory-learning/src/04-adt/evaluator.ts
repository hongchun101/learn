// Big-step evaluator for ADT-stlc.

import type { Term, Type, Var } from './ast';
import { v } from './ast';

export class Stuck extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Stuck';
  }
}

function free(t: Term): Set<Var> {
  const out = new Set<Var>();
  go(t);
  return out;
  function go(u: Term): void {
    switch (u.kind) {
      case 'var':
        out.add(u.name);
        return;
      case 'lam':
        if (!out.has(u.param)) go(u.body);
        return;
      case 'app':
        go(u.func);
        go(u.arg);
        return;
      case 'true':
      case 'false':
      case 'nat':
        return;
      case 'succ':
      case 'iszero':
      case 'fst':
      case 'snd':
      case 'inl':
      case 'inr':
      case 'proj':
        go(u.expr);
        return;
      case 'pair':
        go(u.left);
        go(u.right);
        return;
      case 'case':
        go(u.scrut);
        if (!out.has(u.leftVar)) go(u.leftBranch);
        if (!out.has(u.rightVar)) go(u.rightBranch);
        return;
      case 'record':
        for (const [, sub] of u.fields) go(sub);
        return;
      case 'tag':
        go(u.expr);
        return;
      case 'caseTag':
        go(u.scrut);
        for (const [, varName, arm] of u.alts) if (!out.has(varName)) go(arm);
        return;
    }
  }
}

function rename(name: Var, fresh: Var, t: Term): Term {
  switch (t.kind) {
    case 'var':
      return t.name === name ? v(fresh) : t;
    case 'lam':
      return { ...t, param: t.param === name ? fresh : t.param, body: rename(name, fresh, t.body) };
    case 'app':
      return { ...t, func: rename(name, fresh, t.func), arg: rename(name, fresh, t.arg) };
    case 'true':
    case 'false':
    case 'nat':
      return t;
    case 'succ':
      return { ...t, expr: rename(name, fresh, t.expr) };
    case 'iszero':
      return { ...t, expr: rename(name, fresh, t.expr) };
    case 'pair':
      return { ...t, left: rename(name, fresh, t.left), right: rename(name, fresh, t.right) };
    case 'fst':
    case 'snd':
    case 'inl':
    case 'inr':
    case 'proj':
    case 'tag':
      return { ...t, expr: rename(name, fresh, (t as { expr: Term }).expr) };
    case 'case':
      return {
        kind: 'case',
        scrut: rename(name, fresh, t.scrut),
        leftVar: t.leftVar === name ? fresh : t.leftVar,
        leftBranch: rename(name, fresh, t.leftBranch),
        rightVar: t.rightVar === name ? fresh : t.rightVar,
        rightBranch: rename(name, fresh, t.rightBranch),
      };
    case 'record':
      return { ...t, fields: t.fields.map(([k, sub]) => [k, rename(name, fresh, sub)] as const) };
    case 'caseTag': {
      const alts = t.alts.map(
        ([k, varName, arm]) => [k, varName === name ? fresh : varName, rename(name, fresh, arm)] as const,
      );
      return { ...t, alts };
    }
  }
}

function freshN(base: Var, avoid: ReadonlySet<Var>): Var {
  let n = 0;
  let cand = base;
  while (avoid.has(cand)) cand = `${base}${n++}`;
  return cand;
}

export function subst(name: Var, s: Term, t: Term): Term {
  switch (t.kind) {
    case 'var':
      return t.name === name ? s : t;
    case 'lam': {
      if (t.param === name) return t;
      const freeS = free(s);
      if (freeS.has(t.param)) {
        const fresh = freshN(t.param, new Set([...free(t.body), ...freeS]));
        const renamed = rename(t.param, fresh, t.body);
        return { ...t, param: fresh, body: subst(name, s, renamed) };
      }
      return { ...t, body: subst(name, s, t.body) };
    }
    case 'app':
      return { ...t, func: subst(name, s, t.func), arg: subst(name, s, t.arg) };
    case 'true':
    case 'false':
    case 'nat':
      return t;
    case 'succ':
      return { ...t, expr: subst(name, s, t.expr) };
    case 'iszero':
      return { ...t, expr: subst(name, s, t.expr) };
    case 'pair':
      return { ...t, left: subst(name, s, t.left), right: subst(name, s, t.right) };
    case 'fst':
    case 'snd':
    case 'inl':
    case 'inr':
    case 'proj':
    case 'tag':
      return { ...t, expr: subst(name, s, (t as { expr: Term }).expr) };
    case 'case':
      return {
        kind: 'case',
        scrut: subst(name, s, t.scrut),
        leftVar: t.leftVar,
        leftBranch: subst(name, s, t.leftBranch),
        rightVar: t.rightVar,
        rightBranch: subst(name, s, t.rightBranch),
      };
    case 'record':
      return { ...t, fields: t.fields.map(([k, sub]) => [k, subst(name, s, sub)] as const) };
    case 'caseTag':
      return { ...t, alts: t.alts.map(([k, varName, arm]) => [k, varName, subst(name, s, arm)] as const) };
  }
}

export function evalT(t: Term): Term {
  switch (t.kind) {
    case 'true':
    case 'false':
    case 'nat':
    case 'lam':
      return t;
    case 'var':
      throw new Stuck('free var at eval');
    case 'succ': {
      const e = evalT(t.expr);
      if (e.kind !== 'nat') throw new Stuck('succ of non-nat');
      return { kind: 'nat', value: e.value + 1 };
    }
    case 'iszero': {
      const e = evalT(t.expr);
      if (e.kind !== 'nat') throw new Stuck('iszero of non-nat');
      return e.value === 0 ? { kind: 'true' } : { kind: 'false' };
    }
    case 'pair': {
      const a = evalT(t.left);
      const b = evalT(t.right);
      return { kind: 'pair', left: a, right: b };
    }
    case 'fst': {
      const e = evalT(t.expr);
      if (e.kind !== 'pair') throw new Stuck('fst of non-pair');
      return e.left;
    }
    case 'snd': {
      const e = evalT(t.expr);
      if (e.kind !== 'pair') throw new Stuck('snd of non-pair');
      return e.right;
    }
    case 'inl':
      return { kind: 'inl', expr: evalT(t.expr), ofRight: t.ofRight };
    case 'inr':
      return { kind: 'inr', expr: evalT(t.expr), ofLeft: t.ofLeft };
    case 'case': {
      const e = evalT(t.scrut);
      if (e.kind === 'inl') {
        return evalT(subst(t.leftVar, e.expr, t.leftBranch));
      }
      if (e.kind === 'inr') {
        return evalT(subst(t.rightVar, e.expr, t.rightBranch));
      }
      throw new Stuck('case of non-sum');
    }
    case 'app': {
      const f = evalT(t.func);
      if (f.kind !== 'lam') throw new Stuck('app of non-function');
      const a = evalT(t.arg);
      return evalT(subst(f.param, a, f.body));
    }
    case 'record':
      return { kind: 'record', fields: t.fields.map(([k, sub]) => [k, evalT(sub)] as const) };
    case 'proj': {
      const e = evalT(t.expr);
      if (e.kind !== 'record') throw new Stuck('proj of non-record');
      const f = e.fields.find(([k]) => k === t.label);
      if (!f) throw new Stuck(`no field ${t.label}`);
      return f[1];
    }
    case 'tag':
      return { kind: 'tag', tag: t.tag, expr: evalT(t.expr) };
    case 'caseTag': {
      const e = evalT(t.scrut);
      if (e.kind !== 'tag') throw new Stuck('caseTag of non-tag');
      const a = t.alts.find(([k]) => k === e.tag);
      if (!a) throw new Stuck(`no alt ${e.tag}`);
      return evalT(subst(a[1], e.expr, a[2]));
    }
  }
}
