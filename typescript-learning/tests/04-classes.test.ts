import { describe, it, expect } from 'vitest';
import { Circle, Rectangle, Port, Container, Version } from '../src/04-classes/index.js';

describe('Module 4: Classes & OOP', () => {
  it('Circle area and perimeter', () => {
    const c = new Circle(2);
    expect(c.area()).toBeCloseTo(Math.PI * 4, 6);
    expect(c.perimeter()).toBeCloseTo(2 * Math.PI * 2, 6);
    expect(c.describe()).toContain('circle');
  });

  it('Rectangle area and perimeter', () => {
    const r = new Rectangle(3, 4);
    expect(r.area()).toBe(12);
    expect(r.perimeter()).toBe(14);
  });

  it('Port setter validates input', () => {
    expect(new Port(80).port).toBe(80);
    expect(() => new Port(-1)).toThrow();
    expect(() => new Port(70000)).toThrow();
  });

  it('Container is a generic iterable', () => {
    const c = new Container<number>();
    c.push(1).push(2).push(3);
    expect(c.size).toBe(3);
    expect([...c]).toEqual([1, 2, 3]);
    expect(c.filter((x) => x > 1)).toEqual([2, 3]);
  });

  it('Version compareTo returns sign', () => {
    expect(new Version(1, 0, 0).compareTo(new Version(1, 0, 1))).toBeLessThan(0);
    expect(new Version(2, 0, 0).compareTo(new Version(1, 9, 9))).toBeGreaterThan(0);
    expect(new Version(1, 0, 0).compareTo(new Version(1, 0, 0))).toBe(0);
  });
});
