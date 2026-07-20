package ch08_concurrency

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.cancel
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.channels.consumeEach
import kotlinx.coroutines.channels.produce
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.selects.onTimeout
import kotlinx.coroutines.selects.select
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.yield
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class Ch08ConcurrencyTest {

    // --- Mutex -----------------------------------------------------------

    @Test fun `Counter is safe under concurrent access`() = runBlocking {
        val c = Counter()
        val jobs = (1..100).map { async { c.inc() } }
        val final = jobs.map { it.await() }.max()
        assertEquals(100, final)
        assertEquals(100, c.get())
    }

    @Test fun `Mutex withLock releases on exception`() = runTest {
        val m = Mutex()
        assertFailsWith<IllegalStateException> {
            m.withLock {
                throw IllegalStateException("boom")
            }
        }
        // The lock must be released even after a throw.
        assertTrue(m.tryLock())
        m.unlock()
    }

    // --- Semaphore -------------------------------------------------------

    @Test fun `ConcurrencyLimiter caps the parallel count`() = runTest {
        val limiter = ConcurrencyLimiter(2)
        var running = 0
        var maxRunning = 0
        val jobs = (1..10).map {
            async {
                limiter.run {
                    running += 1
                    maxRunning = maxOf(maxRunning, running)
                    delay(20)
                    running -= 1
                    it
                }
            }
        }
        jobs.forEach { it.await() }
        assertTrue(maxRunning <= 2, "max running was $maxRunning")
    }

    // --- Channel ---------------------------------------------------------

    @Test fun `channelPipeline passes all elements`() = runBlocking {
        assertEquals(listOf(1, 2, 3, 4, 5), channelPipeline())
    }

    @Test fun `rendezvous channel send blocks until receive`() = runTest {
        val ch = Channel<Int>()  // rendezvous
        val sender = launch {
            ch.send(42)
            ch.close()
        }
        val received = ch.receive()
        sender.join()
        assertEquals(42, received)
    }

    // --- produce / actor -------------------------------------------------

    @Test fun `produce builder is a receive channel`() = runTest {
        val received = mutableListOf<Int>()
        val producer = backgroundScope.produce {
            for (n in 1..3) send(n)
        }
        producer.consumeEach { received.add(it) }
        assertEquals(listOf(1, 2, 3), received)
    }

    @Test fun `actor handles messages and replies`() = runTest {
        val actor = backgroundScope.counterActor()
        actor.send(CounterMsg.Inc)
        actor.send(CounterMsg.Inc)
        actor.send(CounterMsg.Inc)
        val reply = Channel<Int>(1)
        actor.send(Get(reply))
        val n = reply.receive()
        actor.close()
        assertEquals(3, n)
    }

    // --- select ----------------------------------------------------------

    @Test fun `select returns the first available result`() = runTest {
        val first = firstResponse(
            a = { delay(100); "from-a" },
            b = { delay(10); "from-b" },
        )
        assertEquals("from-b", first)
    }

    @Test fun `select with onTimeout returns the timeout branch`() = runTest {
        val first = select<String> {
            async { delay(1_000); "never" }.onAwait { it }
            onTimeout(10) { "timeout" }
        }
        assertEquals("timeout", first)
    }

    // --- Structured concurrency -----------------------------------------

    @Test fun `loadDashboardInParallel returns all three values`() = runTest {
        val (a, b, c) = loadDashboardInParallel()
        assertEquals("user", a)
        assertEquals("feed", b)
        assertEquals("settings", c)
    }

    @Test fun `bestEffort keeps successful tasks`() = runTest {
        val out = bestEffort(listOf(
            { "ok-1" },
            { throw RuntimeException("nope"); "never" },
            { "ok-2" },
        ))
        assertEquals(listOf("ok-1", "ok-2"), out)
    }

    // --- Cancellation ---------------------------------------------------

    @Test fun `cancellableLoop returns when not interrupted`() = runTest {
        val job = launch {
            try { cancellableLoop() } catch (_: kotlinx.coroutines.CancellationException) {}
        }
        job.cancelAndJoin()
        assertTrue(job.isCancelled)
    }

    // --- Tour ------------------------------------------------------------

    @Test fun `tour produces the expected sequence`() = runBlocking {
        val items = tour()
        assertTrue(items.isNotEmpty())
        // First item is the final counter value (3).
        assertEquals("3", items[0])
    }
}
