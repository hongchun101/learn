/*
 * ch18_capstone / Main.kt
 *
 * Top-level main for the JVM target. Run with:
 *   ./gradlew jvmRun
 * or
 *   kotlinc -classpath '...' MainKt -include-runtime -d main.jar
 *   java -jar main.jar
 *
 * In a real KMP project the iOS, Android, and JS entry points live
 * in their respective source sets; only the JVM one is here.
 */
@file:JvmName("MainKt")

package ch18_capstone

import ch09_kmp_fundamentals.PlatformContext

fun main() {
    println("=== KMP Capstone: cross-platform TODO app ===")
    println("Platform: ${PlatformContext.osName} / ${PlatformContext.arch}")
    println("Debug: ${PlatformContext.isDebug}")
    println()
    val items = tour()
    items.forEachIndexed { i, line -> println("[$i] $line") }
    println()
    println("=== done ===")
}
