package ch12_io_logging

import kotlinx.coroutines.runBlocking
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class Ch12IoLoggingTest {

    // Use a temp file for tests so we don't pollute the repo.
    private fun tmpFile(suffix: String = ".txt"): String {
        val f = File.createTempFile("kmp-learning-test-", suffix)
        f.deleteOnExit()
        return f.absolutePath
    }

    // --- File I/O basics -------------------------------------------------

    @Test fun `readText and writeText round-trip`() = runBlocking {
        val path = tmpFile()
        writeText(path, "hello\nworld")
        val text = readText(path)
        assertEquals("hello\nworld", text)
    }

    @Test fun `exists returns false for missing file`() = runBlocking {
        val path = tmpFile() + ".nonexistent"
        assertEquals(false, exists(path))
    }

    @Test fun `exists returns true after writeText`() = runBlocking {
        val path = tmpFile()
        writeText(path, "x")
        assertTrue(exists(path))
    }

    @Test fun `delete removes the file`() = runBlocking {
        val path = tmpFile()
        writeText(path, "x")
        assertTrue(exists(path))
        assertTrue(delete(path))
        assertEquals(false, exists(path))
    }

    // --- TxtRepository ---------------------------------------------------

    @Test fun `TxtRepository appends and reads lines`() = runBlocking {
        val path = tmpFile()
        val repo = TxtRepository(path)
        repo.append("a")
        repo.append("b")
        repo.append("c")
        assertEquals(listOf("a", "b", "c"), repo.lines())
    }

    @Test fun `TxtRepository on missing file returns empty list`() = runBlocking {
        val path = tmpFile() + ".nonexistent"
        val repo = TxtRepository(path)
        assertEquals(emptyList(), repo.lines())
    }

    // --- TaggedLogger ----------------------------------------------------

    @Test fun `TaggedLogger does not throw on debug or warn or error`() {
        val logger = TaggedLogger("test")
        logger.d("info")
        logger.w("warning")
        logger.e("error", RuntimeException("synthetic"))
    }

    // --- LogConfig -------------------------------------------------------

    @Test fun `LogConfig exposes both loggers`() {
        val cfg = LogConfig(verbose = true)
        cfg.repoLogger.d("ready")
        cfg.netLogger.w("slow")
    }

    // --- CsvFile ---------------------------------------------------------

    @Test fun `CsvFile appends and reads rows`() = runBlocking {
        val path = tmpFile(".csv")
        val csv = CsvFile(path)
        csv.appendRow("a", "b", "c")
        csv.appendRow("1", "2", "3")
        val rows = csv.readRows()
        assertEquals(listOf(listOf("a", "b", "c"), listOf("1", "2", "3")), rows)
    }

    @Test fun `CsvFile on missing file returns empty`() = runBlocking {
        val path = tmpFile(".csv") + ".nonexistent"
        val csv = CsvFile(path)
        assertEquals(emptyList(), csv.readRows())
    }

    // --- Tour ------------------------------------------------------------

    @Test fun `tour runs and produces results`() = runBlocking {
        // The tour creates real files in the working directory; this
        // is acceptable for a teaching project but we clean up.
        try {
            val items = tour()
            assertTrue(items.isNotEmpty())
            // Last item is the CSV rows, which include the header and
            // two data rows.
            assertTrue(items.last().contains("Ada"))
        } finally {
            listOf("kmp-learning-notes.txt", "kmp-learning-csv.txt").forEach { File(it).delete() }
        }
    }
}
