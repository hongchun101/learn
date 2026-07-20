package ch14_di

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertSame
import kotlin.test.assertTrue

class Ch14DiTest {

    // --- Basic resolution -----------------------------------------------

    @Test fun `registerSingleton stores a single instance`() {
        val c = Container()
        val log = Logger2("test")
        c.registerSingleton(log)
        assertSame(log, c.resolve<Logger2>())
    }

    @Test fun `registerFactory returns a fresh instance per resolve`() {
        val c = Container()
        var counter = 0
        c.registerFactory<Logger2> { counter += 1; Logger2("fac-$counter") }
        val a = c.resolve<Logger2>()
        val b = c.resolve<Logger2>()
        assertTrue(a !== b)
        assertEquals(2, counter)
    }

    @Test fun `resolve throws when nothing is registered`() {
        val c = Container()
        assertFailsWith<IllegalStateException> { c.resolve<Logger2>() }
    }

    // --- The graph -------------------------------------------------------

    @Test fun `installCore wires the user service graph`() {
        val c = Container().installCore()
        val users = c.resolve<UserService2>()
        users.add("Ada")
        assertEquals(listOf("Ada"), users.list())
    }

    @Test fun `test override replaces the production logger`() {
        val c = Container().withTestOverride("user-svc")
        val log = c.resolve<Logger2>()
        assertEquals("test-user-svc", log.name)
    }

    @Test fun `two resolves of a singleton return the same instance`() {
        val c = Container().installCore()
        val a = c.resolve<UserService2>()
        val b = c.resolve<UserService2>()
        assertSame(a, b)
    }

    // --- Tour ------------------------------------------------------------

    @Test fun `tour runs and produces the expected output`() {
        val items = tour()
        assertEquals(2, items.size)
        // The test container is created in the tour, so it has a
        // single test user. The production container has Ada + Boris.
        assertTrue(items[0].contains("Ada"))
        assertTrue(items[0].contains("Boris"))
        assertTrue(items[1].contains("test-user"))
    }
}
