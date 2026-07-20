import { describe, it, expect } from 'vitest';
import { pack, use } from '../existential';

describe('25 existentials', () => {
  it('pack hides the inner type from callers', () => {
    const e = pack((s: string) => s.length);
    expect(use(e, 'hello')).toBe(5);
  });
});
