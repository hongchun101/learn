/*
 * ch09_kmp_fundamentals / Platform.kt (JVM actual)
 *
 * The JVM-side `actual` implementations of the `expect`s declared in
 * `commonMain`. In a multi-target project, sibling files would
 * supply the iOS, Android, JS, and Native actuals.
 */
@file:Suppress("unused", "MemberVisibilityCanBePrivate")

package ch09_kmp_fundamentals

import java.io.File
import java.util.logging.Level
import java.util.logging.Logger

actual object PlatformContext {
    actual val osName: String = System.getProperty("os.name") ?: "unknown"
    actual val arch: String = System.getProperty("os.arch") ?: "unknown"
    actual val isDebug: Boolean = (System.getProperty("kmp.debug")?.toBoolean() ?: true)
}

actual object PlatformLog {
    private val logger = Logger.getLogger("kmp-learning")

    actual fun d(tag: String, message: String) {
        logger.log(Level.FINE, "[$tag] $message")
    }

    actual fun w(tag: String, message: String, throwable: Throwable?) {
        logger.log(Level.WARNING, "[$tag] $message", throwable)
    }

    actual fun e(tag: String, message: String, throwable: Throwable?) {
        logger.log(Level.SEVERE, "[$tag] $message", throwable)
    }
}

actual object PlatformClock {
    actual fun nowEpochMillis(): Long = System.currentTimeMillis()
    actual fun nanoTime(): Long = System.nanoTime()
}

actual class PlatformFile actual constructor(private val rawPath: String) {
    actual val path: String = rawPath
    private val delegate: File = File(rawPath)

    actual fun exists(): Boolean = delegate.exists()
    actual fun readText(): String = delegate.readText(Charsets.UTF_8)
    actual fun writeText(content: String) {
        delegate.writeText(content, Charsets.UTF_8)
    }
    actual fun delete(): Boolean = delegate.delete()
}

actual fun platformFile(path: String): PlatformFile = PlatformFile(path)
