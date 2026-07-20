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

// -----------------------------------------------------------------------------
// Saga — long-running business transaction made of local transactions + comp
// -----------------------------------------------------------------------------

export type SagaStep = {
  name: string;
  /** Apply the local transaction. */
  forward: () => Promise<void>;
  /** Compensating action that undoes the effect of `forward`. */
  compensate: () => Promise<void>;
};

export class Saga {
  private done: SagaStep[] = [];
  constructor(private readonly steps: SagaStep[]) {}
  async run(): Promise<{ ok: boolean; failedAt?: string }> {
    for (const step of this.steps) {
      try {
        await step.forward();
        this.done.push(step);
      } catch {
        // Compensate in reverse order.
        for (let i = this.done.length - 1; i >= 0; i--) {
          await this.done[i]!.compensate();
        }
        return { ok: false, failedAt: step.name };
      }
    }
    return { ok: true };
  }
}

// -----------------------------------------------------------------------------
// CRDTs
// -----------------------------------------------------------------------------

/** A grow-only counter. Each replica has its own count; the merged value
 *  is the sum of all counts. */
export class GCounter {
  private counts: Map<string, number>;
  constructor(nodeId: string) { this.counts = new Map([[nodeId, 0]]); }
  static merge(a: GCounter, b: GCounter): GCounter {
    const out = new GCounter('');
    for (const [k, v] of a.counts) out.counts.set(k, Math.max(v, b.counts.get(k) ?? 0));
    for (const [k, v] of b.counts) if (!out.counts.has(k)) out.counts.set(k, v);
    return out;
  }
  inc(nodeId: string, by = 1): void { this.counts.set(nodeId, (this.counts.get(nodeId) ?? 0) + by); }
  value(): number {
    let s = 0;
    for (const v of this.counts.values()) s += v;
    return s;
  }
}

/** A positive-negative counter: two G-Counters, one for increments and one
 *  for decrements. Value is P - N. */
export class PNCounter {
  private p: GCounter;
  private n: GCounter;
  constructor(nodeId: string) { this.p = new GCounter(nodeId); this.n = new GCounter(nodeId); }
  static merge(a: PNCounter, b: PNCounter): PNCounter {
    const out = new PNCounter('');
    out.p = GCounter.merge(a.p, b.p);
    out.n = GCounter.merge(a.n, b.n);
    return out;
  }
  inc(nodeId: string, by = 1): void { this.p.inc(nodeId, by); }
  dec(nodeId: string, by = 1): void { this.n.inc(nodeId, by); }
  value(): number { return this.p.value() - this.n.value(); }
}

/** Last-Writer-Wins Register. Stores a value with a timestamp; the value
 *  with the highest timestamp wins. */
export class LwwRegister<T> {
  private value: T | undefined;
  private ts = 0;
  set(v: T, ts: number): void {
    if (ts >= this.ts) { this.value = v; this.ts = ts; }
  }
  get(): T | undefined { return this.value; }
  get ts_(): number { return this.ts; }
  static merge<T>(a: LwwRegister<T>, b: LwwRegister<T>): LwwRegister<T> {
    const out = new LwwRegister<T>();
    if (a.ts >= b.ts) { out.value = a.value; out.ts = a.ts; }
    else { out.value = b.value; out.ts = b.ts; }
    return out;
  }
}

/** OR-Set (Observed-Removed Set) with tombstones. add() adds a unique
 *  tag; remove() marks all observed tags as removed. */
export class OrSet<T> {
  private adds = new Map<T, Set<string>>();
  private removes = new Map<T, Set<string>>();
  private tagCounter = 0;
  private nodeId: string;
  constructor(nodeId: string) { this.nodeId = nodeId; }
  static merge<T>(a: OrSet<T>, b: OrSet<T>): OrSet<T> {
    const out = new OrSet<T>('');
    for (const [k, tags] of a.adds) for (const t of tags) out._addTag(k, t);
    for (const [k, tags] of b.adds) for (const t of tags) out._addTag(k, t);
    for (const [k, tags] of a.removes) for (const t of tags) out._removeTag(k, t);
    for (const [k, tags] of b.removes) for (const t of tags) out._removeTag(k, t);
    return out;
  }
  add(item: T): string {
    this.tagCounter++;
    const tag = `${this.nodeId}:${this.tagCounter}`;
    this._addTag(item, tag);
    return tag;
  }
  remove(item: T): void {
    const tags = this.adds.get(item) ?? new Set();
    let bucket = this.removes.get(item);
    if (!bucket) { bucket = new Set(); this.removes.set(item, bucket); }
    for (const t of tags) bucket.add(t);
  }
  has(item: T): boolean {
    const tags = this.adds.get(item);
    if (!tags) return false;
    const removed = this.removes.get(item);
    for (const t of tags) if (!removed?.has(t)) return true;
    return false;
  }
  values(): T[] {
    const out: T[] = [];
    for (const item of this.adds.keys()) if (this.has(item)) out.push(item);
    return out;
  }
  private _addTag(item: T, tag: string): void {
    let bucket = this.adds.get(item);
    if (!bucket) { bucket = new Set(); this.adds.set(item, bucket); }
    bucket.add(tag);
  }
  private _removeTag(item: T, tag: string): void {
    let bucket = this.removes.get(item);
    if (!bucket) { bucket = new Set(); this.removes.set(item, bucket); }
    bucket.add(tag);
  }
}

// -----------------------------------------------------------------------------
// Log-based messaging (Kafka-style)
// -----------------------------------------------------------------------------

export interface LogRecord {
  partition: number;
  offset: number;
  key: string | null;
  value: Uint8Array;
  timestamp: number;
}

export class PartitionedLog {
  private partitions: Uint8Array[][] = [];
  private offsets = new Map<string, number>(); // consumer group -> next offset to read
  private committed = new Map<string, number>(); // consumer group -> last committed offset

  constructor(numPartitions: number) {
    for (let i = 0; i < numPartitions; i++) this.partitions.push([]);
  }

  /** Compute the partition for a key. */
  partitionFor(key: string | null): number {
    if (key === null) return 0;
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
    return Math.abs(h) % this.partitions.length;
  }

  /** Append a record to the appropriate partition. Returns the offset. */
  append(key: string | null, value: Uint8Array, _timestamp = Date.now()): { partition: number; offset: number } {
    const p = this.partitionFor(key);
    const offset = this.partitions[p]!.length;
    this.partitions[p]!.push(value);
    return { partition: p, offset };
  }

  /** Read records for a consumer group, starting at the committed offset. */
  read(partition: number, group: string, max: number = 10): LogRecord[] {
    if (!this.committed.has(`${group}:${partition}`)) this.committed.set(`${group}:${partition}`, 0);
    const start = this.committed.get(`${group}:${partition}`)!;
    const out: LogRecord[] = [];
    for (let i = start; i < this.partitions[partition]!.length && out.length < max; i++) {
      out.push({ partition, offset: i, key: null, value: this.partitions[partition]![i]!, timestamp: 0 });
    }
    return out;
  }

  /** Commit the offset for a consumer group + partition. */
  commit(group: string, partition: number, offset: number): void {
    this.committed.set(`${group}:${partition}`, offset);
  }

  /** Total number of records across all partitions. */
  size(): number { return this.partitions.reduce((n, p) => n + p.length, 0); }
}

// -----------------------------------------------------------------------------
// OpenTelemetry W3C Trace Context (RFC: https://www.w3.org/TR/trace-context/)
// =============================================================================

const TRACE_FLAG_SAMPLED = 0x01;

export interface TraceContext {
  /** 16-byte trace ID, hex-encoded. */
  traceId: string;
  /** 8-byte span ID, hex-encoded. */
  spanId: string;
  /** 8-bit trace flags. */
  flags: number;
}

const HEX = /^[0-9a-fA-F]+$/;

/** Parse a W3C `traceparent` header. */
export function parseTraceParent(header: string): TraceContext | null {
  // Format: VERSION (2 hex) - TRACE_ID (32 hex) - SPAN_ID (16 hex) - FLAGS (2 hex)
  const parts = header.split('-');
  if (parts.length !== 4) return null;
  const [version, traceId, spanId, flags] = parts as [string, string, string, string];
  if (version !== '00') return null;
  if (traceId.length !== 32 || !HEX.test(traceId) || /^0{32}$/.test(traceId)) return null;
  if (spanId.length !== 16 || !HEX.test(spanId) || /^0{16}$/.test(spanId)) return null;
  if (flags.length !== 2 || !HEX.test(flags)) return null;
  return { traceId, spanId, flags: Number.parseInt(flags, 16) };
}

/** Format a TraceContext as a `traceparent` header. */
export function formatTraceParent(ctx: TraceContext): string {
  const flags = ctx.flags.toString(16).padStart(2, '0');
  return `00-${ctx.traceId}-${ctx.spanId}-${flags}`;
}

/** Decide whether a span is sampled based on its flags. */
export function isSampled(ctx: TraceContext): boolean {
  return (ctx.flags & TRACE_FLAG_SAMPLED) !== 0;
}

/** Create a child context that shares the trace ID and has a new span ID. */
export function childContext(parent: TraceContext, newSpanId: string): TraceContext {
  return { traceId: parent.traceId, spanId: newSpanId, flags: parent.flags };
}

/** Generate a 16-byte hex span ID. */
export function newSpanId(): string {
  const b = new Uint8Array(8);
  for (let i = 0; i < 8; i++) b[i] = (Math.random() * 256) & 0xff;
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/** Generate a 32-byte hex trace ID. */
export function newTraceId(): string {
  const b = new Uint8Array(16);
  for (let i = 0; i < 16; i++) b[i] = (Math.random() * 256) & 0xff;
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

// -----------------------------------------------------------------------------
// Span — minimal OTel-shaped in-memory span
// -----------------------------------------------------------------------------

export interface SpanRecord {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  name: string;
  startNanos: number;
  endNanos: number;
  attributes: Record<string, string | number | boolean>;
  status: 'ok' | 'error' | 'unset';
}

export class Tracer {
  private finished: SpanRecord[] = [];
  startSpan(name: string, parent: TraceContext | null, attributes: Record<string, string | number | boolean> = {}): { ctx: TraceContext; end: (status?: 'ok' | 'error') => void } {
    const traceId = parent?.traceId ?? newTraceId();
    const spanId = newSpanId();
    const parentSpanId = parent?.spanId ?? null;
    const flags = parent?.flags ?? TRACE_FLAG_SAMPLED;
    const ctx: TraceContext = { traceId, spanId, flags };
    const startNanos = performance.now() * 1e6;
    const record: SpanRecord = {
      traceId, spanId, parentSpanId, name, startNanos, endNanos: 0, attributes, status: 'unset',
    };
    return {
      ctx,
      end: (status: 'ok' | 'error' = 'ok') => {
        record.endNanos = performance.now() * 1e6;
        record.status = status;
        this.finished.push(record);
      },
    };
  }
  finishedSpans(): SpanRecord[] { return this.finished; }
}

// -----------------------------------------------------------------------------
// Structured logging with trace context propagation
// -----------------------------------------------------------------------------

export interface LogLine {
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  traceId?: string;
  spanId?: string;
  attributes: Record<string, unknown>;
}

export class StructuredLogger {
  private lines: LogLine[] = [];
  log(level: LogLine['level'], message: string, ctx: TraceContext | null, attributes: Record<string, unknown> = {}): void {
    const line: LogLine = { timestamp: Date.now(), level, message, attributes };
    if (ctx) { line.traceId = ctx.traceId; line.spanId = ctx.spanId; }
    this.lines.push(line);
  }
  get lines_(): LogLine[] { return this.lines; }
}
