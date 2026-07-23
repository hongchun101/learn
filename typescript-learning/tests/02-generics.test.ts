import { describe, it, expect } from 'vitest';
import {
  box,
  get,
  pick,
  tuple,
  userId,
  orderId,
} from '../src/02-generics/index.js';
import type { UserId, OrderId } from '../src/02-generics/index.js';

describe('Module 2: Generics', () => {
  it('pick returns a sub-object', () => {
    const result = pick({ a: 1, b: 'two', c: true }, ['a', 'c']);
    expect(result).toEqual({ a: 1, c: true });
  });

  it('get returns the property value', () => {
    const o = { x: 1, y: 'z' } as const;
    expect(get(o, 'x')).toBe(1);
    expect(get(o, 'y')).toBe('z');
  });

  it('box wraps a value', () => {
    const b = box(42);
    expect(b.value).toBe(42);
  });

  it('tuple infers tuple type', () => {
    const t = tuple(1, 'a', true);
    expect(t).toEqual([1, 'a', true]);
    // 元组类型：每个元素根据其位置被单独定型。
    const _t: readonly [number, string, boolean] = t;
    expect(_t).toEqual([1, 'a', true]);
  });

  it('phantom types are nominally distinct', () => {
    const u: UserId = userId('u_1');
    const o: OrderId = orderId('o_1');
    expect(typeof u).toBe('string');
    expect(typeof o).toBe('string');
    // 编译期检查：取消注释下面这一行将会触发类型错误。
    const _checkPhantom: UserId = userId('u_2');
    expect(_checkPhantom).toBe('u_2');
  });

});
