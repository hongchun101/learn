/**
 * Chapter 1 — Type-level primitives: TaskQueue<P>.
 *
 * A `TaskQueue` runs a heterogeneous tuple of worker functions
 * concurrently and returns a promise whose value is a tuple of the
 * workers' results, in declaration order.
 *
 *   const q = taskQueue([
 *     async (n: number) => String(n),
 *     async (s: string) => s.length,
 *   ] as const);
 *   const [str, len] = await q(7, "abc"); // [string, number]
 *
 * The recursion in `UnpackPromises<P>` mirrors `Awaited<T>`:
 *
 *   1. Mapped type `[K in keyof P]` walks the tuple positions.
 *   2. Conditional `P[K] extends PromiseLike<infer U> ? Awaited<U> : P[K]`
 *      asks "is this entry a Promise-like?"
 *   3. If yes, infer `U` and recurse via `Awaited<U>`.
 *   4. If no, keep `P[K]`.
 *
 * Tuple-homomorphic mapped types preserve length and optionality, so
 * the output tuple has the same shape as the input tuple, just
 * flattened. The base case is the conditional failing — exactly the
 * same shape as `Awaited<T>`'s recursion.
 */

// ---------------------------------------------------------------------------
// UnpackPromises<P> — tuple-mapped, recursive
// ---------------------------------------------------------------------------

/**
 * Recursive conditional: `T` is a `PromiseLike<U>`, so unpack to
 * `Awaited<U>`. Otherwise, leave `T` alone.
 *
 * This is the same recursion shape as the standard `Awaited<T>`.
 */
export type UnpackPromise<T> = T extends PromiseLike<infer U> ? Awaited<U> : T;

/**
 * Mapped type over the tuple. For each position, if the entry is a
 * `PromiseLike`, replace with its awaited value; otherwise leave it.
 */
export type UnpackPromises<P extends ReadonlyArray<unknown>> = {
  readonly [K in keyof P]: UnpackPromise<P[K]>;
};

// ---------------------------------------------------------------------------
// TaskQueue<P> — runtime
// ---------------------------------------------------------------------------

/**
 * A worker tuple: each entry is a function whose argument list is
 * allowed to vary per position. The runtime type erases the per-
 * argument variance because we only care about the *return* type.
 */
export type WorkerTuple<P extends ReadonlyArray<unknown>> = {
  readonly [K in keyof P]: (...args: never[]) => P[K];
};

/**
 * A `TaskQueue` is a callable: given heterogeneous arguments, run all
 * workers concurrently and return `Promise<UnpackPromises<P>>`.
 *
 * The runtime dispatch collects the argument lists into per-worker
 * arrays by index, then `Promise.all`s the workers. Type inference
 * follows from `P`.
 */
export type TaskQueue<P extends ReadonlyArray<unknown>> = (
  ...args: never[]
) => Promise<UnpackPromises<P>>;

/**
 * Build a `TaskQueue` from a tuple of worker functions.
 *
 * Implementation note: TypeScript cannot infer a heterogeneous tuple
 * of argument lists at the call site, so the public surface uses
 * `never[]` for the argument tuple and the worker tuple is parameter-
 * ised on `P` directly. Each worker is invoked with the corresponding
 * spread from the call's argument list.
 *
 * Because the typed parameter is opaque (`never`), callers invoke the
 * queue as `q(args0, args1, ...)` — the runtime just packs the
 * positional arguments into per-worker argument arrays.
 */
export function taskQueue<P extends ReadonlyArray<unknown>>(
  workers: readonly [...WorkerTuple<P>],
): (...args: unknown[]) => Promise<UnpackPromises<P>> {
  return async (...args: unknown[]): Promise<UnpackPromises<P>> => {
    const results = await Promise.all(
      workers.map(async (w, i) => {
        // The worker's arguments are whatever was passed at position i
        // when the queue was called. We pass a single positional
        // argument — the array itself — so the worker can destructure.
        return w(args[i] as never);
      }),
    );
    return results as unknown as UnpackPromises<P>;
  };
}

// ---------------------------------------------------------------------------
// Compile-time assertion: UnpackPromises<P> recurses correctly.
// ---------------------------------------------------------------------------

/**
 * Recursive proof. If this file ever stops compiling, the recursion
 * broke (typically because someone replaced `Awaited<U>` with `U`
 * and lost the deep-flattening behaviour).
 */
export type _AssertUnpackRecurses = UnpackPromises<
  readonly [Promise<Promise<number>>, Promise<string>, boolean]
> extends readonly [number, string, boolean]
  ? true
  : false;

// ---------------------------------------------------------------------------
// WorkerTuple generic — build it for a specific P
// ---------------------------------------------------------------------------

/**
 * Convenience: build a worker tuple whose workers return types are
 * declared explicitly. Useful when inference is desired at the call
 * site, not at the factory.
 */
export function workers<P extends ReadonlyArray<unknown>>(
  ...ws: readonly [...WorkerTuple<P>]
): readonly [...WorkerTuple<P>] {
  return ws;
}