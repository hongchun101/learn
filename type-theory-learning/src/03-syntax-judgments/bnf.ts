// Tiny BNF DSL.
//
// We represent a grammar as:
//
//   { start: 'Expr', rules: [['E', [['L','E','E']], ['x']] ], ... }
//
// We don't ship a full parser-generator; this chapter just shows the shape
// and renders the BNF back to a readable string.

export type NonTerminal = string;
export type Terminal = string;

export interface Rule {
  lhs: NonTerminal;
  /** Each alternative is a list of symbols. */
  rhs: ReadonlyArray<ReadonlyArray<string>>;
}

export interface Grammar {
  start: NonTerminal;
  rules: ReadonlyArray<Rule>;
}

/** `render(g)` renders BNF in textbook style: `A ::= B C | D | ε`. */
export function render(g: Grammar): string {
  return g.rules
    .map(
      (r) =>
        `${r.lhs} ::=${r.rhs.map((alt) => (alt.length === 0 ? ' ε' : alt.join(' '))).join('\n     |')}`,
    )
    .join('\n');
}

/** `derive(g, symbol)` — direct productions for `symbol`. */
export function derive(g: Grammar, symbol: NonTerminal): ReadonlyArray<ReadonlyArray<string>> {
  const r = g.rules.find((rr) => rr.lhs === symbol);
  if (!r) throw new Error(`no rule for ${symbol}`);
  return r.rhs;
}

/** Worked example: arithmetic expressions. */
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
