// =============================================================================
// Chapter 12 — Advanced Distributed Systems
// =============================================================================
// Goal: the patterns that tie everything together once you have consensus,
// replication, and time. This chapter covers:
//
//   * Distributed transactions: 2PC, Saga (compensating actions), TCC,
//     Outbox, XA.
//   * CRDTs: state-based (CvRDT) and op-based (CmRDT) data types for
//     conflict-free replicated state. G-Counter, PN-Counter, OR-Set,
//     LWW-Register, RGA (Replicated Growable Array).
//   * Log-based messaging: Kafka-style write-ahead log, partitions,
//     consumer groups, offset commits, exactly-once via transactions.
//   * Observability: OpenTelemetry trace context (W3C Trace Context),
//     span tree, sampling, RED/USE metrics, structured logging with
//     trace/span IDs.
//
// These are the patterns you reach for when your system needs to span
// data centres, handle cross-service workflows, or support offline
// collaboration.
// =============================================================================
//
// STUDY (read alongside docs/STUDY/ch12-advanced.md)
// -----------------------------------------------------------------------------
// Prerequisites: Chapters 09–11.
// Why it matters: this is the chapter that ties every previous chapter into
// a working system. Saga handles multi-service workflows; CRDTs relax
// consistency for collaboration; the partitioned log is the substrate of
// modern messaging; observability is what makes any of the above debuggable.
// Key invariants:
//   * Saga is eventually consistent; 2PC is atomic. Pick accordingly.
//   * CRDTs are commutative, associative, idempotent. Merge order is free.
//   * Kafka-style partitioned log: ordered within a partition, total
//     across partitions is undefined.
//   * W3C trace context: 16-byte trace id, 8-byte parent id, 1-byte flags.
//   * Structured logging must carry trace context so a single request is
//     stitched across services.
// Common pitfalls:
//   * Confusing 2PC with Saga (sync vs eventual).
//   * OR-Set tombstones grow without bound.
//   * Forgetting to thread the trace context across services.
//   * Sampling too aggressively and losing rare-path traces.
// Interview-ready summary: I can describe Saga, every CRDT in the chapter,
// the partitioned log, and propagate trace context across an end-to-end
// request.
// -----------------------------------------------------------------------------
// Study guide: docs/STUDY/ch12-advanced.md
// Test:        tests/ch12-advanced.test.ts
// Demo:        npx tsx src/12-advanced/demo.ts
// =============================================================================

export { Saga, GCounter, PNCounter, LwwRegister, OrSet, PartitionedLog, parseTraceParent, formatTraceParent, isSampled, childContext, newSpanId, newTraceId, Tracer, StructuredLogger } from './advanced.js';
export type { SagaStep, LogRecord, TraceContext, SpanRecord, LogLine } from './advanced.js';
export { demo } from './demo.js';
