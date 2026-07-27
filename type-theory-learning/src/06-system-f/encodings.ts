// ∀ / ∃ 编码（Church / System F 风格）。
//
//   ∃α. τ  ≜  ∀β. (∀α. τ → β) → β
//
// 仅为示意 —— 完整的 pack/unpack 留给读者作为练习，
// 因为本类型系统尚未把 ∃ 作为内建类型。

import type { Type } from './ast';
import { forall, fun, tv } from './ast';

export const existsAs = (α: string, τ: Type): Type =>
  forall('β', fun(forall(α, fun(τ, tv('β'))), tv('β')));
