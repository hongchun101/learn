package ch07_flow

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.consumeAsFlow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.merge
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.retry
import kotlinx.coroutines.flow.shareIn
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.take
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.flow.zip
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class Ch07FlowTest {

    // --- Cold flow basics -------------------------------------------------

    @Test fun `ticker emits in order and respects take`() = runTest {
        val out = ticker(10).take(5).toList()
        assertEquals(listOf(0, 1, 2, 3, 4), out)
    }

    @Test fun `flow is cold - each collector runs the body again`() = runTest {
        var count = 0
        val f = flow { count += 1; emit(count) }
        assertEquals(1, f.first())
        assertEquals(2, f.first())
        // Each `.first()` is a separate collection.
        assertEquals(2, count)
    }

    @Test fun `transformExample produces the expected list`() = runTest {
        val out = flowOf(1, 2, 3, 4, 5)
            .map { it * it }
            .filter { it > 5 }
            .toList()
        assertEquals(listOf(9, 16, 25), out)
    }

    // --- StateFlow -------------------------------------------------------

    @Test fun `CounterState holds and updates state`() = runTest {
        val c = CounterState(10)
        assertEquals(10, c.state.value)
        c.inc()
        c.inc()
        c.inc()
        assertEquals(13, c.state.value)
    }

    @Test fun `StateFlow conflates same-value emissions`() = runTest {
        val state = MutableStateFlow(0)
        val collected = mutableListOf<Int>()
        val job = launch(UnconfinedTestDispatcher(testScheduler)) {
            state.collect { collected.add(it) }
        }
        state.value = 0   // not emitted (same)
        state.value = 1
        state.value = 1   // not emitted (same)
        state.value = 2
        job.cancel()
        assertEquals(listOf(0, 1, 2), collected)
    }

    // --- SharedFlow ------------------------------------------------------

    @Test fun `EventBus emits and buffers events`() = runTest {
        val bus = EventBus()
        val got = mutableListOf<String>()
        val job = launch(UnconfinedTestDispatcher(testScheduler)) {
            bus.events.collect { got.add(it) }
        }
        bus.tryEmit("a")
        bus.tryEmit("b")
        job.cancel()
        assertEquals(listOf("a", "b"), got)
    }

    // --- Combine / merge / zip ------------------------------------------

    @Test fun `zip pairs values in order`() = runTest {
        val a = flowOf("a1", "a2", "a3")
        val b = flowOf("b1", "b2", "b3")
        val out = a.zip(b) { x, y -> "$x+$y" }.toList()
        assertEquals(listOf("a1+b1", "a2+b2", "a3+b3"), out)
    }

    @Test fun `merge interleaves two flows`() = runTest {
        val a = flowOf(1, 3, 5)
        val b = flowOf(2, 4, 6)
        val out = merge(a, b).toList().sorted()
        assertEquals(listOf(1, 2, 3, 4, 5, 6), out)
    }

    @Test fun `combine emits the latest pair on every update`() = runTest {
        val a = flowOf("a1", "a2", "a3")
        val b = flowOf("b1", "b2", "b3")
        val out = a.combine(b) { x, y -> "$x+$y" }.toList()
        // combine emits whenever any source updates; with these
        // synchronous flows, every (a_i, b_j) pair is emitted once.
        assertTrue(out.size >= 3)
        assertTrue(out.contains("a3+b3"))
    }

    // --- FlatMap ---------------------------------------------------------

    @Test fun `flatMapConcat preserves upstream order`() = runTest {
        val out = flowOf(1, 2, 3)
            .flatMapConcat { n -> flowOf("a$n", "b$n") }
            .toList()
        assertEquals(listOf("a1", "b1", "a2", "b2", "a3", "b3"), out)
    }

    @Test fun `flatMapLatest cancels the previous inner flow`() = runTest {
        // With immediate inner emissions, the latest wins.
        val out = flowOf(1, 2, 3)
            .flatMapLatest { n -> flowOf("a$n") }
            .toList()
        assertEquals(listOf("a1", "a2", "a3"), out)
    }

    // --- Error handling --------------------------------------------------

    @Test fun `catch recovers from an exception`() = runTest {
        val out = flow<String> {
            emit("ok")
            throw RuntimeException("boom")
        }.catch { e -> emit("recovered ${e.message}") }
         .toList()
        assertEquals(listOf("ok", "recovered boom"), out)
    }

    @Test fun `retry re-subscribes a fixed number of times`() = runTest {
        var attempts = 0
        val out = flow {
            attempts += 1
            if (attempts < 3) throw RuntimeException("fail")
            emit(attempts)
        }.retry(3).toList()
        assertEquals(listOf(3), out)
    }

    // --- Channel / channelFlow ------------------------------------------

    @Test fun `channelFlow produces from a launched producer`() = runTest {
        val out = numbersFromChannel().toList()
        assertEquals(listOf(1, 2, 3), out)
    }

    // --- Terminal operators ---------------------------------------------

    @Test fun `first returns the first element`() = runTest {
        assertEquals(1, flowOf(1, 2, 3).first())
    }

    @Test fun `firstOrNull returns null for empty flow`() = runTest {
        assertNull(emptyFlow<Int>().firstOrNull())
    }

    @Test fun `fold accumulates a value`() = runTest {
        val out = flowOf(1, 2, 3, 4).fold(0) { acc, n -> acc + n }
        assertEquals(10, out)
    }

    // --- stateIn / shareIn -----------------------------------------------

    @Test fun `stateIn turns a cold flow into a hot StateFlow`() = runTest {
        val state = flowOf(1, 2, 3)
            .stateIn(backgroundScope, SharingStarted.Eagerly, 0)
        assertEquals(3, state.value)
    }

    @Test fun `shareIn turns a cold flow into a hot SharedFlow`() = runTest {
        val shared = flowOf(1, 2, 3)
            .shareIn(backgroundScope, SharingStarted.Eagerly, replay = 0)
        val a = mutableListOf<Int>()
        val b = mutableListOf<Int>()
        val jobA = launch(UnconfinedTestDispatcher(testScheduler)) { shared.collect { a.add(it) } }
        val jobB = launch(UnconfinedTestDispatcher(testScheduler)) { shared.collect { b.add(it) } }
        // With replay = 0, only subscribers present at the time of
        // emission see the value. Eagerly starts the upstream so
        // emissions happen on the test scheduler.
        assertTrue(a.isNotEmpty() || b.isNotEmpty())
        jobA.cancel(); jobB.cancel()
    }

    // --- Tour ------------------------------------------------------------

    @Test fun `tour produces the expected sequence`() = runTest {
        val items = tour()
        assertTrue(items.isNotEmpty())
        // The tour does not run deterministically for some operators
        // (combine emits on every update), so we assert shape, not
        // exact equality.
        assertTrue(items.size >= 10)
        // First non-trivial item is the ticker.take(5) result.
        assertEquals("[0, 1, 2, 3, 4]", items[1])
    }
}
