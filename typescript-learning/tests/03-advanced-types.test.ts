import { describe, it, expect, expectTypeOf } from 'vitest';
import { Getters, Reverse, routes, ToPromise } from '../src/03-advanced-types/index.js';
import type { Json } from '../src/03-advanced-types/index.js';

describe('Module 3: Advanced Types', () => {
  it('Getters adds get-prefixed methods', () => {
    type G = Getters<{ name: string; age: number }>;
    expectTypeOf<G>().toHaveProperty('getName');
    expectTypeOf<G>().toHaveProperty('getAge');
  });

  it('Reverse reverses a tuple', () => {
    expectTypeOf<Reverse<[1, 2, 3]>>().toEqualTypeOf<[3, 2, 1]>();
    expectTypeOf<Reverse<[]>>().toEqualTypeOf<[]>();
  });

  it('routes satisfy the contract while keeping literals', () => {
    expect(routes.listUsers.path).toBe('/users');
    expect(routes.listUsers.method).toBe('GET');
    expectTypeOf(routes.listUsers.method).toEqualTypeOf<'GET'>();
  });

  it('ToPromise distributes over unions', () => {
    expectTypeOf<ToPromise<string | number>>().toEqualTypeOf<Promise<string> | Promise<number>>();
  });

  it('Json recursive type accepts JSON shapes', () => {
    const j: Json = { a: [1, 'x', null, { b: true }] };
    expect(JSON.stringify(j)).toBe('{"a":[1,"x",null,{"b":true}]}');
  });
});
