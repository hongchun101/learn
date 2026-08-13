# Chapter 08 — Reliability, Ordering, Idempotency, Retries

## Goal

After this chapter you should be able to:

- Compute exponential backoff with four jitter strategies.
- Implement a circuit breaker with closed/open/half-open states.
- Use a token bucket to smooth bursts.
- Apply idempotency keys to POSTs.
- Pick hedging to reduce tail latency.

## Prerequisites

Chapter 05 (TCP RTT) for the backoff intuition.

## Walkthrough

1. **Backoff.** `backoffDelay` returns the next delay for a given
   attempt. The chapter uses four jitter strategies:
   - **Full jitter:** `random(0, base * 2^n)`.
   - **Equal jitter:** `base * 2^n / 2 + random(0, base * 2^n / 2)`.
   - **Decorrelated jitter:** `random(base, prev * 3)`.
   - **None:** deterministic.
2. **Retry.** `retry` runs the operation with the chosen backoff.
3. **Circuit breaker.** `CircuitBreaker` has three states:
   - **Closed** — healthy. Failures increment a counter; threshold
     opens the breaker.
   - **Open** — fail fast. After a cooldown, try one request.
   - **Half-open** — probe. If it succeeds, close; if it fails, open.
4. **Token bucket.** `TokenBucket` refills at `rate` per second,
   capping at `capacity`. Smooths bursts.
5. **Idempotency store.** `IdempotencyStore` keeps `(key, response)`
   for a TTL, so retries see the same answer.
6. **Hedged.** `hedgedRequest` sends a second probe after a delay
   if the first hasn't returned.

Run `npx tsx src/08-reliability-retries/demo.ts`.

## Exercises

1. **Backoff.** Compute delays for `baseMs=100`, attempts 0..4, full
   jitter. Compare the worst-case to equal jitter.
2. **Circuit breaker.** Trigger a 100% failure run, see the breaker
   open and a successful call after the cooldown move it to
   half-open then closed.
3. **Token bucket.** Burst 100 tokens at a 10 tps rate, then
   immediately consume 50. See the bucket go to 50; observe the drip
   refill.
4. **Idempotency.** Generate a key, store a response, replay the
   same key, observe the cached response.
5. **Hedging.** Make a primary that takes 200 ms, a secondary that
   takes 50 ms after a 100 ms hedge. The hedged call should win.

### Answers (sketch)

1. Full jitter is the AWS recommendation; worst-case is the same
   as equal jitter but the average is lower.
2. Use the `CircuitBreaker` class with `failureThreshold=3`.
3. `TokenBucket` exposes `take(n)`.
4. `IdempotencyStore.execute(key, fn)` does the rest.
5. `hedgedRequest` returns the first future to resolve.

## Common pitfalls

- **Backoff without jitter.** Synchronised clients thunder.
- **Retry without idempotency.** The same operation can be applied
  twice.
- **Circuit breaker with no half-open.** A flaky downstream never
  recovers.
- **Token bucket overflow.** Saturating `tokens` at `capacity` is
  required; otherwise arithmetic may go negative on long idle.

## Interview questions

1. **Why is full jitter the AWS recommendation?** It gives the
   lowest collision probability for synchronous retries.
2. **Why does a circuit breaker not replace a retry?** They protect
   against different things: retries recover from transient noise;
   breakers protect the upstream from being pummelled.
3. **When is hedging worse than retries?** When the primary is
   cheap and the secondary doubles the cost. Hedging shines for
   tail-latency-sensitive reads.
4. **What's the danger of an idempotency store?** Storage growth and
   races on the same key. Use a TTL and a status-check protocol.
5. **Why is exponential backoff alone insufficient?** Without jitter,
   the clients retry in lockstep.

## What to build

A `ResilientClient` that wraps a fetch with: idempotency-key for
unsafe methods, retry with full jitter, circuit breaker, and token
bucket. Then benchmark against a flaky mock server.

## References

- AWS Architecture Blog, "Exponential Backoff and Jitter".
- Nygard, "Release It!", 2nd ed.
- Hystrix / Resilience4j documentation.
