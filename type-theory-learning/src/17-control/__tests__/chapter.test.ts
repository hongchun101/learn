import { describe, it, expect } from 'vitest';
import { callcc, reset } from '../continuations';

describe('17 control operators', () => {
  it('callcc jumps out of the body', () => {
    const m = callcc<number, number>((exit) => (k) => {
      exit(99);
      k(1);
    });
    expect(reset(m)).toBe(99);
  });

  it('plain CPS-style function', () => {
    const f: (k: (a: number) => void) => void = (k) => k(42);
    let result = 0;
    f((x) => (result = x));
    expect(result).toBe(42);
  });
});
