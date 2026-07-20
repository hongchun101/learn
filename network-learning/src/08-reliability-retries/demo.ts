import { newIdempotencyKey, backoffDelay, CircuitBreaker, TokenBucket, IdempotencyStore, hedgedRequest } from './reliability.js';

export function demo(): void {
  console.log('[08] key =', newIdempotencyKey());
  console.log('[08] backoff 0..5 (full jitter) =', Array.from({ length: 6 }, (_, i) => Math.round(backoffDelay({ baseMs: 10, maxMs: 1000, maxAttempts: 10, jitter: 'full' }, i))));

  // Token bucket: 5 tokens, 1 per second.
  const bucket = new TokenBucket(5, 1);
  console.log('[08] bucket consumes 5:', Array.from({ length: 6 }, () => bucket.tryConsume(0)).map((b) => +b).join(','));

  // Idempotency store
  const store = new IdempotencyStore(1000);
  const key = newIdempotencyKey();
  const r1 = store.reserve(key);
  store.complete(key, { ok: true });
  const r2 = store.reserve(key);
  console.log('[08] idempotency status:', r1.status, '->', r2.status, 'cached result:', JSON.stringify(r2.result));

  // Circuit breaker construction (state demonstrated in tests).
  void new CircuitBreaker({ failureThreshold: 2, resetMs: 1000 });

  // Hedged request: secondary is faster.
  void hedgedRequest(
    () => new Promise<number>((r) => setTimeout(() => r(1), 100)),
    () => new Promise<number>((r) => setTimeout(() => r(2), 20)),
    { hedgeAfterMs: 30 },
  ).then((v) => console.log('[08] hedged result =', v));
}
