package ch13_testing

import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class Ch13TestingTest {

    // --- Unit tests -------------------------------------------------------

    @Test fun `add returns the sum of two ints`() {
        assertEquals(5, add(2, 3))
        assertEquals(0, add(0, 0))
        assertEquals(-1, add(2, -3))
    }

    @Test fun `sideEffectCounter increments on every call`() {
        val c = sideEffectCounter()
        assertEquals(1, c())
        assertEquals(2, c())
        assertEquals(3, c())
    }

    // --- Suspending tests -------------------------------------------------

    @Test fun `loadAfter returns the value after the delay`() = runTest {
        val v = loadAfter(100, "hello")
        assertEquals("hello", v)
    }

    @Test fun `runTest advances virtual time`() = runTest {
        // Inside runTest, `delay` is virtual. We can skip the wait.
        val v = loadAfter(60_000, "done")  // 60s of virtual time
        assertEquals("done", v)
    }

    @Test fun `advanceTimeBy controls the virtual clock`() = runTest {
        var count = 0
        kotlinx.coroutines.launch {
            kotlinx.coroutines.delay(1_000)
            count += 1
        }
        assertEquals(0, count)
        advanceTimeBy(1_500)
        // The virtual clock has advanced; the launched coroutine has run.
        assertEquals(1, count)
    }

    // --- Failure tests ----------------------------------------------------

    @Test fun `maybeNull returns null on false`() {
        assertNull(maybeNull(false))
    }

    @Test fun `maybeNull returns the value on true`() {
        assertNotNull(maybeNull(true))
    }

    @Test fun `checkedDivide throws on zero denominator`() {
        assertFailsWith<IllegalArgumentException> { checkedDivide(1, 0) }
    }

    @Test fun `checkedDivide returns the quotient on non-zero`() {
        assertEquals(2, checkedDivide(10, 5))
    }

    // --- Test as documentation -------------------------------------------

    @Test fun `the contract for add is a commutative monoid over Int`() {
        // Identity
        assertEquals(0, add(0, 0))
        // Associativity
        assertEquals(add(add(1, 2), 3), add(1, add(2, 3)))
        // Commutativity
        assertEquals(add(2, 3), add(3, 2))
    }

    @Test fun `the contract for sideEffectCounter is sequential`() {
        val c = sideEffectCounter(start = 100)
        assertEquals(101, c())
        assertEquals(102, c())
    }

    // --- The kotlin.test API surface (smoke test) ------------------------

    @Test fun `kotlin test assertions all behave as expected`() {
        assertTrue(true)
        assertEquals(1, 1)
        assertNotNull("x")
        assertNull(null)
    }
}
