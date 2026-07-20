/*
 * ch12_io_logging / Ch12IoLogging.kt
 *
 * File I/O and logging in `commonMain`. The file-system and the
 * logger are both `expect`/`actual` bridges. The lesson:
 *   - Wrap every platform API you need in an `expect`/`actual`.
 *   - The expected surface is small. Add more methods as the
 *     curriculum grows.
 *   - Use `withContext(Dispatchers.IO) { ... }` for blocking I/O so
 *     it doesn't sit on the wrong dispatcher.
 *
 * This file contains the commonMain; the JVM actuals live in
 * `jvmMain`.
 */
@file:Suppress("unused", "UNUSED_VARIABLE")

package ch12_io_logging

import ch09_kmp_fundamentals.PlatformClock
import ch09_kmp_fundamentals.PlatformLog
import ch09_kmp_fundamentals.platformFile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext

// ---------------------------------------------------------------------------
// 1. The Logger expect/actual (from ch09 reused here)
// ---------------------------------------------------------------------------
// We re-import the `PlatformLog` from ch09 rather than duplicate the
// bridge. This is the KMP way: the bridge lives in one place and is
// reused across modules.

fun logDebug(tag: String, message: String) = PlatformLog.d(tag, message)
fun logWarn(tag: String, message: String, t: Throwable? = null) = PlatformLog.w(tag, message, t)
fun logError(tag: String, message: String, t: Throwable? = null) = PlatformLog.e(tag, message, t)

// ---------------------------------------------------------------------------
// 2. File I/O in commonMain
// ---------------------------------------------------------------------------
// Every file-system call goes through `PlatformFile` (the bridge
// from ch09) and is wrapped in `withContext(Dispatchers.IO)`.

suspend fun readText(path: String): String = withContext(Dispatchers.IO) {
    platformFile(path).readText()
}

suspend fun writeText(path: String, content: String): Unit = withContext(Dispatchers.IO) {
    platformFile(path).writeText(content)
}

suspend fun exists(path: String): Boolean = withContext(Dispatchers.IO) {
    platformFile(path).exists()
}

suspend fun delete(path: String): Boolean = withContext(Dispatchers.IO) {
    platformFile(path).delete()
}

// ---------------------------------------------------------------------------
// 3. A higher-level repository pattern
// ---------------------------------------------------------------------------
// "Append a line if the file exists, create it otherwise" is a
// common KMP idiom.

class TxtRepository(private val path: String) {
    suspend fun append(line: String) = withContext(Dispatchers.IO) {
        val f = platformFile(path)
        val current = if (f.exists()) f.readText() else ""
        f.writeText(current + line + "\n")
    }

    suspend fun lines(): List<String> = withContext(Dispatchers.IO) {
        val f = platformFile(path)
        if (!f.exists()) emptyList() else f.readText().lines().filter { it.isNotEmpty() }
    }
}

// ---------------------------------------------------------------------------
// 4. The structured-logging pattern
// ---------------------------------------------------------------------------
// A small wrapper that prepends a tag and a timestamp. Useful when
// you want consistent log lines across platforms.

class TaggedLogger(private val tag: String) {
    fun d(message: String) = logDebug(tag, "$message (at ${PlatformClock.nowEpochMillis()})")
    fun w(message: String, t: Throwable? = null) = logWarn(tag, message, t)
    fun e(message: String, t: Throwable? = null) = logError(tag, message, t)
}

// ---------------------------------------------------------------------------
// 5. Config-driven logging
// ---------------------------------------------------------------------------
// A "verbose" flag. In a real app this is wired to a build-time
// constant or a runtime preference.

class LogConfig(val verbose: Boolean) {
    val repoLogger = TaggedLogger("repo")
    val netLogger = TaggedLogger("net")
}

// ---------------------------------------------------------------------------
// 6. CSV-like "small database" file
// ---------------------------------------------------------------------------
// A 30-line append-only file format. Used to demonstrate file I/O
// without dragging in a real database.

class CsvFile(private val path: String) {
    suspend fun appendRow(vararg cells: String) = withContext(Dispatchers.IO) {
        val f = platformFile(path)
        val line = cells.joinToString(",")
        val current = if (f.exists()) f.readText() else ""
        f.writeText(current + line + "\n")
    }

    suspend fun readRows(): List<List<String>> = withContext(Dispatchers.IO) {
        val f = platformFile(path)
        if (!f.exists()) emptyList() else f.readText().lines()
            .filter { it.isNotEmpty() }
            .map { it.split(",") }
    }
}

// ---------------------------------------------------------------------------
// Tour
// ---------------------------------------------------------------------------

fun tour(): List<String> = runBlocking {
    val items = mutableListOf<String>()
    val repo = TxtRepository("kmp-learning-notes.txt")
    items += exists("kmp-learning-notes.txt").toString()
    repo.append("line 1")
    repo.append("line 2")
    items += repo.lines().toString()

    val cfg = LogConfig(verbose = true)
    cfg.repoLogger.d("ready")
    cfg.netLogger.w("slow", RuntimeException("simulated"))
    items += "logged"

    val csv = CsvFile("kmp-learning-csv.txt")
    csv.appendRow("name", "age", "city")
    csv.appendRow("Ada", "36", "London")
    csv.appendRow("Boris", "27", "Berlin")
    items += csv.readRows().toString()

    items
}
