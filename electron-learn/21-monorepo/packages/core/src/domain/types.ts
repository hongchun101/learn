// packages/core/src/domain/types.ts
// 通用领域类型
export type UUID = string;
export type ISO8601 = string;

export interface Entity<TId = UUID> {
  readonly id: TId;
  readonly createdAt: ISO8601;
  readonly updatedAt: ISO8601;
}

export interface PagedList<T> {
  items: T[];
  total: number;
  hasNext: boolean;
}

export interface Result<T, E = Error> {
  ok: boolean;
  value?: T;
  error?: E;
}

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<T>(error: Error): Result<T> {
  return { ok: false, error };
}
