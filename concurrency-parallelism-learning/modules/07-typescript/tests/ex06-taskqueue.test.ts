import { describe, it, expect } from 'vitest';
import {
  taskQueue,
  workers,
  type UnpackPromises,
} from '../src/ch01-types/task-queue.js';

describe('ex06-taskqueue: UnpackPromises<P> and taskQueue', () => {
  it('flattens nested Promises via UnpackPromises', () => {
    type Flat = UnpackPromises<readonly [Promise<Promise<number>>, Promise<string>, boolean]>;
    const f: Flat = [42, 'hi', true];
    expect(f[0]).toBe(42);
    expect(f[1]).toBe('hi');
    expect(f[2]).toBe(true);
  });

  it('runs two workers concurrently and preserves declaration order', async () => {
    const w = workers<readonly [Promise<string>, Promise<number>]>(
      async () => {
        await Promise.resolve();
        return 'first';
      },
      async () => {
        await Promise.resolve();
        return 2;
      },
    );
    const q = taskQueue<readonly [Promise<string>, Promise<number>]>(w);
    const result = await q();
    expect(result[0]).toBe('first');
    expect(result[1]).toBe(2);
  });

  it('handles deeply-nested Promise returns', async () => {
    type Nested = UnpackPromises<readonly [Promise<Promise<Promise<number>>>]>;
    const n: Nested = [99];
    expect(n[0]).toBe(99);
  });
});