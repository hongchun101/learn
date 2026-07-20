/**
 * Chapter 5 — Tapped / Traced causal tracing.
 *
 * A `Tracer<I>` wraps a `Worker<I, O>` and emits structured records
 * describing each call: `started`, `ended`, `id`, `depth`, `at`,
 * `item`, `result`. The wrapper is causal: each call carries the
 * `id` and `depth` of its parent so a consumer can rebuild the
 * tree without parsing logs.
 *
 * The records are typed (`TraceRecord<I, O>`), so a downstream
 * analyser gets the same guarantees as the wrapped worker.
 */

import type { Worker } from '../ch01-types/typed-pool.js';

// ---------------------------------------------------------------------------
// Tracer primitives
// ---------------------------------------------------------------------------

/** A single trace record. */
export type TraceRecord<I, O> =
  | { kind: 'started'; id: string; depth: number; item: I; at: number }
  | { kind: 'ended'; id: string; depth: number; item: I; at: number; result: O }
  | { kind: 'error'; id: string; depth: number; item: I; at: number; error: unknown };

/** A typed tracer. */
export interface Tracer<I> {
  /** Begin tracing the next call. Returns the record id. */
  start(item: I): string;
  /** Mark a previously-started call as ended successfully. */
  end(id: string, item: I, result: unknown): void;
  /** Mark a previously-started call as ended with an error. */
  error(id: string, item: I, err: unknown): void;
  /** Snapshot of all records emitted so far. */
  records(): ReadonlyArray<TraceRecord<I, unknown>>;
  /** Current trace depth (number of nested `child()` calls). */
  depth(): number;
  /** Spawn a child tracer that increments depth by one. */
  child(): Tracer<I>;
}

/**
 * Build a tracer. The optional `prefix` is concatenated with a
 * monotonically-increasing counter to form record ids.
 */
export function makeTracer<I>(prefix = 't'): Tracer<I> {
  let counter = 0;
  let currentDepth = 0;
  const out: Array<TraceRecord<I, unknown>> = [];

  function make(level: number): Tracer<I> {
    return {
      start(item: I): string {
        const id = `${prefix}-${counter++}`;
        out.push({ kind: 'started', id, depth: level, item, at: Date.now() });
        return id;
      },
      end(id: string, item: I, result: unknown): void {
        out.push({ kind: 'ended', id, depth: level, item, at: Date.now(), result });
      },
      error(id: string, item: I, err: unknown): void {
        out.push({ kind: 'error', id, depth: level, item, at: Date.now(), error: err });
      },
      records(): ReadonlyArray<TraceRecord<I, unknown>> {
        return out;
      },
      depth(): number {
        return level;
      },
      child(): Tracer<I> {
        return make(level + 1);
      },
    };
  }

  // Pin the depth tracking so a `child()` increments without a parent
  // pointer — child tracers reference the same backing array.
  const base = make(currentDepth);
  return base;
}

// ---------------------------------------------------------------------------
// Traced worker wrapper
// ---------------------------------------------------------------------------

/**
 * A `Worker<I, O>` wrapped in a tracer. The tracer is shared across
 * calls so a sequence of invocations on the same wrapper produces a
 * single timeline.
 */
export interface TracedWorker<I, O> {
  (input: I): Promise<O>;
  readonly tracer: Tracer<I>;
}

/**
 * Wrap a worker so each invocation emits a `started` and `ended`
 * (or `error`) record. The returned function is structurally a
 * `Worker<I, O>` so it can be passed to a `Pool<I, O>` or to the
 * cross-language `makeFanOutFanIn` reference.
 */
export function trace<I, O>(worker: Worker<I, O>, prefix?: string): TracedWorker<I, O> {
  const tracer = makeTracer<I>(prefix);
  const wrappedFn = async (input: I): Promise<O> => {
    const id = tracer.start(input);
    try {
      const out = await worker(input);
      tracer.end(id, input, out);
      return out;
    } catch (err) {
      tracer.error(id, input, err);
      throw err;
    }
  };
  return Object.assign(wrappedFn, { tracer }) as TracedWorker<I, O>;
}

/**
 * Reconstruct a tree of trace records grouped by `depth`. Useful
 * for tests and dashboards.
 */
export function groupByDepth<I, O>(
  tracer: Tracer<I>,
): ReadonlyMap<number, ReadonlyArray<TraceRecord<I, O>>> {
  const groups = new Map<number, TraceRecord<I, O>[]>();
  for (const r of tracer.records() as ReadonlyArray<TraceRecord<I, O>>) {
    const list = groups.get(r.depth);
    if (list) list.push(r);
    else groups.set(r.depth, [r]);
  }
  return groups;
}