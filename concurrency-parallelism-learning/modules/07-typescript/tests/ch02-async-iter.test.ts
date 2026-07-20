import { describe, it, expect } from 'vitest';
import {
  asyncMap,
  asyncFilter,
  asyncMerge,
  asyncZip,
  collect,
  asyncTap,
} from '../src/ch02-asynciter/operators.js';

async function* fromArray<T>(xs: T[]): AsyncGenerator<T, void, undefined> {
  for (const x of xs) yield x;
}

describe('ch02-async-iter: operators', () => {
  it('asyncMap applies fn to every item', async () => {
    const src = fromArray([1, 2, 3]);
    const out = await collect(asyncMap(src, (x) => x * 10));
    expect(out).toEqual([10, 20, 30]);
  });

  it('asyncFilter keeps items for which pred is truthy', async () => {
    const src = fromArray([1, 2, 3, 4, 5]);
    const out = await collect(asyncFilter(src, (x) => x % 2 === 1));
    expect(out).toEqual([1, 3, 5]);
  });

  it('asyncFilter supports async predicates', async () => {
    const src = fromArray([1, 2, 3]);
    const out = await collect(
      asyncFilter(src, async (x) => {
        await Promise.resolve();
        return x > 1;
      }),
    );
    expect(out).toEqual([2, 3]);
  });

  it('asyncMerge combines multiple sources', async () => {
    const a = fromArray([1, 2, 3]);
    const b = fromArray([10, 20, 30]);
    const out = await collect(asyncMerge(a, b));
    expect(out.sort((x, y) => x - y)).toEqual([1, 2, 3, 10, 20, 30]);
  });

  it('asyncZip pairs items until the shorter source ends', async () => {
    const a = fromArray([1, 2, 3, 4]);
    const b = fromArray(['a', 'b']);
    const out = await collect(asyncZip(a, b));
    expect(out).toEqual([
      [1, 'a'],
      [2, 'b'],
    ]);
  });

  it('asyncTap passes through the original value', async () => {
    const src = fromArray([1, 2, 3]);
    const seen: number[] = [];
    const out = await collect(asyncTap(src, (x) => void seen.push(x)));
    expect(out).toEqual([1, 2, 3]);
    expect(seen).toEqual([1, 2, 3]);
  });
});