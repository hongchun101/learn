import { describe, it, expect, expectTypeOf } from 'vitest';
import type {
  MyFirstArg,
  MyParameters,
  MyReturnType,
  ToArray,
  ToArrayNonDist} from '../src/14-overloads/index.js';
import {
  bindHandlers,
  parseUser,
  pick2,
  StringBuilder,
  TaggedBuilder,
  Timer,
  type UserV1,
  type UserV2,
} from '../src/14-overloads/index.js';

describe('Module 14: Overloads & Advanced Call Signatures', () => {
  it('parseUser overloads narrow by version', () => {
    const u1 = parseUser({ name: 'Ada' }, 1);
    const u2 = parseUser({ name: 'Ada', email: 'a@b' }, 2);
    expectTypeOf(u1).toEqualTypeOf<UserV1>();
    expectTypeOf(u2).toEqualTypeOf<UserV2>();
    expect(u1.version).toBe(1);
    expect(u2.version).toBe(2);
  });

  it('Timer constructor overloads select the right shape', () => {
    const a = new Timer({ ms: 1000 });
    const b = new Timer({ startTime: 123 });
    const c = new Timer({ initial: new Date(0) });
    expect(a.describe()).toContain('timer');
    expect(b.describe()).toContain('stopwatch');
    expect(c.describe()).toContain('clock');
  });

  it('this-typed methods preserve subclass type', () => {
    const sb = new StringBuilder();
    const tb = new TaggedBuilder();
    const r1 = sb.append('x');
    const r2 = tb.append('y');
    expectTypeOf(r1).toEqualTypeOf<StringBuilder>();
    expectTypeOf(r2).toEqualTypeOf<TaggedBuilder>();
  });

  it('bindHandlers uses ThisType<S> to type `this`', () => {
    const h = bindHandlers(
      { count: 5, user: { name: 'Ada', age: 36 } },
      {
        ping() {
          // `this` is the state object, not the handlers literal.
          return this.count;
        },
        setName(name: string) {
          this.user.name = name;
        },
        setAge(age: number) {
          this.user.age = age;
        },
      },
    );
    expect(h.ping()).toBe(5);
    h.setName('Lin');
    h.setAge(40);
  });

  it('pick2 preserves the key-value mapping', () => {
    const out = pick2({ a: 1, b: 'two', c: true }, 'a', 'c');
    expect(out).toEqual({ a: 1, c: true });
    expectTypeOf(out).toEqualTypeOf<{ a: number; c: boolean }>();
  });

  it('infer extracts Parameters, ReturnType, FirstArg', () => {
    type P = MyParameters<(a: string, b: number) => boolean>;
    type R = MyReturnType<() => number>;
    type F = MyFirstArg<(first: string, rest: number) => void>;
    expectTypeOf<P>().toEqualTypeOf<[string, number]>();
    expectTypeOf<R>().toEqualTypeOf<number>();
    expectTypeOf<F>().toEqualTypeOf<string>();
  });

  it('distributive conditional types distribute over unions', () => {
    expectTypeOf<ToArray<string | number>>().toEqualTypeOf<string[] | number[]>();
    expectTypeOf<ToArrayNonDist<string | number>>().toEqualTypeOf<(string | number)[]>();
  });
});
