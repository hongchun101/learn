# Chapter 06 — System F (Polymorphic Lambda Calculus)

Impredicative polymorphism: `∀α. τ` types and `Λα. t` terms.

## Goal

- Extend STLC kinds with `→` and `∀`.
- Implement a System F type checker (kind-bound, no inhabitation of kinds).
- Encode existential types as `∃α. τ ≜ ∀β. (∀α. τ → β) → β`.
- Show how η-equivalence gives us curry–Howard-style data.

## Files

- `ast.ts`
- `checker.ts`
- `encodings.ts` — `∀/∃` via Church-style
- `__tests__/chapter.test.ts`
