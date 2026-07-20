import { describe, it, expect } from 'vitest';
import { nil, cons, append, length, index } from '../vec';

describe('12 GADT Vec', () => {
  it('length is preserved by cons', () => {
    const v = cons(1, cons(2, nil<number>()));
    expect(length(v)).toBe(2);
  });

  it('append concatenates structurally and preserves len', () => {
    const a = cons(1, cons(2, nil<number>()));
    const b = cons(3, nil<number>());
    const c = append(a, b);
    expect(c.items).toEqual([1, 2, 3]);
  });

  it('index returns the right element', () => {
    const v = cons('a', cons('b', cons('c', nil<string>())));
    expect(index(v, 2)).toBe('c');
  });
});
