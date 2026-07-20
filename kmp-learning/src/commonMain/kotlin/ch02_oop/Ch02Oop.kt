/*
 * ch02_oop / Ch02Oop.kt
 *
 * The Kotlin class system. By the end of this file you should be able
 * to read any production Kotlin class and tell:
 *   - Is it a `class`, `data class`, `enum class`, `sealed class`,
 *     `value class`, or `object`?
 *   - What's `open` (subclassable) vs `final` (sealed)?
 *   - What's `internal` (module-private) vs `public` (library API)?
 *   - What does the `companion object` add?
 *
 * The test file pins the contracts.
 */
@file:Suppress("unused", "UNUSED_VARIABLE", "RedundantVisibilityModifier")

package ch02_oop

// ---------------------------------------------------------------------------
// 1. Plain class
// ---------------------------------------------------------------------------
// Default visibility in Kotlin is `public`. Default modifiability is
// `final` (closed for inheritance). To allow inheritance, mark `open`.
// A Kotlin class is what Java calls a *final* class by default — the
// opposite of Java's default.

open class Animal(val name: String) {
    open fun speak(): String = "..."
    fun describe(): String = "$name says ${speak()}"
}

class Dog(name: String, val breed: String) : Animal(name) {
    override fun speak(): String = "woof"
}

// ---------------------------------------------------------------------------
// 2. Abstract class
// ---------------------------------------------------------------------------
// Use an abstract class when you want a partial implementation that
// subclasses must complete. Abstract classes can have state, but a
// class can only inherit from one (single inheritance).

abstract class Shape {
    abstract fun area(): Double
    fun describe(): String = "area = ${area()}"
}

class Circle(val radius: Double) : Shape() {
    override fun area(): Double = Math.PI * radius * radius
}

class Rectangle(val width: Double, val height: Double) : Shape() {
    override fun area(): Double = width * height
}

// ---------------------------------------------------------------------------
// 3. Interface
// ---------------------------------------------------------------------------
// Interfaces in Kotlin can have default implementations and `val`
// properties (but no state). A class can implement many interfaces;
// that's how Kotlin avoids the diamond problem.

interface Drawable {
    fun draw(): String
    fun bounds(): String = "unknown"
}

interface Color(val rgb: Int) {
    fun colorName(): String = "#${rgb.toString(16).padStart(6, '0')}"
}

class ColoredCircle(val radius: Double, rgb: Int) : Shape(), Drawable, Color(rgb) {
    override fun area(): Double = Math.PI * radius * radius
    override fun draw(): String = "drawing circle of radius $radius with color ${colorName()}"
    override fun bounds(): String = "0,0 ${radius * 2},${radius * 2}"
}

// ---------------------------------------------------------------------------
// 4. Data class
// ---------------------------------------------------------------------------
// `data class` gives you `equals`, `hashCode`, `toString`, `copy`,
// `componentN` for free. They are the "value type" of Kotlin.
// Restrict data classes to plain data containers; if you need
// behaviour, prefer a regular class.

data class Point(val x: Double, val y: Double) {
    fun distanceTo(other: Point): Double {
        val dx = x - other.x
        val dy = y - other.y
        return Math.sqrt(dx * dx + dy * dy)
    }
}

// ---------------------------------------------------------------------------
// 5. Enum class
// ---------------------------------------------------------------------------
// Enums in Kotlin are full classes: they can have properties, methods,
// and implement interfaces.

enum class Direction(val dx: Int, val dy: Int) {
    NORTH(0, 1),
    SOUTH(0, -1),
    EAST(1, 0),
    WEST(-1, 0);

    fun opposite(): Direction = when (this) {
        NORTH -> SOUTH
        SOUTH -> NORTH
        EAST -> WEST
        WEST -> EAST
    }
}

// ---------------------------------------------------------------------------
// 6. Sealed class / sealed interface
// ---------------------------------------------------------------------------
// Sealed types enumerate their subclasses at compile time. The
// compiler can then check that a `when` over the sealed type is
// exhaustive. **This is the most important type-system feature for
// domain modelling.**

sealed interface Result<out T> {
    data class Success<T>(val value: T) : Result<T>
    data class Failure(val cause: Throwable) : Result<Nothing>
    object Loading : Result<Nothing>
}

sealed class UiState<out T> {
    object Idle : UiState<Nothing>()
    data class Loading(val progress: Float = 0f) : UiState<Nothing>()
    data class Ready<T>(val data: T) : UiState<T>()
    data class Error(val message: String) : UiState<Nothing>()
}

fun <T> describe(state: UiState<T>): String = when (state) {
    is UiState.Idle -> "idle"
    is UiState.Loading -> "loading ${state.progress}"
    is UiState.Ready<*> -> "ready: ${state.data}"
    is UiState.Error -> "error: ${state.message}"
}

// ---------------------------------------------------------------------------
// 7. Object (singleton)
// ---------------------------------------------------------------------------
// `object` is a singleton with a private constructor. Use it for
// stateless utilities, or as a holder for `expect/actual` bridges.

object Counter {
    private var n = 0
    fun inc(): Int {
        n += 1
        return n
    }
    fun value(): Int = n
}

// ---------------------------------------------------------------------------
// 8. Companion object
// ---------------------------------------------------------------------------
// A `companion object` is a singleton inside a class. It's the place
// for `const val` constants and factory methods.

class User private constructor(val id: Long, val name: String) {
    companion object {
        const val ANONYMOUS_NAME = "anonymous"
        fun anonymous(): User = User(0, ANONYMOUS_NAME)
        fun named(name: String): User = User(System.nanoTime(), name)
    }

    fun describe(): String = "user#$id $name"
}

// ---------------------------------------------------------------------------
// 9. Nested class vs inner class
// ---------------------------------------------------------------------------
// A nested class is `static` (no reference to the outer). An inner
// class holds a reference to the outer instance.

class Outer(val tag: String) {
    class Nested {
        fun hello(): String = "nested, no outer access"
    }

    inner class Inner {
        fun hello(): String = "inner, outer tag = $tag"
    }
}

// ---------------------------------------------------------------------------
// 10. Visibility modifiers
// ---------------------------------------------------------------------------
// `public` (default), `internal` (module), `protected` (subclasses),
// `private` (file/class).

internal class InternalThing {
    fun publicMethod(): String = "visible to everyone in the module"
}

// ---------------------------------------------------------------------------
// 11. The "open" rule
// ---------------------------------------------------------------------------
// A Kotlin class is `final` by default. To allow subclassing:
//   - mark the class `open`
//   - mark each member that should be overridable `open`
// This forces every "is this a base class?" question to be answered
// explicitly. The result is fewer accidental inheritance hierarchies
// in production code.

// ---------------------------------------------------------------------------
// 12. The "object expressions" pattern
// ---------------------------------------------------------------------------
// Anonymous objects for one-off interface implementations. Useful for
// SAM-converted callbacks and test fakes.

fun interface Greeter {
    fun greet(name: String): String
}

fun callGreeter(name: String, g: Greeter): String = g.greet(name)

// ---------------------------------------------------------------------------
// Tour entry
// ---------------------------------------------------------------------------

fun tour(): List<String> = listOf(
    Dog("Rex", "lab").describe(),
    Circle(2.0).describe(),
    Rectangle(3.0, 4.0).describe(),
    ColoredCircle(1.0, 0xFF0000).draw(),
    ColoredCircle(1.0, 0xFF0000).bounds(),
    Point(0.0, 0.0).distanceTo(Point(3.0, 4.0)).toString(),
    Direction.NORTH.opposite().name,
    describe(UiState.Idle),
    describe(UiState.Loading(0.5f)),
    describe(UiState.Ready("hello")),
    describe(UiState.Error("boom")),
    Counter.inc().toString(),
    Counter.inc().toString(),
    Counter.value().toString(),
    User.named("Ada").describe(),
    User.anonymous().describe(),
    Outer("x").Nested().hello(),
    Outer("x").Inner().hello(),
    callGreeter("world", Greeter { "Hi, $it" }),
)
