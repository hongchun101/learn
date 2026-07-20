import { describe, it, expect } from 'vitest';
import { circle, isCircle, isShape, square } from '../subtype';

describe('21 subtyping', () => {
  it('structural: circle is a Shape', () => {
    expect(isShape(circle(2))).toBe(true);
  });

  it('nominal: circle is named "circle"', () => {
    expect(isCircle(circle(2))).toBe(true);
    expect(isCircle(square(2))).toBe(false);
  });
});
