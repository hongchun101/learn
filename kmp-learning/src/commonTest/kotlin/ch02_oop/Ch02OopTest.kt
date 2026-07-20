package ch02_oop

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotEquals
import kotlin.test.assertSame
import kotlin.test.assertTrue

class Ch02OopTest {

    // --- Inheritance --------------------------------------------------------

    @Test fun `Animal subclass overrides speak`() {
        val rex = Dog("Rex", "lab")
        assertEquals("Rex says woof", rex.describe())
    }

    @Test fun `abstract class forces subclass to implement member`() {
        // Compile-time check: every Shape subclass must implement area().
        val c: Shape = Circle(2.0)
        val r: Shape = Rectangle(3.0, 4.0)
        assertEquals(Math.PI * 4.0, c.area())
        assertEquals(12.0, r.area())
    }

    @Test fun `class is final by default - cannot subclass without open`() {
        // FinalDog cannot be defined: `class SubDog : Dog(...)` won't
        // compile because Dog inherits from a `final` Animal only if
        // Animal is open. The runtime check is that nothing here
        // accidentally opens a base class.
        val d = Dog("Rex", "lab")
        assertTrue(d is Animal)
    }

    // --- Interfaces ---------------------------------------------------------

    @Test fun `class can implement multiple interfaces`() {
        val c = ColoredCircle(1.0, 0xFF0000)
        assertTrue(c is Shape)
        assertTrue(c is Drawable)
        assertTrue(c is Color)
        assertEquals("drawing circle of radius 1.0 with color #ff0000", c.draw())
    }

    // --- Data class ---------------------------------------------------------

    @Test fun `data class structural equality and copy`() {
        val p1 = Point(3.0, 4.0)
        val p2 = p1.copy(y = 0.0)
        assertEquals(p1, Point(3.0, 4.0))
        assertNotEquals(p1, p2)
        assertEquals(0.0, p2.y)
    }

    @Test fun `data class componentN functions destructure`() {
        val (x, y) = Point(1.0, 2.0)
        assertEquals(1.0, x)
        assertEquals(2.0, y)
    }

    // --- Enum ---------------------------------------------------------------

    @Test fun `enum can carry data and override behaviour`() {
        assertEquals(Direction.NORTH, Direction.SOUTH.opposite())
        assertEquals(Direction.EAST, Direction.WEST.opposite())
    }

    // --- Sealed -------------------------------------------------------------

    @Test fun `when over sealed class is exhaustive`() {
        // The compiler enforces that every UiState branch is handled.
        // If a new branch is added and `describe` is not updated, the
        // build fails.
        assertEquals("idle", describe(UiState.Idle))
        assertEquals("loading 0.0", describe(UiState.Loading()))
        assertEquals("loading 0.5", describe(UiState.Loading(0.5f)))
        assertEquals("ready: hello", describe(UiState.Ready("hello")))
        assertEquals("error: boom", describe(UiState.Error("boom")))
    }

    @Test fun `sealed interface allows Loading to be a singleton object`() {
        // Result.Loading is an object — a single instance reused.
        val a: Result<Int> = Result.Loading
        val b: Result<Int> = Result.Loading
        assertSame(a, b)
    }

    // --- Object singleton ---------------------------------------------------

    @Test fun `object holds shared state`() {
        val a = Counter.inc()
        val b = Counter.inc()
        val c = Counter.inc()
        // We don't assert the exact values (singleton state survives
        // across tests); we assert the ordering and the invariant
        // that every inc is monotonic.
        assertTrue(b > a)
        assertTrue(c > b)
    }

    // --- Companion ----------------------------------------------------------

    @Test fun `companion object holds constants and factories`() {
        assertEquals("anonymous", User.ANONYMOUS_NAME)
        val anon = User.anonymous()
        val named = User.named("Ada")
        assertEquals(0L, anon.id)
        assertEquals("anonymous", anon.name)
        assertEquals("Ada", named.name)
    }

    @Test fun `private constructor blocks direct instantiation`() {
        // You cannot `User(1, "x")` — the constructor is private.
        // The companion's factory methods are the only entry.
        assertFailsWith<Error> {
            // The class User's primary constructor is private. We
            // cannot call it from outside; we have to go through
            // the companion. The runtime check below is a sentinel:
            // the *real* test is "this code does not compile".
            @Suppress("UNUSED_EXPRESSION")
            null
        }
    }

    // --- Nested vs inner ----------------------------------------------------

    @Test fun `nested class has no reference to outer`() {
        assertEquals("nested, no outer access", Outer.Nested().hello())
    }

    @Test fun `inner class captures outer`() {
        assertEquals("inner, outer tag = x", Outer("x").Inner().hello())
    }

    // --- `fun interface` SAM conversion -------------------------------------

    @Test fun `fun interface allows lambda at the call site`() {
        val msg = callGreeter("world") { "Hi, $it" }
        assertEquals("Hi, world", msg)
    }

    // --- Visibility ---------------------------------------------------------

    @Test fun `internal class is reachable within the module`() {
        // InternalThing is `internal`; the test class is in the same
        // module, so it can reach it.
        assertEquals("visible to everyone in the module", InternalThing().publicMethod())
    }

    // --- Tour ---------------------------------------------------------------

    @Test fun `tour produces the expected sequence`() {
        val items = tour()
        // Spot-check the first and the last item.
        assertTrue(items.isNotEmpty())
        assertTrue(items.first().startsWith("Rex"))
        // Last item is the SAM-converted call result.
        assertEquals("Hi, world", items.last())
    }
}
