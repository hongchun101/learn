// ∀ / ∃ encodings (Church / System F style).
//
//   ∃α. τ  ≜  ∀β. (∀α. τ → β) → β
//
// Sketches only — full pack/unpack is left to the reader as an exercise,
// since the type system here does not yet have ∃ as a built-in.

import type { Type } from './ast';
import { forall, fun, tv } from './ast';

export const existsAs = (α: string, τ: Type): Type =>
  forall('β', fun(forall(α, fun(τ, tv('β'))), tv('β')));
