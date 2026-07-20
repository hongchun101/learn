/*
 * ch05_functional / Ch05Functional.kt
 *
 * The functional style of Kotlin: lambdas, higher-order functions,
 * scope functions, extensions, infix, operator overloading, and the
 * DSL building blocks. This chapter is the bridge between "I know
 * Kotlin syntax" and "I can read any Kotlin library".
 */
@file:Suppress("unused", "UNUSED_VARIABLE")

package ch05_functional

// ---------------------------------------------------------------------------
// 1. Lambdas
// ---------------------------------------------------------------------------
// `{ a: Int, b: Int -> a + b }`. The compiler infers parameter and
// return types from context. Single-parameter lambdas get the
// implicit `it` name. Trailing-lambda syntax: `f(xs) { x -> ... }`.

val add: (Int, Int) -> Int = { a, b -> a + b }
val isEven: (Int) -> Boolean = { it % 2 == 0 }

// Function reference: `::functionName` passes the function as a value.
fun double(n: Int): Int = n * 2
val doubler: (Int) -> Int = ::double

// A function that takes a lambda parameter.
fun List<Int>.customMap(f: (Int) -> Int): List<Int> {
    val out = ArrayList<Int>(size)
    for (x in this) out.add(f(x))
    return out
}

// ---------------------------------------------------------------------------
// 2. Higher-order functions
// ---------------------------------------------------------------------------
// A function that takes a function or returns a function.

fun repeat(n: Int, action: (Int) -> Unit) {
    for (i in 0 until n) action(i)
}

fun makeAdder(delta: Int): (Int) -> Int = { it + delta }

// ---------------------------------------------------------------------------
// 3. Scope functions: let, run, with, apply, also
// ---------------------------------------------------------------------------
// Each is a one-liner. The differences:
//   - let / also      use `it`           (lambda arg is the receiver)
//   - run / with      use `this`         (lambda body is the receiver)
//   - let / run       RETURN the lambda's last value
//   - apply / also    RETURN the receiver

data class Connection(val url: String) {
    fun open() { /* ... */ }
    fun close() { /* ... */ }
}

fun configure(): Connection {
    val conn = Connection("jdbc://example").apply {
        open()
    }
    return conn
}

fun uppercaseOrNull(s: String?): String? = s?.let { it.uppercase() }

// ---------------------------------------------------------------------------
// 4. Closures
// ---------------------------------------------------------------------------
// A lambda captures the variables of the enclosing scope. Kotlin
// captures `val` by value and `var` through a `Ref` object — so
// multiple lambdas sharing the same `var` see updates to it.

fun makeCounter(): () -> Int {
    var n = 0
    return { n += 1; n }
}

// ---------------------------------------------------------------------------
// 5. Extensions
// ---------------------------------------------------------------------------
// Add functions to types you don't own. The receiver `this` is
// available inside the body. Extensions cannot access private members
// of the receiver — they are public API.

fun String.lastChar(): Char = this[length - 1]
fun Int.isPrime(): Boolean {
    if (this < 2) return false
    for (i in 2..this / 2) if (this % i == 0) return false
    return true
}

// Extension properties: a getter-only property on a foreign type.
val String.words: List<String>
    get() = split(" ")

// ---------------------------------------------------------------------------
// 6. Infix functions
// ---------------------------------------------------------------------------
// A function marked `infix` can be called with the operator syntax:
//   `a to b` instead of `a.to(b)`. Pair's `to` is the canonical
// example.

infix fun String.rotatedBy(places: Int): String {
    val n = ((places % length) + length) % length
    return drop(n) + take(n)
}

// ---------------------------------------------------------------------------
// 7. Operator overloading
// ---------------------------------------------------------------------------
// `operator fun plus` enables `a + b`. Each operator has a fixed
// function name; the compiler maps syntax to the function.

data class Vec2(val x: Double, val y: Double) {
    operator fun plus(other: Vec2) = Vec2(x + other.x, y + other.y)
    operator fun unaryMinus() = Vec2(-x, -y)
    operator fun times(scalar: Double) = Vec2(x * scalar, y * scalar)

    companion object {
        val ZERO = Vec2(0.0, 0.0)
    }
}

// Indexed access `[]` is `get`/`set`.
data class Matrix(val rows: Int, val cols: Int, val data: DoubleArray) {
    operator fun get(r: Int, c: Int): Double = data[r * cols + c]
    operator fun set(r: Int, c: Int, v: Double) { data[r * cols + c] = v }
}

// `in` is `contains`. Ranges implement it.
operator fun List<Vec2>.containsOrigin(): Boolean = any { it.x == 0.0 && it.y == 0.0 }

// ---------------------------------------------------------------------------
// 8. DSL construction
// ---------------------------------------------------------------------------
// The "function with lambda receiver" pattern. The `Html` example
// below is a small DSL; `buildList { }` and `apply { }` are the
// everyday use.

class Html {
    private val parts = mutableListOf<String>()

    fun head(block: Head.() -> Unit) { parts += "<head>" + Head().apply(block).render() + "</head>" }
    fun body(block: Body.() -> Unit) { parts += "<body>" + Body().apply(block).render() + "</body>" }

    fun render(): String = parts.joinToString("")
}

class Head {
    private val parts = mutableListOf<String>()
    fun title(text: String) { parts += "<title>$text</title>" }
    fun render(): String = parts.joinToString("")
}

class Body {
    private val parts = mutableListOf<String>()
    fun h1(text: String) { parts += "<h1>$text</h1>" }
    fun p(text: String) { parts += "<p>$text</p>" }
    fun render(): String = parts.joinToString("")
}

fun html(block: Html.() -> Unit): String = Html().apply(block).render()

// `buildList { add(...); add(...) }` — a generic DSL for builders.
fun makeList(): List<Int> = buildList {
    add(1); add(2); add(3)
}

// `apply { }` chain style.
data class Config(val name: String, val debug: Boolean)

fun newConfig(): Config = Config("kmp", false).apply {
    println("configured: $name (debug=$debug)")
}

// ---------------------------------------------------------------------------
// 9. Function composition
// ---------------------------------------------------------------------------
// `andThen` and `compose` chain functions left-to-right or
// right-to-left.

infix fun <A, B, C> ((A) -> B).andThen(g: (B) -> C): (A) -> C = { a -> g(this(a)) }

infix fun <A, B, C> ((B) -> C).compose(f: (A) -> B): (A) -> C = { a -> this(f(a)) }

fun compositionDemo(): Int {
    val inc: (Int) -> Int = { it + 1 }
    val double: (Int) -> Int = { it * 2 }
    val incThenDouble = inc andThen double           // 5 -> 6 -> 12
    val doubleThenInc = inc compose double           // 5 -> 10 -> 11
    return incThenDouble(5) - doubleThenInc(5)        // 12 - 11 = 1
}

// ---------------------------------------------------------------------------
// Tour
// ---------------------------------------------------------------------------

fun tour(): List<String> = listOf(
    add(2, 3).toString(),
    isEven(4).toString(),
    doubler(5).toString(),
    listOf(1, 2, 3).customMap { it * it }.toString(),
    makeAdder(10)(5).toString(),
    configure().url,
    uppercaseOrNull(null) ?: "null",
    "hello".lastChar().toString(),
    7.isPrime().toString(),
    "the quick brown fox".words.toString(),
    "kotlin" rotatedBy 2,
    (Vec2(1.0, 2.0) + Vec2(3.0, 4.0)).toString(),
    (-Vec2(1.0, 2.0)).toString(),
    (Vec2(1.0, 2.0) * 3.0).toString(),
    (Matrix(2, 2, doubleArrayOf(1.0, 2.0, 3.0, 4.0))[0, 1]).toString(),
    html {
        head { title("KMP") }
        body {
            h1("Hello, KMP")
            p("From the DSL builder")
        }
    },
    makeList().toString(),
    newConfig().toString(),
    compositionDemo().toString(),
)
