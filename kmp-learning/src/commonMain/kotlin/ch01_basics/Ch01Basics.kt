/*
 * ch01_basics / Ch01Basics.kt
 *
 * Kotlin language fundamentals every KMP developer needs.
 *
 * This single file is intentionally dense: it is a tour of the language
 * pieces you'll meet in every chapter that follows. The accompanying
 * test file (`Ch01BasicsTest`) pins the contracts so a refactor cannot
 * silently change the semantics.
 *
 * Topics covered (in order, top to bottom):
 *  1. Variable declarations: `val` vs `var`, top-level vs local
 *  2. Primitive types and the truth about `Int`/`Long` on every target
 *  3. String templates, raw strings, multi-line strings
 *  4. Control flow: `if`, `when`, `for`, `while`, ranges
 *  5. Functions: default args, named args, varargs, single-expression
 *  6. Null safety: nullable types, safe call, elvis, `!!`, `let`
 *  7. Equality: structural (`==`) vs referential (`===`)
 *  8. Type checks and smart casts: `is`, `as`, smart cast
 *  9. The `Nothing` type and unreachable code
 * 10. Standard library essentials: `Pair`, `Triple`, `Result`, ranges
 */
@file:Suppress("unused", "UNUSED_VARIABLE", "KotlinConstantConditions")

package ch01_basics

import kotlin.contracts.ExperimentalContracts
import kotlin.contracts.contract
import kotlin.math.PI
import kotlin.math.sqrt

// ---------------------------------------------------------------------------
// 1. Variable declarations
// ---------------------------------------------------------------------------
// `val` is the default. `var` is reserved for places where the value
// genuinely needs to change. Top-level `val` in a Kotlin file is a
// compile-time constant for `const val` (primitive / String only) or
// a runtime constant otherwise.

const val MAX_USERS: Int = 1_000_000       // compile-time constant
val APP_NAME: String = "kmp-learning"       // runtime constant, top-level
var counter: Int = 0                        // mutable, top-level — avoid unless necessary

fun incrementCounter(): Int {
    counter += 1
    return counter
}

// ---------------------------------------------------------------------------
// 2. Primitive types
// ---------------------------------------------------------------------------
// On the JVM, `Int` is `int` and `Long` is `long`. On JS, `Int` is
// `number` and `Long` is emulated (yes, the bit-precise emulation
// that the Kotlin/JS team wrote). On Native, `Int` is `int` and
// `Long` is `long` on 64-bit and `long long` on 32-bit. **Code that
// relies on `Long` being 64-bit is correct on every target** because
// Kotlin guarantees it; code that relies on `Int` being exactly the
// platform word size is wrong.

val anInt: Int = 42
val aLong: Long = 42L
val aDouble: Double = 3.14
val aFloat: Float = 3.14f
val aBoolean: Boolean = true
val aChar: Char = 'A'

// ---------------------------------------------------------------------------
// 3. Strings
// ---------------------------------------------------------------------------

val greeting: String = "Hello, $APP_NAME!"
val radius: Double = 2.0
val area: String = "πr² = ${PI * radius * radius}"

// Raw strings: no escaping, no interpolation. Good for JSON, regex,
// multi-line text.
val multi: String = """
    line 1
    line 2 with $APP_NAME
    line 3
""".trimIndent()

// ---------------------------------------------------------------------------
// 4. Control flow
// ---------------------------------------------------------------------------

fun describe(n: Int): String = when {
    n < 0 -> "negative"
    n == 0 -> "zero"
    n in 1..9 -> "single-digit"
    n in 10..99 -> "double-digit"
    else -> "big"
}

fun fizzBuzz(n: Int): String = when {
    n % 15 == 0 -> "FizzBuzz"
    n % 3 == 0 -> "Fizz"
    n % 5 == 0 -> "Buzz"
    else -> n.toString()
}

// `when` as a switch. The subject can be a sealed type, an enum, an
// Int, a String, or any combination via `when (x) { ... }`.
fun describeColor(c: String): String = when (c) {
    "red" -> "warm"
    "blue" -> "cool"
    else -> "unknown"
}

// `for` over a range. `1..10` inclusive, `1 until 10` exclusive,
// `10 downTo 1` descending, `1..10 step 2` stepping.
fun sumRange(a: Int, b: Int): Int {
    var s = 0
    for (i in a..b) s += i
    return s
}

// `for` over a collection.
fun sumList(xs: List<Int>): Int {
    var s = 0
    for (x in xs) s += x
    return s
}

// `for` with index.
fun indexed(xs: List<String>): String =
    xs.mapIndexed { i, x -> "$i:$x" }.joinToString(" ")

// ---------------------------------------------------------------------------
// 5. Functions
// ---------------------------------------------------------------------------

// Default argument + named argument.
fun greet(name: String, greeting: String = "Hello", punctuation: String = "!"): String =
    "$greeting, $name$punctuation"

// Varargs. The spread operator `*` unpacks a list at the call site.
fun sumAll(vararg xs: Int): Int = xs.sum()

// Single-expression function. No curly braces, return type inferred.
fun double(n: Int): Int = n * 2

// A function that returns `Unit` (Kotlin's "no value"). The default
// return type of a function with no body is `Unit`; you can omit it.
fun log(message: String) {
    println(message)
}

// ---------------------------------------------------------------------------
// 6. Null safety
// ---------------------------------------------------------------------------

// The type system splits "this can be null" from "this cannot be null".
// A non-nullable type is the default; a `?` makes it nullable.

fun lengthOrZero(s: String?): Int = s?.length ?: 0

// `let` runs the block when the receiver is non-null. The block's
// argument is the non-null value.
fun firstChar(s: String?): Char? = s?.let { it[0] }

// `!!` is the "I know better than the compiler" operator. It throws
// `NullPointerException` if the value is null. **Use it sparingly**;
// prefer safe call + elvis.
fun definitelyNotNull(s: String?): Int = s!!.length

// ---------------------------------------------------------------------------
// 7. Equality
// ---------------------------------------------------------------------------

data class Money(val amount: Long, val currency: String)

fun equality(): Boolean {
    val a = Money(100, "USD")
    val b = Money(100, "USD")
    val c = a

    val structural = a == b      // true — calls data class equals
    val referential = a === b    // false — different instances
    val sameRef = a === c        // true — same reference

    return structural && !referential && sameRef
}

// ---------------------------------------------------------------------------
// 8. Type checks and smart casts
// ---------------------------------------------------------------------------

@OptIn(ExperimentalContracts::class)
fun isPositive(n: Any?): Boolean {
    contract { returns(true) implies (n is Int) }
    return n is Int && n > 0
}

fun smartCast(x: Any): String = when (x) {
    is Int -> "int ${x + 1}"          // smart-cast to Int
    is String -> "str ${x.length}"    // smart-cast to String
    is List<*> -> "list ${x.size}"
    else -> "other"
}

// ---------------------------------------------------------------------------
// 9. `Nothing` — the bottom type
// ---------------------------------------------------------------------------

// A function that always throws has return type `Nothing`. This is
// the "bottom" of the type system; every type is a subtype of
// `Nothing`. A `Nothing` return is useful in `when` branches to
// signal "this case is impossible".

fun fail(message: String): Nothing = throw IllegalStateException(message)

fun parseOrFail(input: String): Int = when {
    input.toIntOrNull() != null -> input.toInt()
    else -> fail("not an int: $input")
}

// ---------------------------------------------------------------------------
// 10. Standard library essentials
// ---------------------------------------------------------------------------

fun pairExample(): Pair<Int, String> = 1 to "one"
fun tripleExample(): Triple<Int, String, Boolean> = Triple(1, "a", true)

// `Result` is a built-in sum type for "the operation may fail".
// Use it for synchronous failures. For coroutines, use the
// structured-concurrency exception model instead.
fun safeDivide(a: Int, b: Int): Result<Int> = runCatching { a / b }

// Ranges.
val inclusive: IntRange = 1..10
val exclusive: IntRange = 1 until 10
val descending: IntProgression = 10 downTo 1
val stepping: IntProgression = 0..100 step 5

// ---------------------------------------------------------------------------
// Public surface for tests
// ---------------------------------------------------------------------------

/** The one-stop tour entry point. */
fun tour(): List<String> = listOf(
    greeting,
    area,
    describe(5),
    describe(100),
    fizzBuzz(15),
    fizzBuzz(7),
    describeColor("red"),
    describeColor("purple"),
    sumRange(1, 10).toString(),
    sumList(listOf(1, 2, 3)).toString(),
    indexed(listOf("a", "b", "c")),
    greet("Ada"),
    greet("Ada", greeting = "Hi", punctuation = "."),
    sumAll(1, 2, 3, 4).toString(),
    lengthOrZero(null).toString(),
    lengthOrZero("abc").toString(),
    firstChar("hello").toString(),
    equality().toString(),
    smartCast(42),
    smartCast("hello"),
    smartCast(listOf(1, 2, 3)),
    pairExample().toString(),
    tripleExample().toString(),
    safeDivide(10, 2).toString(),
    safeDivide(10, 0).toString(),
    parseOrFail("42").toString(),
    sqrt(16.0).toString(),
)
