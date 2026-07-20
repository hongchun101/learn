/*
 * ch11_datetime / Ch11DateTime.kt
 *
 * kotlinx-datetime. The KMP-friendly replacement for `java.time`,
 * `NSDate`, and `Date`. The mental model:
 *
 *   - `Instant`     — a point on the UTC timeline (Long under the hood)
 *   - `LocalDate`   — a date without a timezone (2024-01-30)
 *   - `LocalDateTime` — date + time, no timezone
 *   - `LocalTime`   — a time of day, no date, no timezone
 *   - `TimeZone`    — the offset/DST rules for a region
 *   - `Clock`       — a source of "now" (the system clock by default)
 *   - `Duration`    — a span of time
 *   - `DateTimePeriod` — a calendar-aware span (months, days, ...)
 *
 * The hardest part of date-time code is not the API; it's the
 * timezone arithmetic. `kotlinx-datetime` makes the easy cases easy
 * and the hard cases tractable.
 */
@file:Suppress("unused", "UNUSED_VARIABLE")

package ch11_datetime

import kotlinx.datetime.Clock
import kotlinx.datetime.DateTimePeriod
import kotlinx.datetime.DayOfWeek
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.atStartOfDayIn
import kotlinx.datetime.daysUntil
import kotlinx.datetime.minus
import kotlinx.datetime.monthsUntil
import kotlinx.datetime.plus
import kotlinx.datetime.toInstant
import kotlinx.datetime.toLocalDateTime
import kotlinx.datetime.yearsUntil
import kotlin.time.Duration.Companion.days
import kotlin.time.Duration.Companion.hours
import kotlin.time.Duration.Companion.seconds

// ---------------------------------------------------------------------------
// 1. The system clock and Instant
// ---------------------------------------------------------------------------
// `Clock.System.now()` returns an `Instant` — a UTC point in time.
// `Instant` is comparable and convertible to other types.

fun nowEpochMillis(): Long = Clock.System.now().toEpochMilliseconds()
fun nowAsString(): String = Clock.System.now().toString()

// ---------------------------------------------------------------------------
// 2. TimeZone
// ---------------------------------------------------------------------------
// `TimeZone.UTC` and `TimeZone.currentSystemDefault()` are the two
// most common. `currentSystemDefault()` reads the OS's timezone.

val utc: TimeZone = TimeZone.UTC
val systemTz: TimeZone = TimeZone.currentSystemDefault()

// ---------------------------------------------------------------------------
// 3. LocalDate, LocalTime, LocalDateTime
// ---------------------------------------------------------------------------

val today: LocalDate = Clock.System.now().toLocalDateTime(systemTz).date

val epoch: LocalDate = LocalDate(1970, 1, 1)

val morning: LocalTime = LocalTime(9, 0, 0)
val noon: LocalTime = LocalTime(12, 0, 0)

val tomorrow: LocalDate = today.plus(1, kotlinx.datetime.DateTimeUnit.DAY)

// ---------------------------------------------------------------------------
// 4. Conversion: Instant <-> LocalDateTime
// ---------------------------------------------------------------------------

fun Instant.toLocal(timeZone: TimeZone = systemTz): LocalDateTime = toLocalDateTime(timeZone)

fun LocalDateTime.toInstantUtc(): Instant = toInstant(utc)

// ---------------------------------------------------------------------------
// 5. Arithmetic
// ---------------------------------------------------------------------------

fun oneWeekFromNow(): Instant = Clock.System.now().plus(7.days)

fun nextMonday(): LocalDate {
    var d = today
    while (d.dayOfWeek != DayOfWeek.MONDAY) d = d.plus(1, kotlinx.datetime.DateTimeUnit.DAY)
    return d
}

// ---------------------------------------------------------------------------
// 6. Periods vs Durations
// ---------------------------------------------------------------------------
// A `Duration` is a fixed number of seconds/nanoseconds. A
// `DateTimePeriod` is calendar-aware: "1 month" is "30 days for
// February" or "31 days for March", depending on where you land.

fun periodDemo(): String {
    val a = LocalDate(2024, 1, 31)
    val b = a.plus(DateTimePeriod(months = 1))
    // 2024-01-31 + 1 month = 2024-02-29 (leap year, last day of month)
    return "$a + 1 month = $b"
}

fun durationDemo(): String {
    val a = Instant.parse("2024-01-01T00:00:00Z")
    val b = a.plus(86400.seconds)
    return "$a + 86400s = $b"
}

// ---------------------------------------------------------------------------
// 7. Difference
// ---------------------------------------------------------------------------

fun daysBetween(a: LocalDate, b: LocalDate): Int = a.daysUntil(b)
fun monthsBetween(a: LocalDate, b: LocalDate): Int = a.monthsUntil(b)
fun yearsBetween(a: LocalDate, b: LocalDate): Int = a.yearsUntil(b)

// ---------------------------------------------------------------------------
// 8. Formatting and parsing
// ---------------------------------------------------------------------------
// kotlinx-datetime does not ship a formatter; pair it with a KMP
// formatter (e.g., `kotlinx-datetime` 0.6+ has a basic ISO 8601
// parser/format via `Instant.toString()` / `Instant.parse()`).

fun formatIso8601(instant: Instant): String = instant.toString()        // "2024-01-30T12:34:56Z"
fun parseIso8601(s: String): Instant = Instant.parse(s)                // round-trip

// ---------------------------------------------------------------------------
// 9. Day-of-week helpers
// ---------------------------------------------------------------------------

fun DayOfWeek.short(): String = name.take(3)

// ---------------------------------------------------------------------------
// Tour
// ---------------------------------------------------------------------------

fun tour(): List<String> {
    val now = Clock.System.now()
    val localNow = now.toLocal(systemTz)
    val items = mutableListOf<String>()
    items += now.toString()
    items += nowEpochMillis().toString()
    items += systemTz.id
    items += today.toString()
    items += tomorrow.toString()
    items += morning.toString()
    items += localNow.toString()
    items += oneWeekFromNow().toString()
    items += nextMonday().toString()
    items += periodDemo()
    items += durationDemo()
    items += daysBetween(epoch, today).toString()
    items += formatIso8601(now)
    items += DayOfWeek.MONDAY.short()
    return items
}
