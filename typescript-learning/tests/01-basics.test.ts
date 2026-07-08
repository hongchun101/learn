import { describe, it, expect } from 'vitest';
import {
  area,
  assertNever,
  err,
  isUser,
  handleEvent,
  map,
  ok,
  unwrap,
} from '../src/01-basics/index.js';

describe('Module 1: Type System Fundamentals', () => {
  it('area() computes shape area', () => {
    expect(area({ kind: 'circle', radius: 2 })).toBeCloseTo(Math.PI * 4, 6);
    expect(area({ kind: 'rect', width: 3, height: 4 })).toBe(12);
    expect(area({ kind: 'triangle', base: 6, height: 4 })).toBe(12);
  });

  it('Result helpers', () => {
    const a = ok(7);
    expect(a.ok).toBe(true);
    if (a.ok) expect(a.value).toBe(7);
    const b = err('x');
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.error).toBe('x');
  });

  it('unwrap() throws on err', () => {
    expect(() => unwrap(err('boom'))).toThrow('boom');
    expect(unwrap(ok(42))).toBe(42);
  });

  it('map() over Result', () => {
    const r = map(ok(2), (x) => x * 10);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(20);

    const e = map(err('nope') as ReturnType<typeof ok<number>>, (x) => x);
    expect(e.ok).toBe(false);
  });

  it('isUser is a type guard', () => {
    expect(isUser({ id: 'u1', email: 'a@b', role: 'admin' })).toBe(true);
    expect(isUser(null)).toBe(false);
    expect(isUser({})).toBe(false);
    expect(isUser({ id: 1, email: 'a@b', role: 'admin' })).toBe(false);
  });

  it('handleEvent narrows by `in`', () => {
    expect(handleEvent({ type: 'purchase', userId: 'u1', sku: 'X', amount: 1 })).toContain('X');
    expect(handleEvent({ type: 'login', userId: 'u1' })).toBe('auth event: login');
  });

  it('assertNever is callable at runtime', () => {
    expect(() => assertNever('x' as never)).toThrow();
  });
});
