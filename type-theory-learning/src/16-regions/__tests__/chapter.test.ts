import { describe, it, expect } from 'vitest';
import { bindST, returnST, runST } from '../st';

describe('16 ST monad', () => {
  it('return + bind chains', () => {
    const m = bindST(returnST(2))((x) => returnST(x * 10));
    expect(runST(m)).toBe(20);
  });
});
