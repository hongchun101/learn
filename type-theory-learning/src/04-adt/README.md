# Chapter 04 — Product, Sum, Record, Variant

The "algebraic" in algebraic data types: products, sums, and record/variant
constructions. Each is given by its elimination form (`fst`/`snd`, `case`,
projections, pattern-matching).

## Goal

After this chapter you can:

- Add product types `τ₁ × τ₂`, sum types `τ₁ + τ₂`, record types
  `{label:τ, ...}` and variant / tagged-union types `<label:τ, ...>` to STLC.
- Implement their introduction and elimination terms.
- Prove η-equivalence for products, and code the elimination forms as a
  translation into STLC (Church encoding) and vice versa.

## Files

- `ast.ts`       — Extension to STLC AST.
- `checker.ts`   — Type checker + derivation of eliminator forms.
- `evaluator.ts` — Big-step interpreter including `case` for sums.
- `eta.ts`       — `η ×η`(eta-rule) encoding/projection helpers.
- `__tests__/chapter.test.ts`
