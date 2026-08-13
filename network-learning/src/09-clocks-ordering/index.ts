// =============================================================================
// Chapter 09 — Time, Clocks, and Ordering
// =============================================================================
// Goal: every distributed system needs a notion of "what happened first".
// This file covers the algorithms and abstractions that let you answer
// that question when there is no shared clock.
//
//   * Lamport timestamps (1978): a total order on events.
//   * Vector clocks (Mattern 1988): a partial order; detect concurrent events.
//   * Hybrid Logical Clocks (Kulkarni 2014): combine physical time with
//     logical ordering for cross-system correlation.
//   * NTP-style offset estimation: min(round-trip) / 2 as the true offset.
//   * TrueTime (Spanner): an interval API backed by GPS + atomic clocks.
//   * Monotonic clocks: avoid backwards time jumps.
//   * Fencing tokens (Kleppmann 2016): prevent stale writes from corrupting
//     storage.
// =============================================================================
//
// STUDY (read alongside docs/STUDY/ch09-clocks-ordering.md)
// -----------------------------------------------------------------------------
// Prerequisites: none. The chapter is self-contained.
// Why it matters: clocks are the silent failure mode of every distributed
// system. NTP skew, leap-second smearing, and GC pauses turn monotonic
// counters into liars. This chapter gives you the tools to reason about
// "what happened first" when no wall clock is to be trusted.
// Key invariants:
//   * Lamport timestamps are a total order; vector clocks are a partial
//     order with concurrency detection.
//   * HLC is monotonic in (physical, logical) pairs and close to wall time.
//   * TrueTime is an interval API; commit at earliest + ε, wait until latest.
//   * Fencing tokens are strictly increasing; storage rejects stale tokens.
// Common pitfalls:
//   * Confusing Lamport (total order) with cause (who caused whom).
//   * Vector clocks grow with the number of writers.
//   * Spanner's ε is a function of the TrueTime error bound; budget it.
//   * Reading the lock file without checking the token = stale write.
// Interview-ready summary: I can name four clock abstractions, pick the
// right one for a workload, and explain why Spanner uses TrueTime.
// -----------------------------------------------------------------------------
// Study guide: docs/STUDY/ch09-clocks-ordering.md
// Test:        tests/ch09-clocks-ordering.test.ts
// Demo:        npx tsx src/09-clocks-ordering/demo.ts
// =============================================================================

export { LamportClock, VectorClock, HybridLogicalClock, ntpOffset, SimulatedTrueTime, MonotonicClock, FencingTokenIssuer, FencedStorage } from './clocks.js';
export type { TrueTime } from './clocks.js';
export { demo } from './demo.js';
