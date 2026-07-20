import { describe, it, expect } from 'vitest';
import { pureHandler } from '../effects';

describe('18 algebraic effects', () => {
  it('pureHandler just unwraps a return', () => {
    expect(pureHandler({ kind: 'ret', value: 41 })).toBe(41);
  });
});
