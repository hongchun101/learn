/*
 * ch13_testing / Ch13Testing.kt
 *
 * The kotlin.test framework: the cross-platform test API that works
 * on every target. The mental model:
 *
 *   - `kotlin.test.assertEquals(expected, actual)` and friends are
 *     the cross-platform assertion API. Each target maps them to
 *     JUnit (JVM), XCTest (iOS native), Jest (JS), etc.
 *   - `kotlinx.coroutines.test.runTest { ... }` is the structured
 *     way to test suspending code. The test scheduler advances time
 *     deterministically.
 *   - Tests live in `commonTest/kotlin/...` and are run on every
 *     target. JVM-only tests live in `jvmTest/kotlin/...`.
 *
 * This file is the cross-platform test surface. The actual test
 * classes live in `commonTest/`.
 */
@file:Suppress("unused")

package ch13_testing

// ---------------------------------------------------------------------------
// 1. The contract that every target's tests must honour
// ---------------------------------------------------------------------------
// A "test contract" is a function or class that the test uses to
// exercise a behaviour. The test is the documentation; the contract
// is the code under test.

/** A pure function that the test will exercise. */
fun add(a: Int, b: Int): Int = a + b

/** A function with a side effect that the test will exercise. */
fun sideEffectCounter(start: Int = 0): () -> Int {
    var n = start
    return { n += 1; n }
}

/** A suspending function that the test will exercise. */
suspend fun loadAfter(delayMs: Long, value: String): String {
    kotlinx.coroutines.delay(delayMs)
    return value
}

// ---------------------------------------------------------------------------
// 2. The test categories you'll write
// ---------------------------------------------------------------------------
//
//   1. Unit tests: assertEqual, assertTrue, assertFailsWith, ...
//   2. Suspending tests: same as unit, but in a coroutine builder
//      that supplies a `TestScope` (e.g., `runTest`).
//   3. Flow tests: collect into a list, assert, advance time.
//   4. Test doubles: fakes for repositories, mocks for HTTP.
//   5. Integration tests: JVM-only, exercise the actual classes.
//
// The shape of every test category is the same:
//
//   @Test
//   fun `description of behaviour`() = runTest {
//       val actual = ...
//       assertEquals(expected, actual)
//   }

// ---------------------------------------------------------------------------
// 3. The "rule of three" for tests
// ---------------------------------------------------------------------------
// Every behaviour the chapter promises should be exercised by at
// least one happy-path test, one boundary test, and one failure
// test. The `Ch13TestingTest` class demonstrates the pattern.

/** Function that returns null half the time — for failure tests. */
fun maybeNull(flag: Boolean): String? = if (flag) "ok" else null

/** Function that throws on bad input — for failure tests. */
fun checkedDivide(a: Int, b: Int): Int {
    if (b == 0) throw IllegalArgumentException("divide by zero")
    return a / b
}
