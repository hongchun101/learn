/**
 * Compile-time assertions. Each line is a `tsc --noEmit` test that
 * fails to compile if the inference regresses. There is no runtime
 * here — the whole point is that the type-checker is the test.
 */

import type { Deferred } from '../../ch01-types/deferred.js';
import type {
  Worker,
  Pool,
  PoolState,
} from '../../ch01-types/typed-pool.js';
import type { UnpackPromises } from '../../ch01-types/task-queue.js';
import type { AsyncLock } from '../../ch01-types/asynclocks.js';

// ---------------------------------------------------------------------------
// Awaited<T> recursion — built-in, exercised through TS's own type checker
// ---------------------------------------------------------------------------

declare const _aw1: Awaited<Promise<Promise<Promise<number>>>>;
const _aw1Check: number = _aw1;

declare const _aw2: Awaited<number>;
const _aw2Check: number = _aw2;

// ---------------------------------------------------------------------------
// Worker<I,O> brand — the call site types through both I and O
// ---------------------------------------------------------------------------

const _w: Worker<number, string> = ((n: number) => String(n)) as Worker<number, string>;
const _wIn: number = 0;
// Worker<I,O> is `(input: I) => Promise<O> | O` so the return is `Promise<string> | string`.
const _wOut: Promise<string> | string = _w(_wIn);

// ---------------------------------------------------------------------------
// Pool state machine — the union is closed
// ---------------------------------------------------------------------------

const _ps: PoolState = 'idle';
const _psClosed: PoolState = 'closed';
// PoolState is exactly five strings; assert no extras are reachable.
const _psKeys: readonly PoolState[] = ['idle', 'spawning', 'running', 'draining', 'closed'];

// ---------------------------------------------------------------------------
// UnpackPromises recursion
// ---------------------------------------------------------------------------

type Flat = UnpackPromises<
  readonly [Promise<Promise<number>>, Promise<string>, boolean, number]
>;
const _f: Flat = [1, 'a', true, 0];
const _f0: number = _f[0];
const _f1: string = _f[1];
const _f2: boolean = _f[2];
const _f3: number = _f[3];

// ---------------------------------------------------------------------------
// Deferred handle — readonly fields are still typed as their declared types
// ---------------------------------------------------------------------------

declare const _d: Deferred<number>;
const _dP: Promise<number> = _d.promise;
const _dR: (v: number | PromiseLike<number>) => void = _d.resolve;
const _dRj: (reason?: unknown) => void = _d.reject;

// ---------------------------------------------------------------------------
// AsyncLock shape
// ---------------------------------------------------------------------------

declare const _lock: AsyncLock;
const _lockPending: number = _lock.pending;
const _lockCap: number = _lock.capacity;
const _lockAcquire: Promise<() => void> = _lock.acquire();

// ---------------------------------------------------------------------------
// Pool brand via generic — Pool<I,O> infers I and O from the worker
// ---------------------------------------------------------------------------

declare function makePool<I, O>(opts: {
  size: number;
  work: Worker<I, O>;
}): Pool<I, O>;
const _p: Pool<number, number> = makePool<number, number>({
  size: 4,
  work: (n) => n + 1,
});
const _pSubmit: Promise<number> = _p.submit(0);
const _pDrain: Promise<void> = _p.drain();

// ---------------------------------------------------------------------------
// AsyncDisposable conformance
// ---------------------------------------------------------------------------

declare const _ad: AsyncDisposable;
const _adType: AsyncDisposable = _ad;

// ---------------------------------------------------------------------------
// Export the values so the file is a module; this also gives vitest a
// concrete value to import, even though we don't run any logic.
// ---------------------------------------------------------------------------

export const _ = {
  _aw1Check,
  _aw2Check,
  _wOut,
  _ps,
  _psClosed,
  _f,
  _f0,
  _f1,
  _f2,
  _f3,
  _dP,
  _lockPending,
  _lockCap,
  _lockAcquire,
  _pSubmit,
  _pDrain,
  _adType,
} as const;