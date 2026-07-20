import { describe, it, expect } from 'vitest';
import { boxToMaybe, Box_, Maybe_ } from '../transformations';

describe('10 HKT / natural transformations', () => {
  it('box→maybe is a natural transformation', () => {
    const out = boxToMaybe({ value: 7 });
    expect(out.kind).toBe('just');
    if (out.kind === 'just') expect(out.value).toBe(7);
  });

  it('Box.map preserves structure', () => {
    expect(Box_.map({ value: 5 }, (x) => x * 2).value).toBe(10);
  });

  it('Maybe.just makes a present value', () => {
    expect(Maybe_.just(42).kind).toBe('just');
  });
});
