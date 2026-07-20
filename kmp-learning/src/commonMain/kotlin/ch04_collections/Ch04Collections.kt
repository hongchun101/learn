/*
 * ch04_collections / Ch04Collections.kt
 *
 * The Kotlin collection system: List, Set, Map and their read-only /
 * mutable split, plus `Sequence` (lazy) vs `Iterable` (eager), plus
 * ranges and arrays.
 *
 * The mental model:
 *   - `List<T>`, `Set<T>`, `Map<K, V>`  — read-only interfaces.
 *   - `MutableList<T>`, `MutableSet<T>`, `MutableMap<K, V>`  — read/write.
 *   - `listOf(...)` / `mutableListOf(...)`  — factory functions.
 *   - `arrayOf(...)`  — Kotlin arrays, boxed for object types.
 *   - `sequence { ... }` / `asSequence()`  — lazy pipelines.
 */
@file:Suppress("unused", "UNUSED_VARIABLE")

package ch04_collections

// ---------------------------------------------------------------------------
// 1. List, Set, Map — read-only by default
// ---------------------------------------------------------------------------

fun readOnlyCollections(): Triple<List<Int>, Set<String>, Map<String, Int>> {
    val l: List<Int> = listOf(1, 2, 3, 3)        // duplicates kept, order preserved
    val s: Set<String> = setOf("a", "b", "a")    // duplicates dropped
    val m: Map<String, Int> = mapOf("a" to 1, "b" to 2)
    return Triple(l, s, m)
}

// ---------------------------------------------------------------------------
// 2. Mutable variants
// ---------------------------------------------------------------------------

fun mutableListOps(): List<Int> {
    val xs = mutableListOf(1, 2, 3)
    xs.add(4)
    xs.addAll(listOf(5, 6))
    xs.remove(2)
    xs[0] = 10
    return xs.toList()
}

// ---------------------------------------------------------------------------
// 3. The transformation pipeline
// ---------------------------------------------------------------------------
// `map`, `filter`, `reduce`, `fold`, `flatMap`, `groupBy`, `associate`,
// `zip`, `windowed`, `chunked`, `partition`. These are the same
// operations on every collection.

data class Order(val id: Long, val total: Double, val status: String)

fun pipeline(orders: List<Order>): Map<String, Double> =
    orders
        .filter { it.status == "PAID" }
        .groupBy { it.status }
        .mapValues { (_, v) -> v.sumOf { it.total } }

// ---------------------------------------------------------------------------
// 4. Sequence — lazy evaluation
// ---------------------------------------------------------------------------
// A `Sequence` is a lazy pipeline. Each step runs only when the
// terminal operation demands the next element. Use it for large or
// potentially infinite streams where intermediate lists would waste
// memory.

fun firstNSquaredEven(n: Int): Int =
    generateSequence(1) { it + 1 }
        .filter { it % 2 == 0 }
        .map { it * it }
        .take(n)
        .sum()

// `sequence { yield(...) }` is a coroutine-flavoured sequence.
fun naturals(): Sequence<Int> = sequence {
    var n = 1
    while (true) yield(n++)
}

// ---------------------------------------------------------------------------
// 5. Ranges
// ---------------------------------------------------------------------------

fun rangeOps(): List<String> = listOf(
    (1..10).sum().toString(),                        // 55
    (1..10 step 2).toList().toString(),              // 1, 3, 5, 7, 9
    (10 downTo 1).first().toString(),                // 10
    ('a'..'z').count().toString(),                   // 26
    (1 until 5).toList().toString(),                 // 1, 2, 3, 4
)

// ---------------------------------------------------------------------------
// 6. Arrays
// ---------------------------------------------------------------------------
// `Array<T>` is a Kotlin class; `IntArray` is a primitive-array
// specialisation (no boxing). The factory functions differ:
//
//   arrayOf(1, 2, 3)        -> Array<Int>     (boxed)
//   intArrayOf(1, 2, 3)     -> IntArray       (primitive)
//
// For multiplatform code, prefer `Array<T>` (works on every target)
// and use `IntArray` etc. only when performance demands it.

fun arrayOps(): String {
    val boxed: Array<String> = arrayOf("a", "b", "c")
    val primitive: IntArray = intArrayOf(1, 2, 3)
    return "${boxed.toList()} ${primitive.sum()}"
}

// ---------------------------------------------------------------------------
// 7. Specific collection types
// ---------------------------------------------------------------------------
// `List` — ordered, can have duplicates.
// `Set`  — no duplicates; iteration order is the implementation's.
// `Map`  — key -> value; keys are unique.
// `ArrayDeque` — double-ended queue, O(1) add/remove at both ends.
// `HashMap`, `LinkedHashMap`, `TreeMap`, `HashSet`, `LinkedHashSet`,
// `TreeSet` — when you need the specific performance contract.

fun collectionTypes(): List<String> = listOf(
    ArrayDeque<Int>().apply { addLast(1); addLast(2); addFirst(0) }.toList().toString(),
    sortedSetOf(3, 1, 2).toString(),          // [1, 2, 3]
    sortedMapOf("c" to 3, "a" to 1).toString(), // {a=1, c=3}
)

// ---------------------------------------------------------------------------
// 8. Collection operations catalogue
// ---------------------------------------------------------------------------

fun opsCatalogue(): List<String> {
    val xs = listOf(1, 2, 3, 4, 5, 6)
    return listOf(
        xs.filter { it % 2 == 0 }.toString(),                       // [2, 4, 6]
        xs.map { it * it }.toString(),                              // [1, 4, 9, 16, 25, 36]
        xs.reduce { acc, n -> acc + n }.toString(),                 // 21
        xs.fold(100) { acc, n -> acc + n }.toString(),              // 121
        xs.any { it > 5 }.toString(),                               // true
        xs.all { it > 0 }.toString(),                               // true
        xs.none { it < 0 }.toString(),                              // true
        xs.count { it % 2 == 0 }.toString(),                        // 3
        xs.partition { it % 2 == 0 }.toString(),                    // ([2, 4, 6], [1, 3, 5])
        xs.groupBy { it % 2 }.toString(),                           // {1=[1,3,5], 0=[2,4,6]}
        xs.chunked(2).toString(),                                   // [[1,2],[3,4],[5,6]]
        xs.windowed(3).toString(),                                  // [[1,2,3],[2,3,4],[3,4,5],[4,5,6]]
        xs.zip(listOf("a","b","c","d","e","f")).toString(),        // [(1,a), (2,b), ...]
        xs.takeWhile { it < 4 }.toString(),                         // [1, 2, 3]
        xs.dropWhile { it < 4 }.toString(),                         // [4, 5, 6]
        xs.sum().toString(),                                        // 21
        xs.average().toString(),                                    // 3.5
    )
}

// ---------------------------------------------------------------------------
// 9. Empty collections
// ---------------------------------------------------------------------------
// `emptyList()`, `emptySet()`, `emptyMap()` return singletons.
// Prefer them over `listOf()` etc. for the empty case.

fun isEmpty(xs: List<*>): Boolean = xs.isEmpty()

// ---------------------------------------------------------------------------
// Tour
// ---------------------------------------------------------------------------

fun tour(): List<String> = listOf(
    readOnlyCollections().toString(),
    mutableListOps().toString(),
    pipeline(listOf(
        Order(1, 10.0, "PAID"),
        Order(2, 20.0, "PENDING"),
        Order(3, 30.0, "PAID"),
    )).toString(),
    firstNSquaredEven(3).toString(),
    rangeOps().toString(),
    arrayOps(),
    collectionTypes().toString(),
    opsCatalogue().toString(),
    isEmpty(emptyList<String>()).toString(),
    isEmpty(listOf(1)).toString(),
)
