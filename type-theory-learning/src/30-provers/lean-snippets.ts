// STLC 与 System F 在 Lean 4 / Coq 中的参考片段。（这些字符串嵌入
// 在项目中，方便读者直接拷贝到 Lean 文件里，或者在实现
// 第 03 章的 prover 时参考。）

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
