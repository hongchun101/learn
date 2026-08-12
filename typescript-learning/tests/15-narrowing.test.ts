import { describe, it, expect, expectTypeOf } from 'vitest';
import {
  assertTrue,
  assertUserId,
  compact,
  Counter,
  describeVehicle,
  dispatch,
  explain,
  firstChar,
  formatOrder,
  isFish,
  isNotNullish,
  isNotString,
  ListNode,
  makeUserId,
  move,
  NonEmptyListNode,
  NotFoundError,
  PermissionError,
  statusLabel,
  type AppEvent,
  type Brand,
  type OrderId,
  type UserId,
  type Vehicle,
} from '../src/15-narrowing/index.js';

describe('Module 15: Type Predicates, Assertion Functions & Branded Narrowing', () => {
  it('isFish narrows a Pet to a Fish', () => {
    const pet: Parameters<typeof isFish>[0] = { kind: 'fish', swim: () => 'splash' };
    if (isFish(pet)) expectTypeOf(pet.swim).toBeFunction();
    expect(move({ kind: 'fish', swim: () => 'splash' })).toBe('splash');
  });

  it('compact filters null and undefined via type predicate', () => {
    expect(compact([1, null, 2, undefined, 3])).toEqual([1, 2, 3]);
  });

  it('assertIsString narrows for the rest of the scope', () => {
    expect(firstChar('hello')).toBe('h');
    expect(() => firstChar(42)).toThrow();
  });

  it('assertTrue narrows without a type predicate', () => {
    const v: string | null = 'hi';
    assertTrue(v !== null);
    // v is now truthy — TS narrows it.
    expectTypeOf(v).not.toBeAny();
  });

  it('smart constructor and assertion produce UserIds', () => {
    expect(makeUserId('u_42')).toBe('u_42');
    expect(() => makeUserId('bad')).toThrow();
    expect(() => assertUserId('bad')).toThrow();
  });

  it('formatOrder asserts the runtime shape', () => {
    expect(formatOrder('u_1', 'o_99')).toBe('user=u_1, order=o_99');
  });

  it('dispatch is exhaustive', () => {
    const e1: AppEvent = { type: 'pageview', path: '/x' };
    const e2: AppEvent = { type: 'click', target: 'btn' };
    const e3: AppEvent = { type: 'purchase', sku: 'X', amount: 1 };
    expect(dispatch(e1)).toBe('view /x');
    expect(dispatch(e2)).toBe('clicked btn');
    expect(dispatch(e3)).toBe('bought X for 1');
  });

  it('in-narrowing discriminates Vehicle', () => {
    const car: Vehicle = { wheels: 4, engine: 'electric' };
    const boat: Vehicle = { sails: 2, hull: 'wood' };
    expect(describeVehicle(car)).toContain('electric');
    expect(describeVehicle(boat)).toContain('wood');
  });

  it('instanceof narrows custom errors', () => {
    const e = new NotFoundError('users/u1');
    expect(explain(e)).toBe('404: users/u1');
    expect(explain(new PermissionError('db'))).toBe('403: db');
    expect(explain(new Error('boom'))).toBe('error: boom');
    expect(explain('not an error')).toBe('unknown');
  });

  it('statusLabel handles the literal union exhaustively', () => {
    expect(statusLabel('idle')).toBe('...');
    expect(statusLabel('done')).toBe('OK');
  });

  it('Counter.inc uses this: parameter to pin receiver type', () => {
    const c = new Counter();
    expect(c.inc()).toBe(1);
    expect(c.inc(5)).toBe(6);
    // Unbind and call: with `this: Counter` the static type is preserved.
    const { inc } = c;
    expect(inc.call(c)).toBe(7);
  });

  it('ListNode.next type widens to non-null in NonEmptyListNode', () => {
    const n = new ListNode(1, new ListNode(2));
    const ne = NonEmptyListNode.from(n);
    expectTypeOf(ne.next).not.toBeNullable();
    expect(ne.value).toBe(1);
  });

  it('negative type predicate narrows away', () => {
    const x: unknown = 42;
    if (isNotString(x)) {
      // x is `Exclude<unknown, string>` — effectively `unknown & ~string`.
      expect(typeof x).toBe('number');
    }
  });

  it('branded types are nominally distinct at compile time', () => {
    const u: UserId = makeUserId('u_1');
    const _o: OrderId = 'o_1' as OrderId;
    expectTypeOf<UserId>().not.toEqualTypeOf<OrderId>();
    expectTypeOf<Brand<string, 'UserId'>>().toEqualTypeOf<UserId>();
    expect(u).toBe('u_1');
    void _o;
  });

  it('isNotNullish narrows an array of unions', () => {
    const arr: (number | null)[] = [1, null, 2];
    const result = arr.filter(isNotNullish);
    expectTypeOf(result).toEqualTypeOf<number[]>();
    expect(result).toEqual([1, 2]);
  });
});
