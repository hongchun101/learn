import { describe, it, expect } from 'vitest';
import {
  foldLeft,
  foldRight,
  fromNullable,
  first,
  findIndex,
  mapOption,
  none,
  pipe,
  some,
  unwrapOption,
  memoize1,
  lazy,
} from '../src/08-functional/index.js';

describe('Module 8: Functional Patterns', () => {
  it('Option is total', () => {
    expect(mapOption(some(2), (x) => x * 2)).toEqual(some(4));
    expect(mapOption(none, (x: number) => x * 2)).toEqual(none);
  });

  it('fromNullable maps nullish to none', () => {
    expect(fromNullable(null)).toBe(none);
    expect(fromNullable(undefined)).toBe(none);
    expect(fromNullable(0)).toEqual(some(0));
    expect(fromNullable('a')).toEqual(some('a'));
  });

  it('unwrapOption uses fallback', () => {
    expect(unwrapOption(some(7), 0)).toBe(7);
    expect(unwrapOption(none, 0)).toBe(0);
  });

  it('first / findIndex are total', () => {
    expect(first([1, 2, 3], (x) => x > 1)).toEqual(some(2));
    expect(first([], () => true)).toBe(none);
    expect(findIndex(['a', 'b', 'c'], (x) => x === 'b')).toEqual(some(1));
    expect(findIndex([], () => true)).toBe(none);
  });

  it('foldLeft / foldRight', () => {
    expect(foldLeft([1, 2, 3], 0, (a, b) => a + b)).toBe(6);
    expect(foldRight([1, 2, 3], [] as number[], (acc, x) => [x, ...acc])).toEqual([1, 2, 3]);
  });

  it('pipe composes functions', () => {
    const result = pipe(
      5,
      (x: number) => x * 2,
      (x) => x + 1,
      (x) => `value=${x}`,
    );
    expect(result).toBe('value=11');
  });

  it('memoize1 caches by JSON stringified args', () => {
    let calls = 0;
    const f = memoize1((a: number, b: number) => {
      calls++;
      return a + b;
    });
    expect(f(1, 2)).toBe(3);
    expect(f(1, 2)).toBe(3);
    expect(calls).toBe(1);
    expect(f(2, 1)).toBe(3);
    expect(calls).toBe(2);
  });

  it('lazy defers computation', () => {
    let calls = 0;
    const v = lazy(() => {
      calls++;
      return 42;
    });
    expect(calls).toBe(0);
    void v.value;
    expect(calls).toBe(1);
    void v.value;
    expect(calls).toBe(1);
  });
});
