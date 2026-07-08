/**
 * Shared types used across modules.
 */

export type Brand<T, K extends string> = T & { readonly __brand: K };

export type UserId = Brand<string, 'UserId'>;
export type OrderId = Brand<string, 'OrderId'>;
export type Iso8601 = Brand<string, 'Iso8601'>;

export interface Page<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly cursor?: string;
}
