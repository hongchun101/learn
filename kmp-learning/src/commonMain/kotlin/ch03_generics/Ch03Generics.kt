/*
 * ch03_generics / Ch03Generics.kt
 *
 * Kotlin's generics cover more than Java's: variance, reified types,
 * star projection, and where clauses are all first-class.
 *
 * What this file teaches:
 *  1. Generic functions
 *  2. Generic classes (Box, Pair, List)
 *  3. Upper bounds (`T : Number`)
 *  4. Variance: declaration-site (`out` / `in`) and use-site (`*`)
 *  5. `reified` + `inline` for runtime type information
 *  6. `where` clauses for multiple bounds
 *  7. Type erasure and what survives
 */
@file:Suppress("unused", "UNUSED_VARIABLE")

package ch03_generics

// ---------------------------------------------------------------------------
// 1. Generic function
// ---------------------------------------------------------------------------
// `<T>` introduces a type parameter. The compiler infers `T` at the
// call site, or you can pass it explicitly: `identity<Int>(42)`.

fun <T> identity(value: T): T = value

fun <T> firstOf(items: List<T>, default: T): T = items.firstOrNull() ?: default

// ---------------------------------------------------------------------------
// 2. Generic class
// ---------------------------------------------------------------------------
// `Box<T>` is "a holder for one value of type T". The standard
// library's `List<T>`, `Map<K, V>`, `Set<T>` are all generic classes.

class Box<T : Any>(initial: T) {
    private var value: T = initial

    fun get(): T = value
    fun set(newValue: T) {
        value = newValue
    }

    fun <R> transform(fn: (T) -> R): R = fn(value)
}

// A two-parameter generic. Note the `where` clause (see §6).
class Pair<A, B>(val first: A, val second: B) {
    fun <R> map(f: (A) -> R): Pair<R, B> = Pair(f(first), second)
}

// ---------------------------------------------------------------------------
// 3. Upper bounds
// ---------------------------------------------------------------------------
// `<T : Comparable<T>>` says "T must be comparable with itself". This
// lets the function use `compareTo`.

fun <T : Comparable<T>> maxOf(a: T, b: T): T = if (a >= b) a else b

// A more complex upper bound: "T must be a Number AND Comparable".
fun <T> sumOfNumbers(xs: List<T>): Double where T : Number, T : Comparable<T> {
    var s = 0.0
    for (x in xs) s += x.toDouble()
    return s
}

// ---------------------------------------------------------------------------
// 4. Variance: declaration-site
// ---------------------------------------------------------------------------
// `out T` means "T is produced, never consumed". A `Producer<Dog>` is
// a `Producer<Animal>`. The compiler will not let you put a value
// into a `Producer` of `out T`.
//
// `in T` means "T is consumed, never produced". A `Consumer<Animal>`
// is a `Consumer<Dog>`. The compiler will not let you read a value
// out of a `Consumer` of `in T`.

interface Producer<out T> {
    fun produce(): T
}

interface Consumer<in T> {
    fun consume(item: T)
}

// The classic use case: `List<T>` is declared `List<out T>`, so
// `List<Dog>` is a `List<Animal>`. You can read animals from it but
// you cannot put a cat into a list declared as `List<out Animal>`.

// ---------------------------------------------------------------------------
// 5. Star projection: `*` — "I don't care about the type argument"
// ---------------------------------------------------------------------------
// `List<*>` is a "list of something"; you can read `Any?` out of it
// but you cannot put anything in. Useful at API boundaries where the
// producer/consumer cares about size, not about element type.

fun lengthOf(items: List<*>): Int = items.size

// ---------------------------------------------------------------------------
// 6. `where` clauses — multiple bounds
// ---------------------------------------------------------------------------
// `where T : A, T : B` is more readable than chained `:` when there
// are several bounds.

interface Named { val name: String }
interface Aged { val age: Int }

fun <T> describe(t: T): String where T : Named, T : Aged =
    "${t.name} (${t.age})"

data class Person(val name: String, val age: Int) : Named, Aged

// ---------------------------------------------------------------------------
// 7. `reified` + `inline`
// ---------------------------------------------------------------------------
// Type parameters are erased at runtime. The combination of
// `inline` and `reified` keeps the type around at the call site, so
// you can do `T::class`, `is T`, etc.

inline fun <reified T> loggerFor(): String = T::class.simpleName ?: "Unknown"

// A common pattern: type-safe JSON deserialisation. (See ch10 for the
// real thing.) The compiler checks the cast because `T` is reified.
inline fun <reified T : Any> List<*>.firstOfType(): T? =
    this.firstOrNull { it is T } as T?

// ---------------------------------------------------------------------------
// 8. Nothing and generics
// ---------------------------------------------------------------------------
// `Nothing` is the subtype of every other type. `List<Nothing>` is a
// list that can never hold a value; useful as a "no items yet"
// placeholder.

val empty: List<Nothing> = emptyList()

// ---------------------------------------------------------------------------
// 9. Generic constraints in inheritance
// ---------------------------------------------------------------------------
// A subclass can fix a parent's type parameter.

class StringList : Iterable<String> {
    private val items = mutableListOf<String>()
    fun add(s: String) { items.add(s) }
    override fun iterator(): Iterator<String> = items.iterator()
    fun toList(): List<String> = items.toList()
}

// ---------------------------------------------------------------------------
// Tour entry
// ---------------------------------------------------------------------------

class Animal2(val name: String)
class Dog2(name: String) : Animal2(name)

class AnimalProducer : Producer<Animal2> {
    override fun produce(): Animal2 = Animal2("generic-animal")
}

class StringConsumer : Consumer<String> {
    override fun consume(item: String) { /* ... */ }
}

fun tour(): List<String> = listOf(
    identity("x"),
    firstOf(listOf(1, 2, 3), 0).toString(),
    Box(42).transform { it * 2 }.toString(),
    Box("hi").transform { it.length }.toString(),
    maxOf(3, 5).toString(),
    maxOf("zebra", "apple").toString(),
    sumOfNumbers(listOf(1, 2, 3)).toString(),
    lengthOf(listOf(1, 2, 3, 4, 5)).toString(),
    describe(Person("Ada", 36)),
    loggerFor<String>(),
    loggerFor<List<Int>>(),
    listOf<Any>(1, "two", 3.0).firstOfType<String>() ?: "no string",
    Pair("name", 42).map { it.uppercase() }.toString(),
    empty.size.toString(),
    StringList().apply { add("a"); add("b") }.toList().toString(),
)
