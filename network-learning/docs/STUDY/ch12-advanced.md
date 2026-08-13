# Chapter 12 — Advanced Distributed Systems

## Goal

After this chapter you should be able to:

- Use Saga to coordinate a long-running workflow.
- Pick the right CRDT for the right problem.
- Sketch a Kafka-style partitioned log.
- Propagate W3C Trace Context across services.
- Emit OpenTelemetry-shaped spans and structured logs.

## Prerequisites

Chapters 09–11.

## Walkthrough

1. **Saga.** `Saga` runs a sequence of steps with compensations.
   Compensations are inverse operations; saga is **eventually
   consistent**.
2. **CRDTs.** `GCounter`, `PNCounter`, `LwwRegister`, `OrSet`. The
   point is **commutative, associative, idempotent** merge so the
   order of replication doesn't matter.
3. **Partitioned log.** `PartitionedLog` has a key → partition mapping
   and an append-only log per partition. Consumers track offsets.
4. **Trace context.** `parseTraceParent`/`formatTraceParent` handle
   W3C `traceparent`. `childContext` extends the trace.
5. **Tracer.** `Tracer` records spans with attributes and timings.
6. **Structured logger.** `StructuredLogger` attaches trace/span IDs
   to every log line.

Run `npx tsx src/12-advanced/demo.ts`.

## Exercises

1. **Saga.** Run a 3-step saga where step 2 fails; verify
   compensation of step 1.
2. **CRDT merge.** Replicate a `GCounter` and confirm convergence.
3. **Log.** Append messages with mixed keys; consume by partition.
4. **Trace context.** Parse a `traceparent` and create a child.
5. **Logging.** Emit a log line with trace context.

### Answers (sketch)

1. Saga compensates in reverse order.
2. G-Counter merge is element-wise max.
3. Log offsets are per-partition.
4. `childContext` shares the trace ID.
5. The logger is a small wrapper.

## Common pitfalls

- **Saga vs 2PC.** Saga is eventually consistent; 2PC is atomic.
- **CRDT growth.** OR-Set tombstones grow without bound.
- **Trace context length.** `traceparent` is fixed-width.
- **Log volume.** Partition pruning is essential.

## Interview questions

1. **When is saga preferred over 2PC?** When the workflow is long,
   the participants are independent, and you can accept eventual
   consistency.
2. **Why use a CRDT?** When you cannot afford coordination but you
   need conflict-free convergence.
3. **What's the difference between push and pull gossip?** Push is
   bandwidth-efficient; pull is more accurate.
4. **Why propagate trace context?** To stitch a request across
   services in observability.
5. **What's the cost of structured logging?** Every line carries a
   span ID; budget for it.

## What to build

A `traceBus` that connects a producer, a consumer, and a logger
across three "services". Each service adds a child span and logs
with the trace ID. Run the demo and inspect the trace.

## References

- Garcia-Molina & Salem, "Sagas", 1987.
- Shapiro et al., "A comprehensive study of Convergent and
  Commutative Replicated Data Types", 2011.
- Kreps, "Kafka: a Distributed Messaging System for Log Processing",
  NetDB 2011.
- W3C Trace Context.
- OpenTelemetry specification.
