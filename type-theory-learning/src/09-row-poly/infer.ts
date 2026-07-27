// 朴素的行合一。

import type { Label, Row, Term, Type } from './ast';

export function rowUnion(a: Row, b: Row): Row {
  if (a.kind === 'closed') return b;
  if (b.kind === 'closed') return a;
  if (a.kind === 'open_var' && b.kind === 'open_var' && a.name === b.name) return a;
  if (a.kind === 'open') {
    return { kind: 'open', row: rowUnion(a.row, b), label: a.label, field: a.field };
  }
  if (b.kind === 'open') {
    return { kind: 'open', row: rowUnion(b.row, a), label: b.label, field: b.field };
  }
  return a;
}

export function rowProject(r: Row, label: Label): Type | undefined {
  if (r.kind === 'closed') return undefined;
  if (r.kind === 'open') {
    if (r.label === label) return r.field;
    return rowProject(r.row, label);
  }
  return undefined;
}

export function rowHas(r: Row, label: Label): boolean {
  return rowProject(r, label) !== undefined;
}

export function inferLit(ts: ReadonlyArray<readonly [Label, Term]>): { row: Row } {
  let row: Row = { kind: 'closed' };
  for (const [label, t] of ts) {
    void t;
    if (rowHas(row, label)) throw new Error(`duplicate field ${label}`);
    row = { kind: 'open', row, label, field: { kind: 'var', name: 'placeholder' } };
  }
  return { row };
}

export function infer(_t: Term): Type {
  throw new Error('placeholder — real inference left as an exercise');
}

void inferLit;
