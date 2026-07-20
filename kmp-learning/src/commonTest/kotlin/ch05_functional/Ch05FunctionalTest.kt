package ch05_functional

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class Ch05FunctionalTest {

    // --- Lambdas ----------------------------------------------------------

    @Test fun `lambda can be stored and called`() {
        assertEquals(5, add(2, 3))
        assertEquals(true, isEven(4))
    }

    @Test fun `single-parameter lambda has implicit it`() {
        val xs = listOf(1, 2, 3, 4, 5).filter { it % 2 == 0 }
        assertEquals(listOf(2, 4), xs)
    }

    @Test fun `function reference converts function to value`() {
        val f: (Int) -> Int = ::double
        assertEquals(8, f(4))
    }

    // --- Higher-order ----------------------------------------------------

    @Test fun `customMap runs the function on each element`() {
        val out = listOf(1, 2, 3).customMap { it + 10 }
        assertEquals(listOf(11, 12, 13), out)
    }

    @Test fun `repeat invokes the lambda n times`() {
        var count = 0
        repeat(5) { count += 1 }
        assertEquals(5, count)
    }

    @Test fun `makeAdder closes over delta`() {
        val add5 = makeAdder(5)
        val add100 = makeAdder(100)
        assertEquals(15, add5(10))
        assertEquals(110, add100(10))
    }

    // --- Scope functions --------------------------------------------------

    @Test fun `apply returns the configured receiver`() {
        val c = configure()
        assertEquals("jdbc://example", c.url)
    }

    @Test fun `let returns null when receiver is null`() {
        assertNull(uppercaseOrNull(null))
        assertEquals("HELLO", uppercaseOrNull("hello"))
    }

    // --- Closures --------------------------------------------------------

    @Test fun `makeCounter shares state across calls`() {
        val c = makeCounter()
        assertEquals(1, c())
        assertEquals(2, c())
        assertEquals(3, c())
    }

    // --- Extensions -------------------------------------------------------

    @Test fun `extension function behaves like an instance method`() {
        assertEquals('o', "hello".lastChar())
    }

    @Test fun `extension isPrime recognises small primes`() {
        assertTrue(2.isPrime())
        assertTrue(7.isPrime())
        assertEquals(false, 8.isPrime())
    }

    @Test fun `extension property computes from receiver`() {
        assertEquals(listOf("the", "quick", "brown", "fox"), "the quick brown fox".words)
    }

    // --- Infix -----------------------------------------------------------

    @Test fun `infix rotates the string`() {
        assertEquals("nkotli", "kotlin" rotatedBy 2)
        assertEquals("otlink", "kotlin" rotatedBy -2)
    }

    // --- Operator overloading --------------------------------------------

    @Test fun `plus on Vec2 adds components`() {
        assertEquals(Vec2(4.0, 6.0), Vec2(1.0, 2.0) + Vec2(3.0, 4.0))
    }

    @Test fun `unary minus flips sign`() {
        assertEquals(Vec2(-1.0, -2.0), -Vec2(1.0, 2.0))
    }

    @Test fun `times on Vec2 scales both components`() {
        assertEquals(Vec2(2.0, 4.0), Vec2(1.0, 2.0) * 2.0)
    }

    @Test fun `Matrix get and set`() {
        val m = Matrix(2, 2, doubleArrayOf(1.0, 2.0, 3.0, 4.0))
        assertEquals(2.0, m[0, 1])
        m[1, 0] = 99.0
        assertEquals(99.0, m[1, 0])
    }

    // --- DSL -------------------------------------------------------------

    @Test fun `html DSL produces nested elements`() {
        val s = html {
            head { title("KMP") }
            body {
                h1("Hello, KMP")
                p("From the DSL builder")
            }
        }
        assertTrue(s.contains("<title>KMP</title>"))
        assertTrue(s.contains("<h1>Hello, KMP</h1>"))
        assertTrue(s.contains("<p>From the DSL builder</p>"))
    }

    @Test fun `buildList fills a list with add calls`() {
        assertEquals(listOf(1, 2, 3), makeList())
    }

    // --- Composition ----------------------------------------------------

    @Test fun `andThen applies left first then right`() {
        val inc: (Int) -> Int = { it + 1 }
        val double: (Int) -> Int = { it * 2 }
        val f = inc andThen double
        assertEquals(12, f(5))          // (5+1) * 2
    }

    @Test fun `compose applies right first then left`() {
        val inc: (Int) -> Int = { it + 1 }
        val double: (Int) -> Int = { it * 2 }
        val f = inc compose double
        assertEquals(11, f(5))          // (5*2) + 1
    }

    @Test fun `compositionDemo pins the expected value`() {
        assertEquals(1, compositionDemo())
    }

    // --- Tour ------------------------------------------------------------

    @Test fun `tour produces the expected sequence`() {
        val items = tour()
        assertEquals(20, items.size)
        // Last item is the compositionDemo() result.
        assertEquals("1", items.last())
    }
}
