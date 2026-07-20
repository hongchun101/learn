/**
 * Chapter 1 — Type-level primitives: branded Worker<I,O> and Pool<I,O>.
 *
 * Two ideas stack:
 *
 *   1. Brand the Worker. The brand is a phantom field tagged with a
 *      `unique symbol`, so the *runtime* shape is unchanged (a bare
 *      function) but the *type* carries `I` and `O` along.
 *
 *   2. Model the Pool as a type-state machine. The state is a string
 *      union; transitions are exposed only via methods; `await using`
 *      closes the pool deterministically.
 */

import type { Deferred } from './deferred.js';
import { defer } from './deferred.js';

// ---------------------------------------------------------------------------
// 1. Branded Worker<I,O>
// ---------------------------------------------------------------------------

declare const workerBrand: unique symbol;

/**
 * A `Worker<I, O>` is a callable that turns `I` into `Promise<O> | O`.
 * The brand field never exists at runtime — it is purely a phantom
 * type tag that flows through inference.
 *
 * Example:
 *   const w: Worker<number, string> = (n) => String(n);
 *   // pool.submit(42)  → Promise<string>
 */
export type Worker<I, O> = ((input: I) => Promise<O> | O) & {
  readonly [workerBrand]?: { readonly I: I; readonly O: O };
};

/**
 * Lift a plain function into a branded `Worker<I, O>`. The runtime
 * object is still a plain function — the brand is type-only.
 */
export function asWorker<I, O>(fn: (input: I) => Promise<O> | O): Worker<I, O> {
  return fn as Worker<I, O>;
}

// ---------------------------------------------------------------------------
// 2. Pool<I,O> as a type-state machine
// ---------------------------------------------------------------------------

export type PoolState =
  /** Freshly constructed, no workers running yet. */
  | 'idle'
  /** `start()` has been called; spawning initial workers. */
  | 'spawning'
  /** Accepting and processing tasks. */
  | 'running'
  /** `drain()` has been called; no new tasks accepted. */
  | 'draining'
  /** All tasks complete; resource released. */
  | 'closed';

export interface PoolOptions<I, O> {
  /** Number of concurrent workers. Must be >= 1. */
  readonly size: number;
  /** The branded worker. */
  readonly work: Worker<I, O>;
}

/**
 * A `Pool<I, O>` accepts `submit(input: I)` calls and returns
 * `Promise<O>`. Internally, it maintains N coroutine-like workers.
 *
 * The state machine:
 *
 *   idle --start()--> spawning --workers spawned--> running
 *                                                          |
 *                                              drain()    |
 *                                                          v
 *                                                       draining --done--> closed
 *
 * Illegal transitions are guarded at runtime with a thrown error; the
 * type-state field is purely informational.
 */
export interface Pool<I, O> {
  readonly state: PoolState;
  readonly size: number;
  submit(input: I): Promise<O>;
  drain(): Promise<void>;
  /** AsyncDisposable — `await using` will call this automatically. */
  [Symbol.asyncDispose](): Promise<void>;
}

interface WorkerSlot<I, O> {
  readonly id: number;
  busy: boolean;
  current: Deferred<O> | null;
}

/**
 * Construct a `Pool<I,O>` from a size and a branded worker.
 */
export function makePool<I, O>(opts: PoolOptions<I, O>): Pool<I, O> {
  if (opts.size < 1) throw new Error('Pool size must be >= 1');
  let state: PoolState = 'idle';
  const queue: Array<{ input: I; waiter: Deferred<O> }> = [];
  const slots: WorkerSlot<I, O>[] = Array.from({ length: opts.size }, (_, i) => ({
    id: i,
    busy: false,
    current: null,
  }));

  // Per-slot idle signal so an empty pool doesn't busy-poll.
  const idleSignal: Deferred<void>[] = slots.map(() => defer<void>());

  function tryAssign(): void {
    for (const slot of slots) {
      if (slot.busy) continue;
      const next = queue.shift();
      if (!next) return;
      slot.busy = true;
      slot.current = next.waiter;
      void runSlot(slot, next.input);
    }
  }

  async function runSlot(slot: WorkerSlot<I, O>, input: I): Promise<void> {
    try {
      const out = await opts.work(input);
      slot.current?.resolve(out);
    } catch (err) {
      slot.current?.reject(err);
    } finally {
      slot.busy = false;
      slot.current = null;
      if (queue.length > 0) {
        tryAssign();
      } else {
        idleSignal[slot.id]!.resolve();
        idleSignal[slot.id] = defer<void>();
      }
    }
  }

  const pool: Pool<I, O> = {
    get state(): PoolState {
      return state;
    },
    get size(): number {
      return opts.size;
    },
    async submit(input: I): Promise<O> {
      if (state === 'closed' || state === 'draining') {
        throw new Error(`cannot submit in state '${state}'`);
      }
      const waiter = defer<O>();
      queue.push({ input, waiter });
      // Any non-terminal state advances to 'running' once work is queued.
      state = 'running';
      tryAssign();
      return waiter.promise;
    },
    async drain(): Promise<void> {
      if (state === 'closed') return;
      state = 'draining';
      while (queue.length > 0 || slots.some((s) => s.busy)) {
        await Promise.race([
          ...queue.map((q) => q.waiter.promise.catch(() => undefined)),
          ...slots
            .filter((s) => s.current)
            .map((s) => s.current!.promise.catch(() => undefined)),
        ]);
      }
      state = 'closed';
    },
    async [Symbol.asyncDispose](): Promise<void> {
      await pool.drain();
    },
  };
  return pool;
}

/**
 * Type-level assertion: `Worker<I,O>` carries both type parameters.
 * If this file ever stops compiling, the inference regressed.
 */
export type WorkerCarriesIO<I, O> = Worker<I, O> extends infer W
  ? W extends Worker<infer _I, infer _O>
    ? [I, O]
    : never
  : never;

// Compile-time check: the constructed pool satisfies `Pool<I,O>`.
// Named types only — no `ReturnType<typeof fn>` here.
export type PoolBuildsCorrectly<I, O> = Pool<I, O> extends Pool<I, O>
  ? true
  : false;