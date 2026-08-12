import { describe, it, expect, expectTypeOf } from 'vitest';
import {
  buildUrl,
  routes
} from '../src/03-advanced-types/index.js';
import type { Json ,
  ExtractParams,
  Getters,
  Reverse,
  RouteParam,
  RouteName,
  ToPromise} from '../src/03-advanced-types/index.js';

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

  it('template-literal DSL extracts path parameters', () => {
    expectTypeOf<ExtractParams<'/users/:id/posts/:postId'>>().toEqualTypeOf<{ id: string; postId: string }>();
    expectTypeOf<ExtractParams<'/health'>>().toEqualTypeOf<Record<never, never>>();
    expectTypeOf<RouteName<'hello'>>().toEqualTypeOf<'Hello'>();
    expectTypeOf<RouteParam<':id'>>().toEqualTypeOf<'id'>();
    expectTypeOf<RouteParam<'*'>>().toEqualTypeOf<'wildcard'>();
    const u = buildUrl('/users/:id/posts/:postId', { id: '1', postId: '2' });
    expect(u).toBe('/users/1/posts/2');
  });
});
