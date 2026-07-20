/*
 * ch08_concurrency / Ch08Concurrency.kt
 *
 * The structured-concurrency toolkit: Mutex, Semaphore, Channel,
 * select, and the actor pattern. These are the primitives that turn
 * "I can use coroutines" into "I can design a concurrent system".
 */
@file:Suppress("unused", "UNUSED_VARIABLE")

package ch08_concurrency

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.channels.SendChannel
import kotlinx.coroutines.channels.actor
import kotlinx.coroutines.channels.consumeEach
import kotlinx.coroutines.channels.produce
import kotlinx.coroutines.channels.toList
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.selects.onTimeout
import kotlinx.coroutines.selects.select
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.yield
import java.util.concurrent.atomic.AtomicInteger

// ---------------------------------------------------------------------------
// 1. Mutex — coroutine-aware mutual exclusion
// ---------------------------------------------------------------------------
// Use `Mutex` to protect a critical section. The lock is acquired
// without blocking the underlying thread — a waiting coroutine is
// suspended.

class Counter {
    private val mutex = Mutex()
    private var n = 0

    suspend fun inc(): Int = mutex.withLock {
        n += 1
        n
    }

    suspend fun get(): Int = mutex.withLock { n }
}

// ---------------------------------------------------------------------------
// 2. Semaphore — bounded concurrency
// ---------------------------------------------------------------------------
// Use `Semaphore(permits)` to limit the number of concurrent
// operations. A semaphore with one permit is functionally a Mutex,
// but the `acquire`/`release` pair is more flexible.

class ConcurrencyLimiter(permits: Int) {
    private val sem = Semaphore(permits)

    suspend fun <T> run(block: suspend () -> T): T {
        sem.acquire()
        try {
            return block()
        } finally {
            sem.release()
        }
    }
}

// ---------------------------------------------------------------------------
// 3. Channel — coroutine-aware queue
// ---------------------------------------------------------------------------
// A `Channel<E>` is a hot, blocking queue. Producers `send`; consumers
// `receive`. Configurations:
//   - Channel()                  — rendezvous: send suspends until receive
//   - Channel(Channel.UNLIMITED) — unlimited buffer; send never suspends
//   - Channel(Channel.BUFFERED)  — default JVM buffer (64)
//   - Channel(n)                 — bounded buffer of n
//
// `close()` makes the channel "done"; receivers get null and the
// iteration ends.

suspend fun channelPipeline(): List<Int> {
    val ch = Channel<Int>(Channel.UNLIMITED)
    // Producer
    val producer = launch {
        for (n in 1..5) ch.send(n)
        ch.close()
    }
    val out = mutableListOf<Int>()
    // Consumer
    for (x in ch) out.add(x)
    producer.join()
    return out
}

// ---------------------------------------------------------------------------
// 4. `produce` / `actor` — coroutine-flavoured Channel wrappers
// ---------------------------------------------------------------------------
// `produce { ... }` returns a `ReceiveChannel<E>`. The producer
// coroutine is automatically cancelled when the channel is closed.
// `actor { ... }` is a coroutine that owns a mailbox.

fun CoroutineScope.numbers(): kotlinx.coroutines.channels.ReceiveChannel<Int> = produce {
    for (n in 1..3) {
        send(n)
        delay(10)
    }
}

// ---------------------------------------------------------------------------
// 5. select — wait on multiple suspending operations
// ---------------------------------------------------------------------------
// `select` lets a coroutine wait on the first of several suspending
// operations. Use it for "the first response wins" patterns.

suspend fun firstResponse(a: suspend () -> String, b: suspend () -> String): String =
    select<String> {
        async { a() }.onAwait { it }
        async { b() }.onAwait { it }
        onTimeout(1_000) { "timeout" }
    }

// ---------------------------------------------------------------------------
// 6. Structured concurrency: parent -> children
// ---------------------------------------------------------------------------
// Every coroutine launched in a scope is a child of the scope. When
// the scope is cancelled, all children are cancelled. When a child
// fails, the parent is cancelled and the siblings are cancelled.

suspend fun loadDashboardInParallel(): Triple<String, String, String> = coroutineScope {
    val a = async { "user" }
    val b = async { "feed" }
    val c = async { "settings" }
    Triple(a.await(), b.await(), c.await())
}

// ---------------------------------------------------------------------------
// 7. Exception handling: SupervisorJob and the failure model
// ---------------------------------------------------------------------------
// A regular `Job` propagates the first failure to the parent. A
// `SupervisorJob` does not. Use `supervisorScope { ... }` for
// "best-effort parallel" — fail one child, the others still finish.

suspend fun bestEffort(tasks: List<suspend () -> String>): List<String> {
    val out = mutableListOf<String>()
    supervisorScope {
        val jobs = tasks.map { task ->
            async { runCatching { task() } }
        }
        for (j in jobs) {
            j.await().onSuccess { out.add(it) }
        }
    }
    return out
}

// ---------------------------------------------------------------------------
// 8. The actor pattern
// ---------------------------------------------------------------------------
// An actor is a coroutine that owns a channel of incoming messages.
// The body pattern-matches on the message type and updates state.
// `actor` is deprecated in favour of `Channel` + a worker coroutine
// in newer versions, but the pattern is still useful to understand.

sealed class CounterMsg
object Inc : CounterMsg()
class Get(val reply: SendChannel<Int>) : CounterMsg()

fun CoroutineScope.counterActor(): kotlinx.coroutines.channels.SendChannel<CounterMsg> = actor {
    var n = 0
    for (msg in channel) {
        when (msg) {
            Inc -> n += 1
            is Get -> { reply.send(n); reply.close() }
        }
    }
}

// ---------------------------------------------------------------------------
// 9. Throttling & rate limiting
// ---------------------------------------------------------------------------
// The classic "token bucket" with a coroutine-flavoured `Semaphore`.

class RateLimiter(rate: Int) {
    private val sem = Semaphore(rate)

    suspend fun <T> acquire(block: suspend () -> T): T {
        sem.acquire()
        try {
            return block()
        } finally {
            // Release after a fixed window
            launch {
                delay(1_000 / rate.toLong())
                sem.release()
            }
        }
    }
}

// ---------------------------------------------------------------------------
// 10. Cancellation semantics
// ---------------------------------------------------------------------------
// Cancellation is cooperative. A coroutine that doesn't check for
// cancellation will keep running after its parent cancels. The
// standard library's suspending functions (`delay`, `yield`,
// `ensureActive`) are the cancellation points.

suspend fun cancellableLoop(): Int {
    var n = 0
    while (true) {
        yield()
        n += 1
    }
}

// ---------------------------------------------------------------------------
// Tour
// ---------------------------------------------------------------------------

fun tour(): List<String> = runBlocking {
    val items = mutableListOf<String>()
    val c = Counter()
    c.inc(); c.inc(); c.inc()
    items += c.get().toString()

    val limiter = ConcurrencyLimiter(2)
    val out = (1..5).map { i ->
        async {
            limiter.run { "task-$i" }
        }
    }.map { it.await() }
    items += out.toString()

    items += channelPipeline().toString()

    val first = firstResponse(
        a = { delay(100); "from-a" },
        b = { delay(10); "from-b" },
    )
    items += first

    items += loadDashboardInParallel().toString()

    val best = bestEffort(listOf(
        { "ok-1" },
        { throw RuntimeException("nope"); "never" },
        { "ok-2" },
    ))
    items += best.toString()

    val actor = counterActor()
    actor.send(Inc); actor.send(Inc); actor.send(Inc)
    val reply = Channel<Int>(1)
    actor.send(Get(reply))
    items += reply.receive().toString()
    actor.close()

    items
}
