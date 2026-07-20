import { describe, it, expect } from 'vitest';
import { EqTrait, coherent, vtable } from '../traits';

describe('22 Rust traits', () => {
  it('two vtables for different types are coherent', () => {
    const a = vtable(EqTrait, [1, 2], { eq: (x: number, y: number) => x === y });
    const b = vtable(EqTrait, 'hello', { eq: (x: string, y: string) => x === y });
    expect(coherent(a, b)).toBe(true);
  });

  it('coherence forbids two impls of the same trait for the same type', () => {
    const a = vtable(EqTrait, 1, {});
    const b = vtable(EqTrait, 1, {});
    expect(coherent(a, b)).toBe(false);
  });
});
