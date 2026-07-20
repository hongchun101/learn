import { describe, it, expect } from 'vitest';
import { succ, zero } from '../nat';

describe('24 Haskell HKT / type families', () => {
  it('Builds a tower of three', () => {
    const t = succ(succ(succ(zero)));
    expect(t._tag).toBe('succ');
  });
});
