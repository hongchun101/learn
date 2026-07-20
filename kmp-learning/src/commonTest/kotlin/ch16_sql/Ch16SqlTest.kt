package ch16_sql

import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class Ch16SqlTest {

    // --- InMemoryTodoRepository ----------------------------------------

    @Test fun `add then list returns the item`() = runTest {
        val repo = InMemoryTodoRepository()
        val a = repo.add("hello")
        assertEquals(listOf(a), repo.list())
    }

    @Test fun `byId returns null for missing id`() = runTest {
        val repo = InMemoryTodoRepository()
        assertNull(repo.byId(42))
    }

    @Test fun `setDone updates the item and returns it`() = runTest {
        val repo = InMemoryTodoRepository()
        val a = repo.add("a")
        val updated = repo.setDone(a.id, true)
        assertNotNull(updated)
        assertTrue(updated.done)
        assertEquals(true, repo.byId(a.id)?.done)
    }

    @Test fun `setDone returns null for missing id`() = runTest {
        val repo = InMemoryTodoRepository()
        assertNull(repo.setDone(99, true))
    }

    @Test fun `delete returns true when the item exists`() = runTest {
        val repo = InMemoryTodoRepository()
        val a = repo.add("a")
        assertTrue(repo.delete(a.id))
        assertNull(repo.byId(a.id))
    }

    @Test fun `delete returns false when the item is missing`() = runTest {
        val repo = InMemoryTodoRepository()
        assertEquals(false, repo.delete(99))
    }

    @Test fun `observe emits the current list`() = runTest {
        val repo = InMemoryTodoRepository()
        val first = repo.observe().first()
        assertEquals(emptyList(), first)
        repo.add("a")
        val second = repo.observe().first()
        assertEquals(1, second.size)
    }

    // --- Schema ---------------------------------------------------------

    @Test fun `Schema versions are comparable`() {
        assertTrue(Schema.V1.version < Schema.V2.version)
    }

    // --- Tour ------------------------------------------------------------

    @Test fun `tour produces the expected sequence`() = runTest {
        val repo = InMemoryTodoRepository()
        val items = tour(repo)
        assertTrue(items.isNotEmpty())
        // First item is the initial size (0).
        assertEquals("0", items[0])
        // After three adds, size is 3.
        assertEquals("3", items[4])
        // After setDone, the first item is done.
        assertEquals("true", items[5])
        // After delete, size is 2.
        assertEquals("2", items[6])
    }
}
