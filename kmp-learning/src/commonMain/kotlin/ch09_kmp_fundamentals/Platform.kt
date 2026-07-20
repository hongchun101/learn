/*
 * ch09_kmp_fundamentals / Platform.kt
 *
 * The `expect` declarations that every target must implement. The
 * `actual` implementations live in `jvmMain` (this repo's verified
 * target) and would live in `androidMain`, `iosMain`, `jsMain`, and
 * `nativeMain` in a real multi-target project.
 *
 * Read this file first; it's the contract every KMP module starts
 * with.
 */
@file:Suppress("unused")

package ch09_kmp_fundamentals

/**
 * The runtime information every target provides. On JVM, the
 * `actual` reads `System.getProperty("os.name")`; on iOS, it would
 * return "iOS"; on JS, "JS".
 */
expect object PlatformContext {
    val osName: String
    val arch: String
    val isDebug: Boolean
}

/**
 * Logging that every target supplies. The signature is identical
 * across targets; the actual implementation is the platform's
 * preferred logging channel.
 */
expect object PlatformLog {
    fun d(tag: String, message: String)
    fun w(tag: String, message: String, throwable: Throwable? = null)
    fun e(tag: String, message: String, throwable: Throwable? = null)
}

/**
 * A clock that returns the current instant. Every target's `actual`
 * uses the platform's preferred monotonic clock.
 */
expect object PlatformClock {
    fun nowEpochMillis(): Long
    fun nanoTime(): Long
}

/**
 * File-system operations that every target supports. The `expect`
 * API is small on purpose — only the operations that the curriculum
 * needs. A real KMP module would extend this.
 */
expect class PlatformFile(path: String) {
    val path: String
    fun exists(): Boolean
    fun readText(): String
    fun writeText(content: String)
    fun delete(): Boolean
}

/**
 * A factory for the platform's `PlatformFile`. Useful because the
 * JVM `File` constructor has different semantics from the iOS one.
 */
expect fun platformFile(path: String): PlatformFile
