# Chapter 01 — Untyped Lambda Calculus

The smallest Turing-complete language.

## Goal

After this chapter you can:

- Define the syntax, free variables, capture-avoiding substitution, β-reduction,
  normal-order evaluation strategy, and α-equivalence of the pure lambda calculus.
- Encode booleans, pairs, naturals (Church), lists, and recursion (Y combinator) as
  pure λ-terms.
- Reason about termination, divergence, and the Church-Rosser property.

## Formal rules

```
syntax  t ::= x | λx. t | t t
FV(x)         = {x}
FV(λx. t)     = FV(t) \ {x}
FV(t1 t2)     = FV(t1) ∪ FV(t2)

β  (λx. t1) t2   ──→   [x ↦ t2] t1     (with α-renaming if free vars clash)

normal order   redex chosen by leftmost-outermost strategy
call-by-value  redex chosen by leftmost-innermost (no free vars allowed in operand)
```

## Files

- `ast.ts`         — `Term` algebraic data type + AST builder.
- `parser.ts`      — Tokenizer + Pratt-style parser, names reserved so chapter-02 can extend it.
- `subst.ts`       — Capture-avoiding substitution, α-equivalence.
- `evaluator.ts`   — Small-step β-reduction and a normal-order big-step interpreter with fuel.
- `church.ts`      — Boolean, pair, Nat, List, Y combinator as λ-terms.
- `demo.ts`        — Runs every example.
- `__tests__/`     — Vitest specs asserting each rule.
