# Chapter 09 — Clocks & Ordering

## Goal

After this chapter you should be able to:

- Use Lamport timestamps for a total order.
- Use vector clocks to detect concurrency.
- Build a hybrid logical clock for cross-system correlation.
- Estimate NTP-style offset and round-trip delay.
- Explain TrueTime and the read-write transaction pattern.
- Apply fencing tokens to lock holders.

## Prerequisites

None. The chapter is self-contained.

## Walkthrough

1. **Lamport.** `LamportClock` gives every event a scalar counter. A
   receive bumps the counter to `max(local, remote) + 1`.
2. **Vector.** `VectorClock` keeps a per-node counter. Compare two
   vectors: equal → identical events; less → causal; incomparable →
   concurrent.
3. **HLC.** `HybridLogicalClock` combines a physical wall clock with
   a logical counter, so timestamps are both close to wall time and
   totally ordered.
4. **NTP.** `ntpOffset(samples)` returns the offset and the delay.
   The minimum-filter is `min(delay) / 2`; the offset is the sample
   where the delay is minimum.
5. **TrueTime.** `SimulatedTrueTime` returns an interval
   `[earliest, latest]`. Spanner reads wait out `latest`,
   commits at `earliest + ε`.
6. **Fencing.** `FencingTokenIssuer` hands out strictly-increasing
   tokens. `FencedStorage` rejects writes with a lower token.

Run `npx tsx src/09-clocks-ordering/demo.ts`.

## Exercises

1. **Lamport.** Two processes send three messages. List the events
   in a total order.
2. **Vector.** Detect concurrent events.
3. **HLC.** Confirm two events across processes have non-decreasing
   timestamps.
4. **NTP.** Feed four samples `(t1, t2, t3, t4)`. Read the estimated
   offset and delay.
5. **Fencing.** A lock holder writes with token 5; another holder
   tries to write with token 4. Confirm the second is rejected.

### Answers (sketch)

1. The total order is the global Lamport order.
2. Vector clocks disagree on at least one slot.
3. HLC is monotonic in nanoseconds and the `(physical, logical)`
   pair is unique.
4. Offset = `(t2 - t1 + t3 - t4) / 2`, delay = `(t4 - t1) - (t3 - t2)`.
5. `FencedStorage` rejects writes with stale tokens.

## Common pitfalls

- **Lamport gives total order, not causality.** You also need the
  process id to break ties.
- **Vector clocks do not scale.** They grow with the number of
  writers.
- **HLC vs wall clock.** Physical time is noisy; the logical
  component picks up the slack.
- **Spanner's `ε`.** It's a function of the TrueTime error bound.

## Interview questions

1. **Why do vector clocks beat Lamport?** They detect concurrent
   events.
2. **Why does Spanner use TrueTime?** To make transactions globally
   serialisable without 2PC.
3. **What's the difference between commit wait and commit
   timestamp?** Commit wait is the practical mechanism; the commit
   timestamp is the record.
4. **Why are fencing tokens safer than locks?** Because the storage
   verifies the token; a stale lock holder cannot corrupt data.
5. **What does an NTP server emit?** A 48-byte packet with
   reference time, originate timestamp, receive timestamp, and
   transmit timestamp.

## What to build

A `ClockSync` simulator that runs four "machines" with skewed
wall clocks, exchanges NTP packets, and converges to within a few
ms. Then add a HLC layer that handles cross-system events.

## References

- Lamport, "Time, clocks, and the ordering of events", CACM, 1978.
- Mattern, "Virtual Time and Global States", 1988.
- Kulkarni et al., "Logical Physical Clocks", 2014.
- Corbett et al., "Spanner: Google's Globally Distributed Database",
  OSDI 2012.
- Kleppmann, "How to do distributed locking", 2016.
