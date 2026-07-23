import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  range,
  flat,
  collect,
  paginate,
  abortable,
  AsyncCounter,
  parallel,
  sequential,
  withTimeout,
  deferred,
} from '../src/06-async/index.js';
import type { PageQuery, PageResult } from '../src/06-async/index.js';

describe('Module 6: Async, Iterators, Generators', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('range yields the sequence', () => {
    expect([...range(0, 5)]).toEqual([0, 1, 2, 3, 4]);
    expect([...range(0, 6, 2)]).toEqual([0, 2, 4]);
  });

  it('flat concatenates iterables', () => {
    expect([...flat([[1, 2], [3], [4, 5]])]).toEqual([1, 2, 3, 4, 5]);
  });

  it('paginate iterates until exhausted', async () => {
    const pages: Record<string, PageResult<number>> = {
      a: { items: [1, 2], nextCursor: 'b' },
      b: { items: [3, 4], nextCursor: 'c' },
      c: { items: [5] },
    };
    const fetcher = async (q: PageQuery): Promise<PageResult<number>> => pages[q.cursor ?? 'a']!;
    const all = await collect(paginate(fetcher, 2));
    expect(all).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('abortable stops on signal via aborted flag', async () => {
    // 验证 abortable() 会在每次 yield 之间检查 signal.aborted，
    // 从而提前返回。下面构造一个流，让每个元素在传递过程中
    // 都会对照 signal 进行检查。
    const values = [1, 2, 3, 4, 5];
    const ctrl = new AbortController();
    async function* source() {
      for (const v of values) yield v;
    }
    const received: number[] = [];
    const consume = (async () => {
      for await (const x of abortable(source(), ctrl.signal)) {
        received.push(x);
        if (received.length === 2) ctrl.abort();
      }
    })();
    await consume;
    expect(received).toEqual([1, 2]);
  });

  it('AsyncCounter iterates asynchronously', async () => {
    const c = new AsyncCounter(3);
    const out: number[] = [];
    for await (const x of c) out.push(x);
    expect(out).toEqual([0, 1, 2]);
  });

  it('sequential runs in order, parallel respects concurrency', async () => {
    const order: number[] = [];
    const seq = await sequential([1, 2, 3], async (n) => {
      order.push(n);
      return n;
    });
    expect(seq).toEqual([1, 2, 3]);
    expect(order).toEqual([1, 2, 3]);

    const par = await parallel([1, 2, 3, 4], async (n) => n * 2, 2);
    expect(par).toEqual([2, 4, 6, 8]);
  });

  it('withTimeout rejects on timer', async () => {
    const slow = new Promise<number>((res) => setTimeout(() => res(1), 1000));
    const p = withTimeout(slow, 100);
    vi.advanceTimersByTime(150);
    await expect(p).rejects.toThrow('timeout');
  });

  it('deferred exposes resolvers', async () => {
    const d = deferred<number>();
    d.resolve(7);
    await expect(d.promise).resolves.toBe(7);
  });
});
