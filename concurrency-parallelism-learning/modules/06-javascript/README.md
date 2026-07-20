# JavaScript Concurrency & Parallelism (Node 24, ES Modules)

This module is the JavaScript arm of the cross-language concurrency curriculum.
It uses **plain Node 24 JavaScript** under ES modules — no TypeScript, no
runtime libraries beyond the Node/Web standard library. Every script is
runnable, every file is self-contained, every pattern is verified by Vitest
against the same cross-language contract that `src/cross-lang/contracts.ts`
publishes.

```
06-javascript/
├── package.json           type: module, vitest/tsx/typescript devDeps
├── vitest.config.js       scoped to tests/**/*.test.js
├── tsconfig.json          JS-friendly settings for editor type checking
├── README.md              this paper
├── src/
│   ├── ch01-eventloop/    event loop, queues, rAF, rIC, structuredClone
│   ├── ch02-workers/      Worker pool, SharedArrayBuffer parallel reduce
│   ├── ch03-atomics/      mutex, seq-lock, Atomics.wait/notify/wake
│   ├── ch04-streams/      Readable, Transform, backpressure
│   ├── ch05-abort/        AbortController, AbortSignal.any, cancellation
│   └── ch06-patterns/     all six canonical patterns, local impls
└── tests/
    └── ch06.test.js       seven cross-language scenarios
```

## How to run

```bash
cd modules/06-javascript
npm install              # installs vitest/tsx/typescript locally
npm test                 # runs tests/ch06.test.js (seven scenarios)
node src/ch01-eventloop/run.js   # observable ordering proof
node src/ch06-patterns/index.js  # all six patterns demo
```

> **Note on tests.** The assignment forbids `setTimeout` for *test*
> synchronization (use `Promise.withResolvers`). Implementation code that
> genuinely needs a timer — token bucket pacing, AbortSignal timeouts,
> `requestIdleCallback` polyfill, etc. — uses real timers; that is correct
> and expected.

---

## 1. Mental model

JavaScript has **one thread of execution per [agent]** plus the structured
cooperative scheduling surface that hangs off it. The mental model is not
"callbacks and promises"; it is a queue graph with five named lanes and a
strict set of rules for who drains which lane when.

### 1.1 The five lanes

1. **Script / synchronous code** — the executing task. Always runs to
   completion before the runtime looks at anything else.
2. **Microtask queue** — drained after every task boundary. Contains the
   reactions of `Promise`, `queueMicrotask`, and `MutationObserver` callbacks.
3. **Task queue (a.k.a. macrotask queue)** — one FIFO per task source. The
   browser keeps separate queues for `setTimeout`, `setInterval`,
   `MessageChannel`, I/O, etc.; the runtime picks the oldest *runnable*
   task across them. In Node, the analog is the libuv phases.
4. **Animation frame queue** — `requestAnimationFrame` callbacks, drained
   before the next paint.
5. **Idle queue** — `requestIdleCallback` callbacks, drained when the
   runtime has spare time before the next frame's deadline.

The "single threaded" cliché is only true of lane 1. Coordination is done by
**queueing**, not by locking.

### 1.2 The agent model

An *agent* is a unit that has its own heap, its own set of the five lanes,
and its own event loop. A `Worker` is a separate agent. A `SharedArrayBuffer`
is the *only* object that two agents can address by reference; everything
else is copied via structured clone.

### 1.3 Cross-agent wakeup vocabulary (Node 24)

| Term             | Where it lives      | What it wakes                          |
| ---------------- | ------------------- | -------------------------------------- |
| `Atomics.wait`   | Worker thread       | blocks the calling thread              |
| `Atomics.notify` | Any thread          | wakes threads in `Atomics.wait`        |
| `Atomics.waitAsync` | Worker thread    | returns a Promise resolved on wakeup   |
| `postMessage`    | `MessagePort`       | schedules a task on the receiving agent|
| `BroadcastChannel` | Same-origin agents| schedules a task on every subscriber   |
| `SharedArrayBuffer` + `Atomics` | shared memory | the *only* way to avoid a copy         |

> **Terminology gotcha.** "Notify" is a *Threading Building Blocks / Web*
> term — wake exactly one waiter. "Wake" is the *Linux futex* term — wake
> one or many. They are the same operation in JavaScript: `Atomics.notify`
> wakes one or many waiters, and the count is an explicit argument. The
> document picks "notify" to match the spec, and explains "wake" when the
> underlying futex semantics matter.

---

## 2. Primitives (the library that ships with Node 24)

### 2.1 The event loop, queue graph, and ordering

The visible behavior of a Node script is the interleaving of the five lanes
above. Three rules dominate:

* **Microtasks drain fully** after every task boundary. A single
  `Promise.resolve().then` will run before any new task — even a `setTimeout
  (_, 0)`.
* **Tasks are picked one at a time** from the runnable set. They do *not*
  preempt each other; a long synchronous task blocks everything else.
* **`await` is one microtask hop.** An `await x` schedules a microtask that
  resumes the function *after* `x` settles; it is not "synchronous on the
  same tick".

`src/ch01-eventloop/run.js` prints the ordering proof you can run:

```bash
node src/ch01-eventloop/run.js
```

Expected output (the runnable script asserts it):

```
script:start
script:end
microtask:1
microtask:2
task:setImmediate
task:setTimeout(0)
```

### 2.2 `requestAnimationFrame` and `requestIdleCallback`

`rAF` is for paint-bound work; it fires just before the next compositor
pass. `requestIdleCallback` is for everything else — scheduling telemetry,
prefetching the next chunk, GC hinting. In Node 24 there is no built-in
`requestIdleCallback`; the polyfill in `src/ch01-eventloop/trace-events.js`
uses `setImmediate` and an "idle budget" argument, which is exactly the
shape a browser `IdleDeadline` provides.

### 2.3 `Atomics.wait`, `Atomics.notify`, `Atomics.waitAsync`

These are the only blocking / waking primitives in the platform. They
operate on `Int32Array` cells and require the backing buffer to be a
`SharedArrayBuffer`. `Atomics.wait` blocks the calling *thread* (so it is
useless on the main thread and only legal in a `Worker`). `Atomics.waitAsync`
returns a Promise and is safe on the main thread.

`Atomics.notify(view, index, count)` wakes up to `count` waiters; pass
`Infinity` to wake them all.

### 2.4 `SharedArrayBuffer`

`SharedArrayBuffer` is the **only** shared-memory primitive. It is *not* a
typed array — it is a buffer of raw bytes. You wrap it in a
`Int32Array`/`Float64Array`/etc. to get a view, and that view is what
`Atomics` operates on. Both agents must agree on the layout (a shared
"schema" file is the usual approach).

### 2.5 `MessageChannel`

A `MessageChannel` gives you two `MessagePort` endpoints. `port1.postMessage`
queues a task on `port2`'s agent. The interesting property is that **the
task is queued even if the receiver is busy**, so you can use it as a
"yield to the next microtask" primitive — it's how the scheduler polyfill
in chapter 1 actually schedules idle work.

### 2.6 `structuredClone`

`structuredClone(value, { transfer })` makes a deep, recursive copy of any
clonable value. It is the same algorithm `postMessage` uses, but exposed as
a synchronous, in-agent operation. The optional `{ transfer }` argument
*moves* (neuters) transferable objects — `ArrayBuffer`, `MessagePort`,
`ReadableStream`, `WritableStream`, `TransformStream`, `VideoFrame` — into
the clone, which is how large buffers cross the worker boundary without a
copy.

### 2.7 `AbortController` and `AbortSignal`

`AbortController` is a cancel token. `controller.signal` is a read-only
`AbortSignal`; calling `controller.abort(reason)` transitions it to the
aborted state and emits an `'abort'` event with `reason` as `event.reason`.
Once aborted, a signal stays aborted.

`AbortSignal.any([a, b, c])` returns a signal that aborts as soon as *any*
of the inputs does. `AbortSignal.timeout(ms)` returns a signal that aborts
after a delay. `AbortSignal.abort(reason)` returns a pre-aborted signal.

Cancellation primitives that respect the signal contract:

* `fetch(input, { signal })`
* `setTimeout` / `setInterval` (Node ≥ 16)
* `EventTarget` (Node ≥ 16)
* `events.on(emitter, event, { signal })`
* `stream.Readable` (the `signal` option in `.read` was the old API; the
  modern way is to abort the source's signal and let the stream tear down)

### 2.8 `Worker`

`new Worker(url, { type: 'module' })` spins up a fresh agent in a separate
event loop, separate heap, separate V8 isolate. Communication is *only* via
`postMessage` (copy via structured clone) or via shared memory (SAB +
Atomics). There is no shared state, no shared closures, no shared
`globalThis`.

The `worker_threads` module in Node is the same model but in-process.
Cross-thread `Atomics` still work because the SAB is shared. Cross-thread
`postMessage` is a structured-clone copy inside one OS process; useful for
CPU-bound parallelism without the cost of an isolate.

### 2.9 `BroadcastChannel`

`BroadcastChannel(name)` is the one-to-many pubsub primitive. Every agent
in the same origin can subscribe; `bc.postMessage(x)` schedules a `'message'`
task on every listener. There is **no** backpressure, **no** delivery
guarantee — the channel is fire-and-forget, and the message is lost if the
listener is busy when you post and never drains its queue.

---

## 3. Patterns

These are the six patterns the cross-language contract specifies. Every
implementation here is the **JS-idiomatic** version, written from scratch
with Node/Web APIs only. The order they appear is the order the tests run
them in.

### 3.1 Ordered fan-out / fan-in (`src/ch06-patterns/fanout.js`)

A worker pool of size P drains an input array, producing one output per
input. The contract is that **outputs are returned in input order** even
when individual workers finish out of order. The implementation does *not*
use `Promise.all` to gather the pool — that would deadlock when P < N if
the pool were blocking. Instead:

1. A shared `next` counter hands out indices.
2. Each worker loop is `for (;;) { const i = next++; if (i >= N) return; … }`.
3. Each worker writes to `out[i]`; order is preserved by index, not by
   completion.
4. The caller `await Promise.all(runners)` is fine because none of the
   runners depends on another; the algorithm is in the *fetching*, not the
   *joining*.

### 3.2 N-stage pipeline (`src/ch06-patterns/pipeline.js`)

Each element flows through every stage in order. Each stage is either a
sync function or a Promise-returning function; the implementation just
`await`s each. The contract is order-preserving, so a simple `for` loop is
correct.

### 3.3 Token-bucket rate limit (`src/ch06-patterns/rate.js`)

Classic token bucket: at any wall-clock moment, you may produce if a token
is available; tokens refill at `ratePerSec` per second. The implementation
records `nextAllowed = max(now, nextAllowed + intervalMs)` on each produce.
The reference test uses a fake clock (`vi.useFakeTimers()`) and accepts
`[rate*seconds - 1, rate*seconds + 2]` to allow for clock granularity.

### 3.4 N-party barrier (`src/ch06-patterns/barrier.js`)

A one-shot barrier: every `arriveAndWait()` blocks until exactly `parties`
calls have been made, then all are released and the barrier is reset. The
implementation keeps a list of pending resolvers; the Nth arrival drains
them all. `Promise.withResolvers()` is the synchronization primitive —
no `setTimeout`.

### 3.5 Bounded MPMC queue (`src/ch06-patterns/mpmc.js`)

Circular buffer + single-mutex spin. Producers and consumers are symmetric
("MPMC"). The contract adds two twists on top of the bare queue:

* `dequeue(timeoutMs)` resolves with `undefined` if the wait times out.
* `close()` releases every blocked waiter with `undefined`.

The implementation does **not** use SAB or `Atomics.wait` — the queue is
in-process, so the lighter "resolve the next microtask" path is correct.
For an inter-agent MPMC, you would swap the mutex for an `Atomics.compareExchange`
spin and the wait for `Atomics.wait`/`notify`.

### 3.6 Parallel reduction (`src/ch06-patterns/reduce.js`)

Split the inputs into P contiguous chunks (round-robin by index modulo P so
each chunk is the same size), reduce each chunk sequentially, then
left-fold the partials. The contract is that the result equals
`inputs.reduce(combine)` for any associative `combine`. For a non-associative
op the result is undefined and the test does not run.

---

## 4. Exercises

Each exercise is one chapter's `demo` script.

| # | Command                                       | What you should see                            |
| - | --------------------------------------------- | ---------------------------------------------- |
| 1 | `node src/ch01-eventloop/run.js`              | The 5-line ordering proof                      |
| 2 | `node src/ch01-eventloop/trace-events.js`     | rAF, rIC, MessageChannel, structuredClone demo |
| 3 | `node src/ch02-workers/worker_pool.js`        | 8 workers × 32 jobs, ordering preserved        |
| 4 | `node src/ch02-workers/shared_array_buffer.js`| 4-worker parallel sum via SAB + Atomics        |
| 5 | `node src/ch03-atomics/lock.js`               | Mutex uncontended/contended timings            |
| 6 | `node src/ch03-atomics/seq_lock.js`           | Reader/writer protocol demonstration           |
| 7 | `node src/ch03-atomics/wait_notify.js`        | Producer/consumer wakeups                      |
| 8 | `node src/ch04-streams/readable.js`           | Custom Readable pushing 1000 items             |
| 9 | `node src/ch04-streams/transform.js`          | `Transform` doubling numbers                   |
| 10| `node src/ch04-streams/backpressure.js`       | Slow consumer pulling fast producer            |
| 11| `node src/ch05-abort/cancel.js`               | Fetch / timer / stream cancellation proof      |
| 12| `node src/ch06-patterns/index.js`             | All six patterns, in order                     |

### 4.1 Walkthrough: the ordering proof in chapter 1

Look at `src/ch01-eventloop/run.js`. The interesting thing is the
"microtask × 2 vs setTimeout 0" race. The expected trace is:

```
script:start
script:end
microtask:1
microtask:2
task:setImmediate
task:setTimeout(0)
```

Why? The script body runs to completion. Then the runtime drains every
microtask in order — that fires our two `then` callbacks. Then it picks a
task; on Node 24 `setImmediate` is queued before `setTimeout(0)` because
the timer hasn't fired yet, so the immediate wins. The output is stable
across Node versions ≥ 18.

### 4.2 Walkthrough: the SAB reduction in chapter 2

`src/ch02-workers/shared_array_buffer.js` does the canonical parallel-sum
demo. The interesting design decisions:

* The **layout** is one `Float64Array` of length `N + P + 1`. Indices
  `[0, N)` are per-worker partials, `[N, N+P)` are per-worker "done"
  flags (Int32 view), `[N+P]` is the global "all done" flag.
* Workers `Atomics.wait` on their own done flag and on the global flag.
  The main thread `Atomics.notify`s in the right order.
* Output is deterministic and order-stable.

### 4.3 Walkthrough: cancel everything in chapter 5

`src/ch05-abort/cancel.js` demonstrates the three real-world cancellation
patterns:

1. **Fetch cancellation** — `AbortController` + `fetch({ signal })`.
   Aborting closes the underlying socket.
2. **Timer cancellation** — `setTimeout` returns a `Timeout` with an
   `.unref()` and accepts `{ signal }`.
3. **Stream cancellation** — destroying the source propagates `'error'`
   events on the destination.

`AbortSignal.any([timeout, user])` is the production pattern: any one
cancellation wins.

---

## 5. What an expert can do after this module

You should be able to:

- Trace any JavaScript scheduling question through the five-lane queue graph
  and predict the observable ordering without running the code.
- Explain the difference between microtasks, tasks (macrotasks), animation
  frames, and idle callbacks, and choose the right one for "yield to the
  browser / runtime".
- Decide between `postMessage`, `SharedArrayBuffer + Atomics`, and
  `BroadcastChannel` for a given cross-agent communication need, including
  the cost model (copy, share, broadcast) for each.
- Use `Promise.withResolvers()` as a first-class synchronization primitive
  for in-agent coordination, never reaching for `setTimeout` to "wait for
  something".
- Use `Atomics.wait` / `Atomics.waitAsync` / `Atomics.notify` correctly,
  including when to use the async variant on the main thread, and how
  `count` controls fan-out.
- Design a worker pool that respects a `parallelism` budget and never
  deadlocks, without using `Promise.all` as the join primitive.
- Build an ordered fan-out / fan-in, an N-stage pipeline, a token-bucket
  rate limiter, an N-party barrier, a bounded MPMC queue with timeout
  dequeue and close, and a parallel reduction, all using only Node/Web
  primitives.
- Compose `AbortSignal.any([timeout, user])` to cancel a fetch, a timer,
  and a stream in one call.
- Justify every API choice with one of: "faster than copying", "doesn't
  block the agent", "doesn't deadlock under backpressure", or "composes
  with `AbortSignal`".