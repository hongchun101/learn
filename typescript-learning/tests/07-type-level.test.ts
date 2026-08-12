import { describe, it, expectTypeOf } from 'vitest';
import type {
  Concat,
  Get,
  Head,
  Join,
  Last,
  Length,
  Reverse,
  Sort,
  Split,
  Tail,
  Zip,
  Dec,
} from '../src/07-type-level/index.js';
import type { Add, Inc, Sub } from '../src/07-type-level/index.js';

describe('Module 7: Type-Level Programming', () => {
  it('Head, Tail, Last, Length', () => {
    expectTypeOf<Head<[1, 2, 3]>>().toEqualTypeOf<1>();
    expectTypeOf<Tail<[1, 2, 3]>>().toEqualTypeOf<[2, 3]>();
    expectTypeOf<Last<[1, 2, 3]>>().toEqualTypeOf<3>();
    expectTypeOf<Length<[1, 2, 3, 4]>>().toEqualTypeOf<4>();
  });

  it('Concat and Reverse', () => {
    expectTypeOf<Concat<[1, 2], [3, 4]>>().toEqualTypeOf<[1, 2, 3, 4]>();
    expectTypeOf<Reverse<[1, 2, 3]>>().toEqualTypeOf<[3, 2, 1]>();
  });

  it('Zip pairs tuples', () => {
    expectTypeOf<Zip<[1, 2], ['a', 'b']>>().toEqualTypeOf<[[1, 'a'], [2, 'b']]>();
  });
  it('Arithmetic types', () => {
    expectTypeOf<Inc<4>>().toEqualTypeOf<5>();
    expectTypeOf<Dec<5>>().toEqualTypeOf<4>();
    expectTypeOf<Add<3, 4>>().toEqualTypeOf<7>();
    expectTypeOf<Sub<10, 3>>().toEqualTypeOf<7>();
    // 注意：Mul 没有导出，以保持公开 API 精简；
    // 其递归实现位于模块 7 内部。
  });

  it('Path navigation with Get', () => {
    interface Config {
      server: { host: string; port: number };
      db: { url: string };
    }
    expectTypeOf<Get<Config, 'server.host'>>().toEqualTypeOf<string>();
    expectTypeOf<Get<Config, 'server.port'>>().toEqualTypeOf<number>();
    expectTypeOf<Get<Config, 'db.url'>>().toEqualTypeOf<string>();
  });

  it('String split/join', () => {
    expectTypeOf<Split<'a-b-c', '-'>>().toEqualTypeOf<['a', 'b', 'c']>();
    expectTypeOf<Join<['x', 'y', 'z'], '-'>>().toEqualTypeOf<'x-y-z'>();
  });

  it('Type-level sort', () => {
    expectTypeOf<Sort<[3, 1, 2]>>().toEqualTypeOf<[1, 2, 3]>();
  });
});
