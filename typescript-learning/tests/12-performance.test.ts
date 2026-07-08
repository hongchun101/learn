import { describe, it, expect, expectTypeOf } from 'vitest';
import { assertDefined, assertIsString, stringify, tuple, typedKeys } from '../src/12-performance/index.js';

describe('Module 12: Performance & Compiler Internals', () => {
  it('const tuple infers literals', () => {
    const t = tuple('a', 'b');
    expectTypeOf(t).toEqualTypeOf<readonly ['a', 'b']>();
  });

  it('assertDefined narrows for the rest of the scope', () => {
    const x: string | null = 'hi';
    assertDefined(x);
    expect(x.toUpperCase()).toBe('HI');
  });

  it('assertIsString throws on non-string', () => {
    expect(() => assertIsString(1)).toThrow();
    expect(() => assertIsString('a')).not.toThrow();
  });

  it('stringify is total over unknown', () => {
    expect(stringify('a')).toBe('a');
    expect(stringify(1)).toBe('1');
    expect(stringify([1, 2, 3])).toBe('1,2,3');
    expect(stringify({ a: 1 })).toBe('{"a":1}');
  });

  it('typedKeys returns (keyof T)[]', () => {
    const k = typedKeys({ a: 1, b: 2 });
    expectTypeOf(k).toEqualTypeOf<('a' | 'b')[]>();
    expect(k.sort()).toEqual(['a', 'b']);
  });
});
