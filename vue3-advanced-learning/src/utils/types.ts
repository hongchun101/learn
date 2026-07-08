/**
 * Type helpers, narrowing, and predicates.
 * All exports below are type guards — they preserve narrowing.
 */

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function hasKey<T extends string>(
  v: unknown,
  key: T
): v is Record<T, unknown> {
  return isObject(v) && key in v;
}

export function isPromiseLike<T = unknown>(v: unknown): v is PromiseLike<T> {
  return isObject(v) && typeof v.then === 'function';
}

/** Safe JSON.parse returning undefined on failure. */
export function safeJsonParse<T = unknown>(raw: string): T | undefined {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

/** Deep-clone plain data only. */
export function deepClone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(deepClone) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = deepClone(v);
  }
  return out as T;
}
