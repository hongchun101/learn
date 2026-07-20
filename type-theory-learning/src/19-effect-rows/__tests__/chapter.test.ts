import { describe, it, expect } from 'vitest';
import { empty, has, insert, unify } from '../row';

describe('19 effect rows', () => {
  it('insert adds an effect', () => {
    const r = insert('io', empty);
    expect(has('io', r)).toBe(true);
  });

  it('unify of two closed rows', () => {
    const r = unify(insert('io', empty), insert('exn', empty));
    expect(has('io', r) && has('exn', r)).toBe(true);
  });
});
