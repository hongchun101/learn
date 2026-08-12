import { describe, it, expect, expectTypeOf } from 'vitest';
import type {
  AppError} from '../src/18-errors/index.js';
import {
  all,
  allSettled,
  describeError,
  first,
  flatMap,
  loadUser,
  map,
  mapError,
  ok,
  err,
  runSagaWithErrors,
  safeAsyncMap,
  toAppError,
  tryAsync,
  trySync,
  unwrap,
  unwrapOr,
  validateUserId,
  type Result,
} from '../src/18-errors/index.js';

describe('Module 18: Error Handling Patterns', () => {
  it('map/flatMap/mapError preserve the error type', () => {
    const a = ok(2);
    expect(map(a, (x) => x * 3)).toEqual(ok(6));
    expect(flatMap(ok(2), (x) => ok(String(x)))).toEqual(ok('2'));
    expect(mapError(err('x'), (e) => `wrapped: ${e}`)).toEqual(err('wrapped: x'));
    expect(unwrapOr(err('x'), 0)).toBe(0);
    expect(unwrapOr(ok(7), 0)).toBe(7);
  });

  it('all short-circuits on the first error', () => {
    expect(all([ok(1), err('first'), ok(3)])).toEqual(err('first'));
    expect(all([ok(1), ok(2), ok(3)])).toEqual(ok([1, 2, 3]));
  });

  it('allSettled collects both', () => {
    expect(allSettled([ok(1), err('a'), ok(3), err('b')])).toEqual({
      values: [1, 3],
      errors: ['a', 'b'],
    });
  });

  it('first returns the first success or all errors', () => {
    expect(first([err('a'), ok(2), err('c')])).toEqual(ok(2));
    expect(first([err('a'), err('c')])).toEqual(err(['a', 'c']));
  });

  it('describeError is exhaustive over AppError', () => {
    expect(describeError({ kind: 'NotFound', path: 'x' })).toContain('x');
    expect(describeError({ kind: 'Permission', resource: 'db' })).toContain('db');
    expect(describeError({ kind: 'Validation', issues: [] })).toContain('0');
    expect(describeError({ kind: 'Network', cause: 'timeout' })).toContain('timeout');
    expect(describeError({ kind: 'Conflict', resource: 'sku' })).toContain('sku');
    expectTypeOf<AppError['kind']>().toEqualTypeOf<
      'NotFound' | 'Permission' | 'Validation' | 'Network' | 'Conflict'
    >();
  });

  it('tryAsync catches and returns a Result', async () => {
    const a = await tryAsync(Promise.resolve(42));
    expect(a).toEqual(ok(42));
    const b = await tryAsync(Promise.reject(new Error('boom')));
    expect(b.ok).toBe(false);
    if (b.ok) throw new Error('expected error');
    expect((b.error as Error).message).toBe('boom');
  });

  it('trySync catches throws synchronously', () => {
    expect(trySync(() => 42)).toEqual(ok(42));
    const r = trySync(() => {
      throw new Error('boom');
    });
    expect(r.ok).toBe(false);
  });

  it('toAppError narrows unknown to AppError', () => {
    expect(toAppError(new Error('x'))).toEqual({ kind: 'Network', cause: 'x' });
    expect(toAppError('string')).toEqual({ kind: 'Network', cause: 'string' });
  });

  it('unwrap throws on error', () => {
    expect(() => unwrap(err('boom'))).toThrow('boom');
    expect(unwrap(ok(42))).toBe(42);
  });

  it('validateUserId returns Validation error on bad input', () => {
    expect(validateUserId('').ok).toBe(false);
    expect(validateUserId('a'.repeat(65)).ok).toBe(false);
    expect(validateUserId('u_1').ok).toBe(true);
  });

  it('loadUser returns Result<User, AppError>', async () => {
    const repo = {
      findById: async (_id: string) => null as { id: string; email: string } | null,
    };
    const r1 = await loadUser('', repo);
    expect(r1.ok).toBe(false);
    if (r1.ok) throw new Error('expected error');
    expect(r1.error.kind).toBe('Validation');

    const r2 = await loadUser('u_1', repo);
    expect(r2.ok).toBe(false);
    if (r2.ok) throw new Error('expected error');
    expect(r2.error.kind).toBe('NotFound');

    const repo2 = { findById: async (id: string) => ({ id, email: 'a@b' }) };
    const r3 = await loadUser('u_2', repo2);
    expect(r3.ok).toBe(true);
    if (!r3.ok) throw new Error('expected ok');
    expect(r3.value.email).toBe('a@b');
  });

  it('safeAsyncMap maps each item to a Result', async () => {
    async function* source() {
      yield 1;
      yield 2;
      yield 3;
    }
    const out: number[] = [];
    for await (const r of safeAsyncMap(source(), async (n) => ok(n * 10))) {
      if (r.ok) out.push(r.value);
    }
    expect(out).toEqual([10, 20, 30]);
  });

  it('runSagaWithErrors resolves a Result', async () => {
    function* gen(): Generator<Promise<Result<unknown, AppError>>, string, unknown> {
      const a: unknown = yield Promise.resolve(ok('first'));
      void a;
      const b: unknown = yield Promise.resolve(ok('second'));
      void b;
      return 'done';
    }
    const r = await runSagaWithErrors(gen());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe('done');
  });
});
