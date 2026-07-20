// Reference snippets of STLC and System F in Lean 4 / Coq. (These strings are
// embedded in the project so the reader can copy them into a Lean file or
// reference them when implementing the prover from Chapter 03.)

export const stlcLean = `
inductive Ty : Type
  | bool : Ty
  | nat  : Ty
  | arrow : Ty → Ty → Ty

inductive Tm : Ty → Type
  | var {τ} : ℕ → Tm τ
  | app {τ σ} : Tm (τ.arrow σ) → Tm τ → Tm σ
  | lam {τ} : (ℕ → Tm τ) → Tm (τ.arrow _)`;

export const systemFLean = `
inductive Ty : Type 1
  | var   : ℕ → Ty
  | arrow : Ty → Ty → Ty
  | all   : (ℕ → Ty) → Ty`;

export const preservationStmt = `
theorem preservation {Γ t τ} (e : HasType Γ t τ) (r : Step t t') : HasType Γ t' τ := by
  cases r <;> cases e <;> simp [HasType] <;> assumption`;

export const progressStmt = `
theorem progress {t τ} (e : HasType [] t τ) : Value t ∨ ∃ t', Step t t' := by
  cases e <;> right <;> exact ⟨_, _⟩`;
