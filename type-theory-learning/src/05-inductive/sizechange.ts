// 一个微型一阶 DSL 上的 size-change 终止性检查器。
//
// 灵感来自 Jones-Boehm。一个程序是一组函数，每个函数作用于一个参数。
// `go` 遍历器会为每次递归调用记录一条边。若调用点的实参
// 名字与当前形参**不同**，则记为 `less`（保守地假设调用点
// 发生了结构上的缩减）。同名实参意味着没有缩减 —— 不会终止。

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

/** 遍历每个函数体，返回从各函数形参出发的 SCG 边。 */
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

/** 保守的终止性测试：每次递归调用必须存在一条 `less` 边。 */
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
