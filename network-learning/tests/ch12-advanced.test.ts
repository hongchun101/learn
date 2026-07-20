import { describe, it, expect } from 'vitest';
import {
  Saga, GCounter, PNCounter, LwwRegister, OrSet, PartitionedLog,
  parseTraceParent, formatTraceParent, isSampled, childContext, newSpanId, newTraceId,
  Tracer, StructuredLogger,
  demo as ch12Demo,
} from '../src/12-advanced/index.js';

describe('12 — Saga', () => {
  it('runs steps and compensates on failure', async () => {
    const compensated: string[] = [];
    const saga = new Saga([
      { name: 'a', forward: async () => { /* noop */ }, compensate: async () => { compensated.push('a'); } },
      { name: 'b', forward: async () => { throw new Error('boom'); }, compensate: async () => { compensated.push('b'); } },
      { name: 'c', forward: async () => { /* noop */ }, compensate: async () => { compensated.push('c'); } },
    ]);
    const r = await saga.run();
    expect(r.ok).toBe(false);
    expect(r.failedAt).toBe('b');
    expect(compensated).toEqual(['a']); // b failed before compensation
  });
});

describe('12 — CRDTs', () => {
  it('G-Counter merges by max-per-node', () => {
    const a = new GCounter('A'); a.inc('A', 3);
    const b = new GCounter('B'); b.inc('B', 5); b.inc('A', 1);
    expect(GCounter.merge(a, b).value()).toBe(8);
  });
  it('PN-Counter tracks positive and negative', () => {
    const pn = new PNCounter('A');
    pn.inc('A', 5); pn.dec('A', 2);
    expect(pn.value()).toBe(3);
  });
  it('LWW-Register picks the latest timestamp', () => {
    const r1 = new LwwRegister<string>(); r1.set('a', 1);
    const r2 = new LwwRegister<string>(); r2.set('b', 2);
    expect(LwwRegister.merge(r1, r2).get()).toBe('b');
    expect(LwwRegister.merge(r2, r1).get()).toBe('b');
  });
  it('OR-Set adds and removes', () => {
    const s = new OrSet<string>('n1');
    s.add('a'); s.add('b');
    s.remove('a');
    expect(s.values().sort()).toEqual(['b']);
  });
  it('OR-Set merge is commutative', () => {
    const a = new OrSet<string>('n1'); a.add('a'); a.add('b');
    const b = new OrSet<string>('n2'); b.add('c');
    const m1 = OrSet.merge(a, b).values().sort();
    const m2 = OrSet.merge(b, a).values().sort();
    expect(m1).toEqual(m2);
  });
});

describe('12 — Partitioned log', () => {
  it('appends and reads with consumer offsets', () => {
    const log = new PartitionedLog(3);
    for (let i = 0; i < 10; i++) log.append(`k${i}`, new TextEncoder().encode(`m${i}`));
    const r = log.read(0, 'c1', 100);
    expect(r.length).toBeGreaterThan(0);
    log.commit('c1', 0, r.length);
    expect(log.read(0, 'c1', 100).length).toBe(0);
  });
  it('partitions by key hash', () => {
    const log = new PartitionedLog(3);
    const p0 = log.partitionFor('foo');
    const p1 = log.partitionFor('foo');
    expect(p0).toBe(p1);
  });
});

describe('12 — W3C Trace Context', () => {
  it('parses a valid traceparent', () => {
    const ctx = parseTraceParent('00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01');
    expect(ctx?.traceId).toBe('0af7651916cd43dd8448eb211c80319c');
    expect(ctx?.spanId).toBe('b7ad6b7169203331');
    expect(ctx?.flags).toBe(1);
    expect(isSampled(ctx!)).toBe(true);
  });
  it('rejects malformed traceparent', () => {
    expect(parseTraceParent('00-bad')).toBeNull();
    expect(parseTraceParent('ff-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01')).toBeNull();
  });
  it('round-trips a traceparent', () => {
    const ctx = { traceId: newTraceId(), spanId: newSpanId(), flags: 1 };
    expect(parseTraceParent(formatTraceParent(ctx))).toEqual(ctx);
  });
  it('child context preserves trace id', () => {
    const parent = { traceId: newTraceId(), spanId: newSpanId(), flags: 1 };
    const child = childContext(parent, newSpanId());
    expect(child.traceId).toBe(parent.traceId);
    expect(child.spanId).not.toBe(parent.spanId);
  });
});

describe('12 — Tracer and Logger', () => {
  it('records finished spans with attributes', () => {
    const t = new Tracer();
    const span = t.startSpan('GET /x', null, { 'http.method': 'GET' });
    span.end('ok');
    const finished = t.finishedSpans();
    expect(finished.length).toBe(1);
    expect(finished[0]?.status).toBe('ok');
    expect(finished[0]?.attributes['http.method']).toBe('GET');
  });
  it('structured logger attaches trace context', () => {
    const l = new StructuredLogger();
    const ctx = { traceId: newTraceId(), spanId: newSpanId(), flags: 1 };
    l.log('info', 'hi', ctx, { 'user.id': 'u1' });
    const line = l.lines_[0]!;
    expect(line.traceId).toBe(ctx.traceId);
    expect(line.attributes['user.id']).toBe('u1');
  });
});

describe('12 — demo', () => {
  it('runs end-to-end', () => {
    expect(() => ch12Demo()).not.toThrow();
  });
});
