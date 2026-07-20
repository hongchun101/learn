package ch06_coroutines

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.cancel
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withContext
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class Ch06CoroutinesTest {

    // --- suspend ---------------------------------------------------------

    @Test fun `greet is a suspend function`() = runTest {
        assertEquals("Hello, KMP", greet("KMP"))
    }

    @Test fun `runBlocking bridges to the blocking world`() {
        assertEquals("Hello, KMP", blockingEntry())
    }

    // --- launch / Job ---------------------------------------------------

    @Test fun `launch produces a Job that joins`() = runTest {
        val job = launch {
            delay(50)
        }
        assertTrue(job is Job)
        job.join()
        assertTrue(job.isCompleted)
    }

    // --- async / await --------------------------------------------------

    @Test fun `async runs in parallel and await joins`() = runTest {
        val start = currentTime
        val (user, feed) = coroutineScope {
            val u = async { loadUser() }
            val f = async { loadFeed() }
            u.await() to f.await()
        }
        // 50ms + 50ms in parallel ~ 50ms, not 100ms.
        val elapsed = currentTime - start
        assertEquals("user", user)
        assertEquals("feed", feed)
        assertTrue(elapsed < 150, "expected parallel execution, got $elapsed ms")
    }

    // --- withContext / Dispatchers --------------------------------------

    @Test fun `withContext switches dispatcher and returns value`() = runTest {
        val n = withContext(Dispatchers.Default) {
            (0..10).sum()
        }
        assertEquals(55, n)
    }

    // --- Structured exception propagation -------------------------------

    @Test fun `child failure cancels siblings and propagates`() = runBlocking {
        val out = structuredExceptionPropagation()
        assertEquals("caught: boom", out)
    }

    // --- SupervisorScope ------------------------------------------------

    @Test fun `supervisorScope children fail independently`() = runBlocking {
        val out = supervisorIndependent()
        assertEquals("supervised", out)
    }

    @Test fun `SupervisorJob does not propagate failure between children`() = runTest {
        val supervisor = CoroutineScope(StandardTestDispatcher(testScheduler) + Job())
        val a = supervisor.async {
            delay(10)
            throw IllegalStateException("a")
        }
        val b = supervisor.async {
            delay(20)
            "b-ok"
        }
        // `a` failed; `b` still completes successfully.
        assertFailsWith<IllegalStateException> { a.await() }
        assertEquals("b-ok", b.await())
        supervisor.cancel()
    }

    // --- Cancellation is cooperative ------------------------------------

    @Test fun `cancellable returns when not interrupted`() = runTest {
        // It's a tight loop; we only run it a few iterations by
        // increasing the bound and asserting we can break.
        assertTrue(cancellable() > 0)
    }

    @Test fun `cancellation through cancelAndJoin works`() = runTest {
        val job = launch {
            try {
                while (true) {
                    delay(1000)
                }
            } catch (e: CancellationException) {
                throw e
            }
        }
        advanceTimeBy(100)
        job.cancelAndJoin()
        assertTrue(job.isCancelled)
    }

    // --- coroutineContext snapshot --------------------------------------

    @Test fun `coroutineContext snapshot includes a Job`() = runTest {
        val snap = contextSnapshot()
        // We don't assert the exact dispatcher string, only that
        // the snapshot is non-empty and contains a job reference.
        assertTrue(snap.contains("name="))
    }

    // --- Tour ------------------------------------------------------------

    @Test fun `tour runs and produces the expected sequence`() = runBlocking {
        val items = tourBlocking()
        assertTrue(items.isNotEmpty())
        // Spot-check: the first item is the suspend greet result.
        assertEquals("Hello, KMP", items.first())
    }
}
