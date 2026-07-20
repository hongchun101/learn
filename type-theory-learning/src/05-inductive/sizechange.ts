// Size-change termination checker for a tiny first-order DSL.
//
// Jones-Boehm-inspired. A program is a list of functions each over a single
// parameter. The `go` walker records an edge per recursive call. An edge is
// `less` if the argument at the call site is **not** the same name as the
// current parameter (we conservatively assume structural decrease happens at
// the recursive call site). Same-named arg means no decrease — non-termination.

export interface Fun {
  name: string;
  param: string;
  body: Call;
}

export interface ArgRef {
  name: string;
}

export type Call =
  | { kind: 'var'; name: string }
  | { kind: 'apply'; fn: string; arg: ArgRef }
  | { kind: 'let'; bind: string; rhs: Call; cont: Call };

export interface Edge {
  fromParam: string;
  toArg: string;
  relation: 'same' | 'less';
}

/** Walks each body, returning the SCG edges from each function parameter. */
export function buildSCG(prog: ReadonlyArray<Fun>): Edge[] {
  const edges: Edge[] = [];
  for (const f of prog) {
    go(f.body, { name: f.param }, edges);
  }
  return edges;
}

function go(c: Call, cur: ArgRef, edges: Edge[]): void {
  if (c.kind === 'apply') {
    edges.push({
      fromParam: cur.name,
      toArg: c.arg.name,
      relation: c.arg.name === cur.name ? 'same' : 'less',
    });
    return;
  }
  if (c.kind === 'let') {
    go(c.rhs, cur, edges);
    go(c.cont, cur, edges);
  }
}

/** Conservative termination test: every recursive call must have a `less` edge. */
export function decidesTermination(prog: ReadonlyArray<Fun>): boolean {
  const scg = buildSCG(prog);
  for (const f of prog) {
    for (const c of callsIn(f.body)) {
      if (c.kind !== 'apply') continue;
      const has = scg.some(
        (e) => e.fromParam === f.param && e.toArg === c.arg.name && e.relation === 'less',
      );
      if (!has) return false;
    }
  }
  return true;
}

function callsIn(c: Call): Call[] {
  if (c.kind === 'apply') return [c];
  if (c.kind === 'let') return [...callsIn(c.rhs), ...callsIn(c.cont)];
  return [];
}
