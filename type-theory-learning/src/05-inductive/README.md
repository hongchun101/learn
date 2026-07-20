# Chapter 05 — Recursive Types, Induction, Productivity

How to encode and reason about recursive data.

## Goal

- Encode `μ α. F(α)` as a guarded recursive type.
- Implement a `fold`/`unfold` pair and a **size-change termination** check.
- Define codata (streams, infinite lists) and productivity.

## Files

- `ast.ts`       — `mu` + coinductive type formers.
- `sizechange.ts` — termination checker for recursive functions (DSL).
- `codata.ts`    — `Stream a = Cons (Nat, Lazy (Stream a))` (conceptual).
- `__tests__/chapter.test.ts`
