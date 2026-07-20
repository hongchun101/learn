package ch09_kmp_fundamentals

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import kotlin.test.assertFalse

class Ch09KmpFundamentalsTest {

    // --- The contract is the same on every target ---

    @Test fun `PlatformContext exposes osName arch and debug`() {
        assertNotNull(PlatformContext.osName)
        assertNotNull(PlatformContext.arch)
        // isDebug is Boolean; we don't assert its value because the
        // JVM actual uses a system property that may differ.
        val _: Boolean = PlatformContext.isDebug
    }

    @Test fun `PlatformClock returns a non-decreasing nanoTime`() {
        val a = PlatformClock.nanoTime()
        val b = PlatformClock.nanoTime()
        assertTrue(b >= a)
    }

    @Test fun `PlatformClock epoch millis is roughly now`() {
        val now = System.currentTimeMillis()
        val platform = PlatformClock.nowEpochMillis()
        // JVM actual reuses System.currentTimeMillis; we allow a
        // 1-second slack for the clock being read at different
        // moments.
        assertTrue(kotlin.math.abs(now - platform) < 1_000)
    }

    // --- platformInfo composes the contract ---

    @Test fun `platformInfo pulls all expect values`() {
        val info = platformInfo()
        assertNotNull(info.osName)
        assertNotNull(info.arch)
        assertTrue(info.nowEpochMillis > 0L)
    }

    // --- File-system actuals (JVM) ---

    @Test fun `platformFile exists reports correctly`() {
        val existing = platformFile("build.gradle.kts")
        assertTrue(existing.exists())
    }

    @Test fun `platformFile readText returns the file content`() {
        val f = platformFile("build.gradle.kts")
        val text = f.readText()
        assertTrue(text.contains("kotlin-multiplatform"))
    }

    @Test fun `writeIfMissing does not overwrite`() {
        val f = platformFile("build.gradle.kts")
        // build.gradle.kts is always present; writeIfMissing should
        // return false without overwriting.
        val wrote = writeIfMissing("build.gradle.kts", "should not appear")
        assertFalse(wrote)
        val content = f.readText()
        assertFalse(content.contains("should not appear"))
    }

    @Test fun `readConfigOrDefault returns default when missing`() {
        val out = readConfigOrDefault("kmp-learning-no-such-file.txt", "<fallback>")
        assertEquals("<fallback>", out)
    }

    // --- The PlatformLog expect fires on JVM ---

    @Test fun `PlatformLog d we does not throw`() {
        PlatformLog.d("test", "debug")
        PlatformLog.w("test", "warning")
        PlatformLog.e("test", "error", RuntimeException("synthetic"))
    }

    // --- Tour ---

    @Test fun `tour produces the expected sequence`() {
        val items = tour()
        assertTrue(items.isNotEmpty())
        // osName, arch, isDebug, epoch millis, writeIfMissing, read, class name
        assertEquals(7, items.size)
        assertTrue(items[0].isNotBlank())
        assertTrue(items[1].isNotBlank())
    }
}
