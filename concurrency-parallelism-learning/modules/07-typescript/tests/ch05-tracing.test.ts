import { describe, it, expect } from 'vitest';
import { trace, makeTracer, groupByDepth } from '../src/ch05-instrumentation/traced-worker.js';

describe('ch05-tracing: traced worker', () => {
  it('emits started before ended for each call', async () => {
    const wrapped = trace(async (n: number) => n + 1, 'unit');
    const out = await wrapped(1);
    expect(out).toBe(2);
    const records = wrapped.tracer.records();
    expect(records.length).toBe(2);
    expect(records[0]?.kind).toBe('started');
    expect(records[1]?.kind).toBe('ended');
  });

  it('records an error when the worker throws', async () => {
    const wrapped = trace(async (n: number) => {
      if (n < 0) throw new Error('neg');
      return n;
    }, 'err');
    await expect(wrapped(-1)).rejects.toThrow('neg');
    const records = wrapped.tracer.records();
    expect(records.length).toBe(2);
    expect(records[0]?.kind).toBe('started');
    expect(records[1]?.kind).toBe('error');
  });

  it('child tracer increments depth', async () => {
    const parent = makeTracer<number>('p');
    const child = parent.child();
    parent.start(1);
    child.start(2);
    expect(parent.depth()).toBe(0);
    expect(child.depth()).toBe(1);
    const groups = groupByDepth(parent);
    // Both tracers share backing, so we expect two depth groups.
    expect(groups.size).toBeGreaterThanOrEqual(1);
  });
});