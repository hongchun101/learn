// =============================================================================
// Chapter 08 — Reliability, Ordering, Idempotency, and Retries
// =============================================================================
// Goal: once you cross a network, every call has three failure modes:
//   1) the request never arrived,
//   2) the response never came back,
//   3) the response came back but was processed twice (because the client
//      retried).
// This chapter covers the patterns that tame these: idempotency keys, retries
// with exponential backoff + jitter, circuit breakers, rate limiters,
// hedged requests, and bulkheads.
//
// We implement pure-function versions of each pattern plus small state
// machines that you can compose into a client.
// =============================================================================

/** Generate a UUIDv4-ish identifier. Uses crypto.randomUUID when available. */
export function newIdempotencyKey(): string {
  if (
    typeof crypto === 'object' &&
    crypto !== null &&
    'randomUUID' in crypto &&
    typeof (crypto as { randomUUID: unknown }).randomUUID === 'function'
  ) {
    return (crypto as { randomUUID: () => string }).randomUUID();
  }
  const b = new Uint8Array(16);
  for (let i = 0; i < 16; i++) b[i] = (Math.random() * 256) & 0xff;
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// -----------------------------------------------------------------------------
// Retry with exponential backoff + jitter
// -----------------------------------------------------------------------------

export interface BackoffConfig {
  baseMs: number;
  maxMs: number;
  maxAttempts: number;
  jitter: 'none' | 'full' | 'equal' | 'decorrelated';
  random?: () => number;
}

/** Compute the delay (ms) for retry attempt index `attempt` (0 = first retry). */
export function backoffDelay(cfg: BackoffConfig, attempt: number, prevDelayMs = cfg.baseMs): number {
  const rand = cfg.random ?? Math.random;
  const exp = Math.min(cfg.maxMs, cfg.baseMs * 2 ** attempt);
  switch (cfg.jitter) {
    case 'none': return exp;
    case 'full': return rand() * exp;
    case 'equal': return exp / 2 + rand() * (exp / 2);
    case 'decorrelated': return Math.min(cfg.maxMs, rand() * (prevDelayMs * 3 - cfg.baseMs) + cfg.baseMs);
  }
}

/**
 * Run `op` with retries. `op` is called repeatedly until it succeeds or
 * `maxAttempts` is reached.
 */
export async function retry<T>(
  op: () => Promise<T>,
  cfg: BackoffConfig,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  isRetryable?: (err: unknown) => boolean,
): Promise<T> {
  let prev = cfg.baseMs;
  let lastErr: unknown;
  for (let attempt = 0; attempt < cfg.maxAttempts; attempt++) {
    try {
      return await op();
    } catch (err) {
      lastErr = err;
      if (isRetryable && !isRetryable(err)) throw err;
      if (attempt === cfg.maxAttempts - 1) break;
      const d = backoffDelay(cfg, attempt, prev);
      prev = d;
      await sleep(d);
    }
  }
  throw lastErr;
}

// -----------------------------------------------------------------------------
// Circuit breaker
// -----------------------------------------------------------------------------

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetMs: number;
  successThreshold?: number;
}

export class CircuitBreaker {
  state: CircuitState = 'closed';
  private failures = 0;
  private successesInHalfOpen = 0;
  private openedAt = 0;
  private readonly cfg: CircuitBreakerConfig;
  private readonly now: () => number;

  constructor(cfg: CircuitBreakerConfig, now: () => number = Date.now) {
    this.cfg = cfg;
    this.now = now;
  }

  async call<T>(op: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (this.now() - this.openedAt >= this.cfg.resetMs) {
        this.state = 'half-open';
        this.successesInHalfOpen = 0;
      } else {
        throw new Error('circuit open');
      }
    }
    try {
      const r = await op();
      this.onSuccess();
      return r;
    } catch (e) {
      this.onFailure();
      throw e;
    }
  }

  private onSuccess() {
    if (this.state === 'half-open') {
      this.successesInHalfOpen++;
      const need = this.cfg.successThreshold ?? 1;
      if (this.successesInHalfOpen >= need) {
        this.state = 'closed';
        this.failures = 0;
      }
    } else {
      this.failures = 0;
    }
  }

  private onFailure() {
    if (this.state === 'half-open') {
      this.state = 'open';
      this.openedAt = this.now();
      return;
    }
    this.failures++;
    if (this.failures >= this.cfg.failureThreshold) {
      this.state = 'open';
      this.openedAt = this.now();
    }
  }
}

// -----------------------------------------------------------------------------
// Token-bucket rate limiter
// -----------------------------------------------------------------------------

export class TokenBucket {
  private tokens: number;
  private last: number;
  constructor(private readonly capacity: number, private readonly refillPerSec: number, now: () => number = Date.now) {
    this.tokens = capacity;
    this.last = now();
  }
  tryConsume(now: number | (() => number) = Date.now): boolean {
    const t = typeof now === 'function' ? now() : now;
    const elapsed = (t - this.last) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSec);
    this.last = t;
    if (this.tokens >= 1) { this.tokens--; return true; }
    return false;
  }
  msUntilAvailable(now: number | (() => number) = Date.now): number {
    const t = typeof now === 'function' ? now() : now;
    const elapsed = (t - this.last) / 1000;
    const tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSec);
    if (tokens >= 1) return 0;
    return Math.ceil((1 - tokens) * 1000 / this.refillPerSec);
  }
}
// -----------------------------------------------------------------------------
// Idempotency store
// -----------------------------------------------------------------------------

export interface IdempotencyRecord {
  key: string;
  status: 'in-flight' | 'completed';
  result?: unknown;
  error?: unknown;
  startedAt: number;
  completedAt?: number;
}

export class IdempotencyStore {
  private records = new Map<string, IdempotencyRecord>();
  private readonly ttlMs: number;
  private readonly clock: () => number;

  constructor(ttlMs = 60_000, clock: () => number = Date.now) {
    this.ttlMs = ttlMs;
    this.clock = clock;
  }

  get(key: string): IdempotencyRecord | undefined {
    const r = this.records.get(key);
    if (!r) return undefined;
    if (this.clock() - r.startedAt > this.ttlMs) {
      this.records.delete(key);
      return undefined;
    }
    return r;
  }

  reserve(key: string): IdempotencyRecord {
    const existing = this.get(key);
    if (existing) return existing;
    const r: IdempotencyRecord = { key, status: 'in-flight', startedAt: this.clock() };
    this.records.set(key, r);
    return r;
  }

  complete(key: string, result: unknown): void {
    const r = this.records.get(key);
    if (!r) return;
    r.status = 'completed';
    r.result = result;
    r.completedAt = this.clock();
  }

  fail(key: string, error: unknown): void {
    const r = this.records.get(key);
    if (!r) return;
    r.status = 'completed';
    r.error = error;
    r.completedAt = this.clock();
  }
}

// -----------------------------------------------------------------------------
// Hedged requests — send the same request to two replicas after a delay.
// -----------------------------------------------------------------------------

export async function hedgedRequest<T>(
  primary: () => Promise<T>,
  secondary: () => Promise<T>,
  options: { hedgeAfterMs: number },
): Promise<T> {
  const { promise, resolve, reject } = Promise.withResolvers<T>();
  let settled = false;
  primary().then(
    (v) => { if (!settled) { settled = true; resolve(v); } },
    (e) => { if (!settled) reject(e); },
  );
  setTimeout(() => {
    if (settled) return;
    secondary().then(
      (v) => { if (!settled) { settled = true; resolve(v); } },
      () => { /* ignore — primary already failed */ },
    );
  }, options.hedgeAfterMs);
  return promise;
}
