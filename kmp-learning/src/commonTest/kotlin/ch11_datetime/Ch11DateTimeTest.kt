package ch11_datetime

import kotlinx.datetime.Clock
import kotlinx.datetime.DateTimePeriod
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.DayOfWeek
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.atStartOfDayIn
import kotlinx.datetime.daysUntil
import kotlinx.datetime.minus
import kotlinx.datetime.plus
import kotlinx.datetime.toLocalDateTime
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.time.Duration.Companion.days
import kotlin.time.Duration.Companion.seconds

class Ch11DateTimeTest {

    // --- Clock and Instant -----------------------------------------------

    @Test fun `now is after the epoch`() {
        val now = Clock.System.now()
        val epoch = Instant.parse("1970-01-01T00:00:00Z")
        assertTrue(now > epoch)
    }

    @Test fun `epochMillis is positive and large`() {
        val now = Clock.System.now().toEpochMilliseconds()
        assertTrue(now > 1_000_000_000_000L)  // > year 2001
    }

    // --- TimeZone --------------------------------------------------------

    @Test fun `UTC id is UTC`() {
        assertEquals("UTC", utc.id)
    }

    @Test fun `currentSystemDefault has an id`() {
        assertTrue(systemTz.id.isNotEmpty())
    }

    // --- LocalDate / LocalTime ------------------------------------------

    @Test fun `LocalDate equality is structural`() {
        assertEquals(LocalDate(2024, 1, 30), LocalDate(2024, 1, 30))
    }

    @Test fun `LocalTime equality is structural`() {
        assertEquals(LocalTime(9, 0, 0), LocalTime(9, 0, 0))
    }

    // --- Arithmetic ------------------------------------------------------

    @Test fun `plus days moves the date`() {
        val d = LocalDate(2024, 1, 30).plus(1, DateTimeUnit.DAY)
        assertEquals(LocalDate(2024, 1, 31), d)
    }

    @Test fun `plus period month-aware`() {
        val a = LocalDate(2024, 1, 31)
        val b = a.plus(DateTimePeriod(months = 1))
        // 2024 is a leap year; Feb has 29 days.
        assertEquals(LocalDate(2024, 2, 29), b)
    }

    @Test fun `plus days duration is purely linear`() {
        val a = Instant.parse("2024-01-01T00:00:00Z")
        val b = a.plus(86400.seconds)
        assertEquals(Instant.parse("2024-01-02T00:00:00Z"), b)
    }

    // --- Difference ------------------------------------------------------

    @Test fun `daysUntil counts days between dates`() {
        assertEquals(1, LocalDate(2024, 1, 30).daysUntil(LocalDate(2024, 1, 31)))
    }

    @Test fun `daysBetween computes the gap`() {
        assertEquals(365, daysBetween(LocalDate(2023, 1, 1), LocalDate(2024, 1, 1)))
    }

    // --- Conversion -----------------------------------------------------

    @Test fun `Instant toLocalDateTime is timezone-dependent`() {
        val instant = Instant.parse("2024-01-01T12:00:00Z")
        val inUtc = instant.toLocalDateTime(TimeZone.UTC)
        assertEquals(12, inUtc.hour)
    }

    @Test fun `LocalDate toInstant via atStartOfDayIn produces a UTC instant`() {
        val instant = LocalDate(2024, 1, 1).atStartOfDayIn(TimeZone.UTC)
        assertEquals(Instant.parse("2024-01-01T00:00:00Z"), instant)
    }

    // --- ISO 8601 -------------------------------------------------------

    @Test fun `formatIso8601 round-trips`() {
        val s = "2024-01-30T12:34:56Z"
        assertEquals(s, formatIso8601(parseIso8601(s)))
    }

    // --- Tour ------------------------------------------------------------

    @Test fun `tour produces the expected sequence`() {
        val items = tour()
        assertTrue(items.isNotEmpty())
        // First item is the Instant toString; contains a T separator.
        assertTrue(items[0].contains("T"))
    }
}
