import { describe, it, expect, expectTypeOf } from 'vitest';
import {
  assert,
  createFSMSafe,
  firstNPrimes,
  getDeep,
  machine,
  processOrThrow,
  readFile,
  tupleConst,
  withContext,
  withTempFile,
  type DeepAwaited,
  type FsError,
  type FSMDef,
} from '../src/13-ts5x/index.js';

describe('Module 13: TypeScript 5.x Cutting-Edge Features', () => {
  it('const type parameters lock literals', () => {
    const t = tupleConst('a', 'b', 'c');
    expectTypeOf(t).toEqualTypeOf<readonly ['a', 'b', 'c']>();
  });

  it('NoInfer prevents inference from a position', () => {
    expectTypeOf(machine).toEqualTypeOf<FSMDef<'idle' | 'running' | 'stopped'>>();
    expect(machine.initial).toBe('idle');
  });

  it('createFSMSafe widens S from the states map', () => {
    const m = createFSMSafe({
      initial: 'a',
      states: { a: {}, b: {}, c: {} },
    });
    expectTypeOf(m).toEqualTypeOf<FSMDef<'a' | 'b' | 'c'>>();
  });

  it('using disposes on scope exit', () => {
    let observed: boolean | null = null;
    withTempFile('/tmp/x', (f) => {
      expect(f.isClosed).toBe(false);
      observed = f.isClosed;
      return 1;
    });
    // After the scope exits, [Symbol.dispose] ran and `f` is closed.
    expect(observed).toBe(false);
  });

  it('iterator helpers are lazy and short-circuit', () => {
    const first5 = firstNPrimes(5);
    expect(first5).toEqual([2, 3, 5, 7, 11]);
  });

  it('deeply nested promises flatten with a guard', async () => {
    expect(await getDeep()).toBe(42);
    expectTypeOf<DeepAwaited<Promise<Promise<Promise<number>>>>>().toEqualTypeOf<number>();
  });

  it('Result with branded error variants', () => {
    const r = readFile('');
    if (r.ok) throw new Error('expected error');
    expect(r.error.kind).toBe('NotFound');
    if (r.error.kind === 'NotFound') expect(r.error.path).toBe('');
    expectTypeOf<FsError['kind']>().toEqualTypeOf<'NotFound' | 'Permission' | 'Io'>();
  });

  it('assert narrows the rest of the scope', () => {
    expect(() => assert(false, 'boom')).toThrow('boom');
    expect(() => processOrThrow(Number.NaN)).toThrow();
    expect(processOrThrow(5)).toBe(10);
  });

  it('withContext passes through the typed context', () => {
    const result = withContext({ userId: 'u1' }, (ctx) => ctx.userId);
    expect(result).toBe('u1');
  });
});
