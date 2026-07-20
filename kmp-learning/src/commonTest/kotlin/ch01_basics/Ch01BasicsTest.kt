package ch01_basics

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Tests pin the contracts of every language feature ch01 introduced.
 * Refactoring the chapter is safe; changing the test is a flag that
 * the curriculum's contract has changed.
 */
class Ch01BasicsTest {

    // --- 1. Variable declarations -------------------------------------------

    @Test fun `val and var both compile and behave`() {
        val a = 1
        var b = 2
        b = 3
        assertEquals(1, a)
        assertEquals(3, b)
    }

    @Test fun `top-level constant is reachable across functions`() {
        // Same module — `const val` is a compile-time constant.
        assertEquals(1_000_000, MAX_USERS)
        assertEquals("kmp-learning", APP_NAME)
    }

    // --- 2. Primitive types -------------------------------------------------

    @Test fun `int and long are not the same type`() {
        val a: Int = 42
        val b: Long = 42L
        // No implicit Int -> Long conversion in equality; we widen explicitly.
        assertEquals(a.toLong(), b)
    }

    @Test fun `double and float are not the same type`() {
        val a: Double = 3.14
        val b: Float = 3.14f
        assertTrue(a != b.toDouble())
    }

    // --- 3. Strings ---------------------------------------------------------

    @Test fun `string template interpolates a value`() {
        assertEquals("Hello, kmp-learning!", greeting)
    }

    @Test fun `string template can run an expression`() {
        val r = 2.0
        val area = "πr² = ${Math.PI * r * r}"
        assertTrue(area.startsWith("πr² = "))
    }

    @Test fun `raw string preserves indentation after trimIndent`() {
        val s = """
            line 1
            line 2
        """.trimIndent()
        assertEquals("line 1\nline 2", s)
    }

    // --- 4. Control flow ----------------------------------------------------

    @Test fun `when expression returns the matching branch`() {
        assertEquals("negative", describe(-1))
        assertEquals("zero", describe(0))
        assertEquals("single-digit", describe(7))
        assertEquals("double-digit", describe(42))
        assertEquals("big", describe(1000))
    }

    @Test fun `fizzBuzz covers all branches`() {
        assertEquals("FizzBuzz", fizzBuzz(15))
        assertEquals("Fizz", fizzBuzz(9))
        assertEquals("Buzz", fizzBuzz(10))
        assertEquals("7", fizzBuzz(7))
    }

    @Test fun `sumRange covers inclusive range`() {
        assertEquals(55, sumRange(1, 10))
        assertEquals(0, sumRange(5, 4))
    }

    @Test fun `sumList iterates in order`() {
        assertEquals(6, sumList(listOf(1, 2, 3)))
        assertEquals(0, sumList(emptyList()))
    }

    @Test fun `indexed includes the index and the value`() {
        assertEquals("0:a 1:b 2:c", indexed(listOf("a", "b", "c")))
    }

    // --- 5. Functions -------------------------------------------------------

    @Test fun `default and named arguments work`() {
        assertEquals("Hello, Ada!", greet("Ada"))
        assertEquals("Hi, Ada!", greet("Ada", greeting = "Hi"))
        assertEquals("Hi, Ada.", greet("Ada", greeting = "Hi", punctuation = "."))
    }

    @Test fun `varargs accept any number of values`() {
        assertEquals(0, sumAll())
        assertEquals(6, sumAll(1, 2, 3))
    }

    // --- 6. Null safety -----------------------------------------------------

    @Test fun `safe call returns null when receiver is null`() {
        val s: String? = null
        assertNull(s?.length)
    }

    @Test fun `elvis supplies a default for null`() {
        assertEquals(0, lengthOrZero(null))
        assertEquals(3, lengthOrZero("abc"))
    }

    @Test fun `let runs the block on non-null`() {
        assertEquals('h', firstChar("hello"))
        assertNull(firstChar(null))
    }

    @Test fun `not-null assertion throws on null`() {
        assertFailsWith<NullPointerException> { definitelyNotNull(null) }
    }

    // --- 7. Equality --------------------------------------------------------

    @Test fun `structural and referential equality are different`() {
        val result = equality()
        assertTrue(result)
    }

    // --- 8. Type checks and smart casts -------------------------------------

    @Test fun `smartCast picks the matching branch`() {
        assertEquals("int 43", smartCast(42))
        assertEquals("str 5", smartCast("hello"))
        assertEquals("list 3", smartCast(listOf(1, 2, 3)))
        assertEquals("other", smartCast(3.14))
    }

    // --- 9. Nothing ---------------------------------------------------------

    @Test fun `parseOrFail returns the parsed value`() {
        assertEquals(42, parseOrFail("42"))
    }

    @Test fun `parseOrFail throws on bad input`() {
        assertFailsWith<IllegalStateException> { parseOrFail("not an int") }
    }

    // --- 10. Standard library -----------------------------------------------

    @Test fun `pair and triple carry their members`() {
        val (n, s) = pairExample()
        assertEquals(1, n)
        assertEquals("one", s)

        val (a, b, c) = tripleExample()
        assertEquals(Triple(1, "a", true), Triple(a, b, c))
    }

    @Test fun `Result captures success and failure`() {
        val ok = safeDivide(10, 2)
        val err = safeDivide(10, 0)
        assertTrue(ok.isSuccess)
        assertEquals(5, ok.getOrNull())
        assertTrue(err.isFailure)
        assertFailsWith<ArithmeticException> { err.getOrThrow() }
    }

    @Test fun `ranges and progressions`() {
        assertEquals(10, inclusive.last)
        assertEquals(9, exclusive.last)
        assertEquals(10, descending.first)
        assertEquals(0, stepping.first)
        assertEquals(100, stepping.last)
        assertEquals(21, stepping.count())
    }

    // --- The tour produces a non-empty, ordered sequence --------------------

    @Test fun `tour runs and returns at least one item`() {
        val items = tour()
        assertTrue(items.isNotEmpty())
        // The first item is the greeting — locked-in so a refactor
        // can't quietly change the curriculum's "Hello, kmp-learning!"
        // identity.
        assertTrue(items.first().startsWith("Hello,"))
    }

    // --- Data classes contract ---------------------------------------------

    @Test fun `data class equals is structural`() {
        assertEquals(Money(100, "USD"), Money(100, "USD"))
        assertFalse(Money(100, "USD") === Money(100, "USD"))
    }
}
