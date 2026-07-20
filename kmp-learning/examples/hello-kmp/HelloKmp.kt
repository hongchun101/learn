/*
 * examples/hello-kmp/HelloKmp.kt
 *
 * A 30-line multiplatform "Hello, KMP" example. Shows the minimum
 * expect/actual pattern in one file each, plus a commonMain
 * consumer.
 *
 * Drop this into a real KMP project to confirm the toolchain is
 * working. Build with:
 *   ./gradlew jvmRun -PmainClass=examples.hello_kmp.HelloKmpKt
 */

@file:JvmName("HelloKmpKt")

package examples.hello_kmp

import kotlinx.coroutines.runBlocking

// --- The contract: every target implements this. ---
expect object Platform {
    val name: String
    fun nowMillis(): Long
}

// --- A simple common function. ---
suspend fun hello(): String {
    val now = Platform.nowMillis()
    return "Hello from ${Platform.name} at $now"
}

// --- The entry point. ---
fun main() = runBlocking {
    println(hello())
}
