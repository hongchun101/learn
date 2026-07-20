import { describe, it, expect } from 'vitest';
import {
  backoffDelay, retry, CircuitBreaker, TokenBucket, IdempotencyStore, hedgedRequest, newIdempotencyKey,
  demo as ch08Demo,
} from '../src/08-reliability-retries/index.js';

describe('08 — backoff', () => {
  it('no-jitter is deterministic and exponential, capped at maxMs', () => {
    const cfg = { baseMs: 10, maxMs: 1000, maxAttempts: 10, jitter: 'none' as const };
    expect(backoffDelay(cfg, 0)).toBe(10);
    expect(backoffDelay(cfg, 1)).toBe(20);
    expect(backoffDelay(cfg, 2)).toBe(40);
    expect(backoffDelay(cfg, 7)).toBe(1000);
  });
  it('full jitter is in [0, exp]', () => {
    const cfg = { baseMs: 10, maxMs: 1000, maxAttempts: 5, jitter: 'full' as const, random: () => 0.5 };
    expect(backoffDelay(cfg, 0)).toBe(5);
  });
  it('equal jitter centers around exp/2', () => {
    const cfg = { baseMs: 10, maxMs: 1000, maxAttempts: 5, jitter: 'equal' as const, random: () => 0 };
    expect(backoffDelay(cfg, 0)).toBe(5);
  });
  it('decorrelated jitter uses 3x previous', () => {
    const cfg = { baseMs: 10, maxMs: 1000, maxAttempts: 5, jitter: 'decorrelated' as const, random: () => 1 };
    expect(backoffDelay(cfg, 0)).toBe(30);
  });
});

describe('08 — retry', () => {
  it('succeeds on the first try', async () => {
    let calls = 0;
    const r = await retry(async () => { calls++; return 42; }, { baseMs: 1, maxMs: 10, maxAttempts: 3, jitter: 'none' });
    expect(r).toBe(42);
    expect(calls).toBe(1);
  });
  it('retries up to maxAttempts', async () => {
    let calls = 0;
    await expect(
      retry(async () => { calls++; throw new Error('boom'); }, { baseMs: 1, maxMs: 10, maxAttempts: 3, jitter: 'none' }),
    ).rejects.toThrow('boom');
    expect(calls).toBe(3);
  });
  it('aborts on non-retryable', async () => {
    let calls = 0;
    await expect(
      retry(
        async () => { calls++; throw new Error('nope'); },
        { baseMs: 1, maxMs: 10, maxAttempts: 5, jitter: 'none' },
        undefined,
        (e) => (e as Error).message !== 'nope',
      ),
    ).rejects.toThrow('nope');
    expect(calls).toBe(1);
  });
});

describe('08 — circuit breaker', () => {
  it('opens after failureThreshold failures', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, resetMs: 1000 });
    const fail = async () => { throw new Error('boom'); };
    await expect(cb.call(fail)).rejects.toThrow('boom');
    await expect(cb.call(fail)).rejects.toThrow('boom');
    expect(cb.state).toBe('open');
    await expect(cb.call(fail)).rejects.toThrow('circuit open');
  });
  it('moves to half-open after resetMs', async () => {
    let now = 0;
    const cb = new CircuitBreaker({ failureThreshold: 1, resetMs: 100 }, () => now);
    await expect(cb.call(async () => { throw new Error('x'); })).rejects.toThrow('x');
    expect(cb.state).toBe('open');
    now = 50;
    await expect(cb.call(async () => 1)).rejects.toThrow('circuit open');
    now = 200;
    expect(await cb.call(async () => 1)).toBe(1);
    expect(cb.state).toBe('closed');
  });
});

describe('08 — token bucket', () => {
  it('consumes up to capacity, then denies', () => {
    const b = new TokenBucket(3, 1, () => 0);
    expect(b.tryConsume(0)).toBe(true);
    expect(b.tryConsume(0)).toBe(true);
    expect(b.tryConsume(0)).toBe(true);
    expect(b.tryConsume(0)).toBe(false);
  });
  it('refills over time', () => {
    let now = 0;
    const b = new TokenBucket(3, 1, () => now);
    b.tryConsume(0); b.tryConsume(0); b.tryConsume(0);
    expect(b.tryConsume(0)).toBe(false);
    now = 1000;
    expect(b.tryConsume(now)).toBe(true);
  });
});

describe('08 — idempotency store', () => {
  it('returns the same record on second reserve', () => {
    const s = new IdempotencyStore(1000, () => 0);
    s.reserve('k');
    s.complete('k', { x: 1 });
    const r2 = s.reserve('k');
    expect(r2.status).toBe('completed');
    expect(r2.result).toEqual({ x: 1 });
  });
});

describe('08 — hedged request', () => {
  // This test uses real setTimeout to exercise scheduling. The delays are
  // small (100ms / 20ms) so the suite cost is bounded. Deterministic fake
  // timers would change the wall-clock contract being tested.
  it('returns the faster of two', async () => {
    const v = await hedgedRequest(
      () => new Promise<number>((r) => setTimeout(() => r(1), 100)),
      () => new Promise<number>((r) => setTimeout(() => r(2), 20)),
      { hedgeAfterMs: 30 },
    );
    expect(v).toBe(2);
  });
});

describe('08 — keys are unique', () => {
  it('generates distinct UUIDs', () => {
    const a = newIdempotencyKey();
    const b = newIdempotencyKey();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});

describe('08 — demo', () => {
  it('runs end-to-end', () => {
    expect(() => ch08Demo()).not.toThrow();
  });
});
