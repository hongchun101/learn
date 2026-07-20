/*
 * ch06_coroutines / Ch06Coroutines.kt
 *
 * The Kotlin coroutines foundation. By the end of this file you
 * should be able to:
 *   - mark a function `suspend`
 *   - launch and runBlocking with confidence
 *   - reason about CoroutineScope, Job, and Dispatchers
 *   - use `async`/`await` for parallel composition
 *   - explain structured concurrency: parent cancellation, exception
 *     propagation, the "children complete before parent" rule
 *
 * Coroutines are the most important KMP-specific API. Every KMP
 * application uses them.
 */
@file:Suppress("unused", "UNUSED_VARIABLE")

package ch06_coroutines

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.cancel
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.supervisorScope
import kotlinx.coroutines.withContext
import kotlinx.coroutines.yield
import kotlin.coroutines.coroutineContext

// ---------------------------------------------------------------------------
// 1. `suspend` — a function that can pause
// ---------------------------------------------------------------------------
// Marking a function `suspend` lets it call other `suspend` functions
// and lets the compiler keep track of its resumption point. A
// `suspend` function can be called from a coroutine, from another
// `suspend` function, or from a `runBlocking { }` block.

suspend fun greet(name: String): String {
    delay(50)  // simulate a network call; doesn't block a thread
    return "Hello, $name"
}

// ---------------------------------------------------------------------------
// 2. `runBlocking` — the bridge from blocking to suspending
// ---------------------------------------------------------------------------
// `runBlocking` blocks the current thread until the coroutine body
// completes. Use it only at the entry point of an application or
// in tests. **Never in production code paths.**

fun blockingEntry(): String = runBlocking {
    greet("KMP")
}

// ---------------------------------------------------------------------------
// 3. `launch` and `Job` — fire and (maybe) forget
// ---------------------------------------------------------------------------
// `launch` returns a `Job`. The job is the unit of cancellation and
// the handle to wait for completion. The coroutine is a *child* of
// the scope; when the scope cancels, the child cancels.

fun fireAndJoin(): String = runBlocking {
    val job: Job = launch {
        delay(50)
        // do work
    }
    job.join()
    "done"
}

// ---------------------------------------------------------------------------
// 4. `async` / `await` — parallel composition
// ---------------------------------------------------------------------------
// `async` returns a `Deferred<T>` — a future. `await` blocks the
// current coroutine (without blocking the thread) until the deferred
// completes.

suspend fun loadUser(): String {
    delay(50)
    return "user"
}

suspend fun loadFeed(): String {
    delay(50)
    return "feed"
}

suspend fun loadDashboard(): Pair<String, String> = coroutineScope {
    val userDeferred: Deferred<String> = async { loadUser() }
    val feedDeferred: Deferred<String> = async { loadFeed() }
    userDeferred.await() to feedDeferred.await()
}

// ---------------------------------------------------------------------------
// 5. Dispatchers — which thread runs the coroutine
// ---------------------------------------------------------------------------
//   - Dispatchers.Default    — CPU-bound; backed by a pool of worker
//                              threads, size = number of cores
//   - Dispatchers.IO         — blocking I/O; pool grows on demand
//   - Dispatchers.Main       — UI thread (Android, iOS via GCD, JS
//                              event loop, Swing, etc.); only on targets
//                              that have a main thread
//   - Dispatchers.Unconfined — runs in the caller's frame until the
//                              first suspension; rare and tricky
//
// `withContext(dispatcher) { ... }` switches dispatchers for the block
// and returns its value.

suspend fun cpuBoundWork(): Long {
    return withContext(Dispatchers.Default) {
        // pretend to do CPU work
        (0..1_000_000).sumOf { it.toLong() }
    }
}

// ---------------------------------------------------------------------------
// 6. Structured concurrency
// ---------------------------------------------------------------------------
// A coroutine launched in a scope is a child of that scope. If the
// parent is cancelled, all children are cancelled. If any child fails,
// the parent is cancelled. This is what "structured" means: the
// children's lifetime is bounded by the parent's.

fun structuredExceptionPropagation(): String = runBlocking {
    try {
        coroutineScope {
            launch {
                delay(50)
                throw IllegalStateException("boom")
            }
            launch {
                delay(1000)
                // never reached — the failure of the sibling
                // cancels the scope.
            }
        }
        "no exception"
    } catch (e: IllegalStateException) {
        "caught: ${e.message}"
    }
}

// ---------------------------------------------------------------------------
// 7. `supervisorScope` — children can fail independently
// ---------------------------------------------------------------------------
// A supervisor scope's children do not cancel each other or the
// parent. Each child is independent; you decide per-child how to
// handle failure.

fun supervisorIndependent(): String = runBlocking {
    supervisorScope {
        launch {
            try {
                delay(50)
                throw IllegalStateException("boom")
            } catch (e: IllegalStateException) {
                // handle here; sibling is unaffected
            }
        }
        launch {
            delay(100)
            // runs to completion
        }
    }
    "supervised"
}

// ---------------------------------------------------------------------------
// 8. `SupervisorJob` — like supervisorScope but for an object scope
// ---------------------------------------------------------------------------

class MyService(scope: CoroutineScope) {
    private val scope = CoroutineScope(scope.coroutineContext + SupervisorJob())

    fun start() {
        scope.launch {
            try {
                delay(50)
                throw IllegalStateException("service boom")
            } catch (_: IllegalStateException) {}
        }
    }

    fun stop() {
        scope.cancel()
    }
}

// ---------------------------------------------------------------------------
// 9. Cancellation is cooperative
// ---------------------------------------------------------------------------
// A coroutine that does not check for cancellation will keep running
// after its parent cancels. `delay`, `yield`, and `ensureActive()` are
// the canonical cancellation points. CPU-bound loops must explicitly
// check `isActive` or call `yield()`.

suspend fun cancellable(): Int {
    var n = 0
    while (true) {
        yield()             // check for cancellation
        n += 1
        if (n > 1_000_000) break
    }
    return n
}

// ---------------------------------------------------------------------------
// 10. `GlobalScope` — the anti-pattern
// ---------------------------------------------------------------------------
// `GlobalScope.launch { ... }` creates a top-level coroutine with no
// parent. It will not be cancelled when the application or the
// surrounding scope ends. **Never use it in production.** Use a
// structured scope (a class with its own `CoroutineScope` or
// `coroutineScope { }` / `supervisorScope { }`).

fun globalScopeIsWrong(): String {
    val deferred = GlobalScope.async { greet("global") }   // BAD
    runBlocking { deferred.await() }                          // we still have to wait
    return "we used GlobalScope, please don't"
}

// ---------------------------------------------------------------------------
// 11. `coroutineContext` — the receiver of a coroutine
// ---------------------------------------------------------------------------
// `coroutineContext` is the bag of elements: `Job`, `Dispatcher`,
// `CoroutineName`, etc. You can read it inside a `suspend` function
// via `kotlin.coroutines.coroutineContext`.

suspend fun contextSnapshot(): String {
    val ctx = coroutineContext
    val name = ctx[Job]?.toString() ?: "no job"
    val dispatcher = ctx[kotlinx.coroutines.CoroutineDispatcher.Key]?.toString() ?: "default"
    return "name=$name dispatcher=$dispatcher"
}

// ---------------------------------------------------------------------------
// Tour
// ---------------------------------------------------------------------------

fun tourBlocking(): List<String> = runBlocking {
    val items = mutableListOf<String>()
    items += greet("KMP")
    items += fireAndJoin()
    items += loadDashboard().toString()
    items += cpuBoundWork().toString()
    items += structuredExceptionPropagation()
    items += supervisorIndependent()
    val svc = MyService(this)
    svc.start()
    delay(200)
    svc.stop()
    items += "service stopped"
    items += cancellable().toString()
    items += contextSnapshot()
    items
}
