// 一个微型 BNF DSL。
//
// 我们将文法表示为：
//
//   { start: 'Expr', rules: [['E', [['L','E','E']], ['x']] ], ... }
//
// 我们不附带完整的解析器生成器；本章仅展示其形态，
// 并把 BNF 反向渲染为可读的字符串。

export type NonTerminal = string;
export type Terminal = string;

export interface Rule {
  lhs: NonTerminal;
  /** 每个候选式是一个符号列表。 */
  rhs: ReadonlyArray<ReadonlyArray<string>>;
}

export interface Grammar {
  start: NonTerminal;
  rules: ReadonlyArray<Rule>;
}

/** `render(g)` 以教材风格渲染 BNF：`A ::= B C | D | ε`。 */
export function render(g: Grammar): string {
  return g.rules
    .map(
      (r) =>
        `${r.lhs} ::=${r.rhs.map((alt) => (alt.length === 0 ? ' ε' : alt.join(' '))).join('\n     |')}`,
    )
    .join('\n');
}

/** `derive(g, symbol)` — `symbol` 的直接产生式。 */
export function derive(g: Grammar, symbol: NonTerminal): ReadonlyArray<ReadonlyArray<string>> {
  const r = g.rules.find((rr) => rr.lhs === symbol);
  if (!r) throw new Error(`no rule for ${symbol}`);
  return r.rhs;
}

/** 算术表达式的示例文法。 */
export const arithmeticGrammar: Grammar = {
  start: 'E',
  rules: [
    {
      lhs: 'E',
      rhs: [
        ['E', '+', 'E'],
        ['E', '*', 'E'],
        ['n'],
      ],
    },
    { lhs: 'n', rhs: [['0'], ['1'], ['2']] },
  ],
};
