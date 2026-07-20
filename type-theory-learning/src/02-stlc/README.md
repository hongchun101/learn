# Chapter 02 — Simply Typed Lambda Calculus

The first stop on the road to type theory. STLC extends Chapter 01's calculus
with a small language of types (`Bool`, `Nat`, `→`) and a **bidirectional**
type checker (synthesis/checking modes).

## Goal

After this chapter you can:

- Write `infer` (synthesis) and `check` (checking) routines for STLC.
- Reason about preservation and progress as tests over a concrete execution of
  β-reduction on well-typed terms.
- Encode Church booleans as a tiny demonstration that types matter.

## Formal rules

```
types     τ ::= Bool | Nat | τ → τ
terms     t ::= x | λx:τ. t | t t | true | false | nat(n) | succ t | iszero t

Γ ⊢ t ⇒ τ    (synthesize)
Γ ⊢ t ⇐ τ    (check against τ)
```

```
────────────────────  VAR
Γ ⊢ x ⇒ Γ(x)

Γ, x : τ₁ ⊢ t ⇐ τ₂
────────────────────  LAM'        ── synthesize only after check
Γ ⊢ λx:τ₁. t ⇒ τ₁ → τ₂

Γ ⊢ t₁ ⇒ τ₁ → τ₂     Γ ⊢ t₂ ⇐ τ₁
────────────────────────────────  APP
Γ ⊢ t₁ t₂ ⇒ τ₂

─────────  TRUE ;  ────────  FALSE        Γ ⊢ e ⇒ Nat
Γ ⊢ true ⇒ Bool   Γ ⊢ false ⇒ Bool       Γ ⊢ succ e ⇒ Nat

Γ ⊢ e ⇒ Nat
──────────────────  ISZERO
Γ ⊢ iszero e ⇒ Bool

────────────  ANNO       Γ ⊢ t ⇐ τ     Γ = Γ'
Γ ⊢ (t : τ) ⇐ τ               ('infer' may need annotation, fall to check)
```

Plus the dual **subsumption rule** for path types:

```
Γ ⊢ t ⇒ τ′     τ′ = τ
───────────────────────
Γ ⊢ t ⇐ τ
```

(Bidirectional type checking avoids this rule by separating the modes.)

## Files

- `ast.ts`       — `Term` (typed) + `Type`.
- `parser.ts`    — Surface syntax `true | false | succ t | iszero t | nat(n)` and `λx:τ.e`.
- `checker.ts`   — `infer`/`check`, with errors.
- `preservation.ts` — Free-typed property tests that exercise well-typedness and progress.
- `demo.ts`
- `__tests__/chapter.test.ts`
