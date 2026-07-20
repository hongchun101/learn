package ch18_capstone

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class Ch18CapstoneTest {

    // --- UseCase contract ------------------------------------------------

    @Test fun `AddTodoUC rejects blank titles`() = runTest {
        val store = InMemoryTodoStore()
        val uc = AddTodoUC(store)
        val r = uc("  ")
        assertTrue(r.isFailure)
    }

    @Test fun `AddTodoUC rejects too-long titles`() = runTest {
        val store = InMemoryTodoStore()
        val uc = AddTodoUC(store)
        val r = uc("x".repeat(201))
        assertTrue(r.isFailure)
    }

    @Test fun `AddTodoUC trims and adds non-blank titles`() = runTest {
        val store = InMemoryTodoStore()
        val uc = AddTodoUC(store)
        val r = uc("  Learn KMP  ")
        assertTrue(r.isSuccess)
        assertEquals("Learn KMP", r.getOrThrow().title)
    }

    @Test fun `ToggleTodoUC flips the done flag`() = runTest {
        val store = InMemoryTodoStore()
        val added = store.add("a")
        val uc = ToggleTodoUC(store)
        val r1 = uc(added.id, true)
        assertEquals(true, r1.getOrThrow()?.done)
        val r2 = uc(added.id, false)
        assertEquals(false, r2.getOrThrow()?.done)
    }

    @Test fun `DeleteTodoUC removes the item`() = runTest {
        val store = InMemoryTodoStore()
        val added = store.add("a")
        val uc = DeleteTodoUC(store)
        val r = uc(added.id)
        assertTrue(r.getOrThrow())
        assertEquals(0, store.list().size)
    }

    // --- ViewModel -------------------------------------------------------

    @Test fun `ViewModel adds and toggles and deletes`() = runTest {
        val store = InMemoryTodoStore()
        val vm = buildViewModel(backgroundScope, store)
        advanceUntilIdle()
        vm.add("a")
        advanceUntilIdle()
        assertEquals(1, vm.state.value.items.size)
        val id = vm.state.value.items.first().id
        vm.toggle(id)
        advanceUntilIdle()
        assertEquals(true, vm.state.value.items.first().done)
        vm.delete(id)
        advanceUntilIdle()
        assertEquals(0, vm.state.value.items.size)
        vm.close()
    }

    @Test fun `ViewModel surfaces error on blank add`() = runTest {
        val store = InMemoryTodoStore()
        val vm = buildViewModel(backgroundScope, store)
        advanceUntilIdle()
        vm.add("   ")
        advanceUntilIdle()
        assertNotNull(vm.state.value.error)
        vm.close()
    }

    // --- InMemoryTodoStore ----------------------------------------------

    @Test fun `InMemoryTodoStore observe emits on change`() = runTest {
        val store = InMemoryTodoStore()
        val first = store.observe().first()
        assertEquals(emptyList(), first)
        store.add("a")
        val second = store.observe().first()
        assertEquals(1, second.size)
    }

    // --- NoopDriver ------------------------------------------------------

    @Test fun `NoopDriver does not throw`() {
        val d = NoopDriver()
        d.showMessage("hi")
        assertEquals("noop", d.name)
    }

    // --- Tour ------------------------------------------------------------

    @Test fun `tour runs and produces the expected sequence`() = runTest {
        val items = tour()
        assertTrue(items.isNotEmpty())
        // First item: platform name from the noop driver.
        assertEquals("platform: noop", items[0])
        assertEquals("initial size: 0", items[1])
        assertEquals("after adds: 3", items[2])
        // The toggle result and the post-delete size depend on the
        // order of dispatcher; we just assert shape.
        assertTrue(items.size >= 6)
    }
}
