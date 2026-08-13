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
//
// STUDY (read alongside docs/STUDY/ch08-reliability-retries.md)
// -----------------------------------------------------------------------------
// Prerequisites: Chapter 05 (TCP RTT) for the backoff intuition.
// Why it matters: every cross-network call is unreliable. Without these
// patterns, a single flapping downstream will take your service down.
// Key invariants:
//   * Full jitter: `random(0, base * 2^n)`. AWS's recommendation.
//   * Circuit breaker: closed → open (after threshold) → half-open (after
//     cooldown) → closed (after probe success). Each transition is one
//     decision.
//   * Token bucket: refill at `rate` per second, cap at `capacity`. Tokens
//     saturate at capacity; no negative tokens on long idle.
//   * Idempotency-Key: a unique key per write. The server stores the
//     response for a TTL and replays it on retry.
// Common pitfalls:
//   * Backoff without jitter — clients thunder.
//   * Retry without idempotency — the same operation can be applied twice.
//   * Circuit breaker without half-open — a flaky downstream never recovers.
//   * Token bucket overflow on long idle.
// Interview-ready summary: I can wrap a fetch with idempotency, jittered
// retry, a circuit breaker, and a token bucket, and explain why each layer
// is necessary.
// -----------------------------------------------------------------------------
// Study guide: docs/STUDY/ch08-reliability-retries.md
// Test:        tests/ch08-reliability-retries.test.ts
// Demo:        npx tsx src/08-reliability-retries/demo.ts
// =============================================================================

export {
  newIdempotencyKey, backoffDelay, retry,
  CircuitBreaker, TokenBucket, IdempotencyStore, hedgedRequest,
} from './reliability.js';
export type { BackoffConfig, CircuitState, CircuitBreakerConfig, IdempotencyRecord } from './reliability.js';
export { demo } from './demo.js';
