import { describe, it, expect } from 'vitest';
import { bounded, forget, positive } from '../liquid';

describe('14 refinement types', () => {
  it('positive(5) succeeds and forgets to 5', () => {
    expect(forget(positive(5))).toBe(5);
  });

  it('positive(-1) throws', () => {
    expect(() => positive(-1)).toThrow();
  });

  it('bounded(50, 0, 100) accepts', () => {
    expect(bounded(50, 0, 100).value).toBe(50);
  });
});
