import { describe, it, expect } from 'vitest';
import { compare, eqNumber, showList, showNumber } from '../dict';

describe('15 type-classes / dictionaries', () => {
  it('showList of numbers prints', () => {
    expect(showList(showNumber)([1, 2, 3])).toBe('[1, 2, 3]');
  });

  it('Eq.number says 2 == 2', () => {
    expect(compare(eqNumber)(2, 2)).toBe(true);
    expect(compare(eqNumber)(2, 3)).toBe(false);
  });
});
