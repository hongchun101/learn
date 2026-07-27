package io.github.dddlearning.value

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.math.BigDecimal

/**
 * Behaviour-driven tests for the [Money] value object.
 *
 * These tests defend observable invariants:
 *  - the currency invariant (mixed-currency arithmetic throws)
 *  - the non-negative invariant (negative input throws; subtraction that would underflow throws)
 *  - scale safety (USD(0.1) * 3 == USD(0.30), USD(1.005) + USD(0.005) == USD(2.01))
 *  - structural equality across equivalent values with different trailing-zero scales
 */
class MoneyTest {

    @Test
    fun `zero returns canonical scaled zero for the currency`() {
        assertEquals(BigDecimal("0.00"), Money.zero(Currency.USD).amount)
        assertEquals(BigDecimal("0"), Money.zero(Currency.JPY).amount)
    }

    @Test
    fun `of rounds to currency fraction digits using bankers rounding`() {
        // 1.005 rounded HALF_EVEN with 2 digits = 1.00 (last kept digit is even).
        val m = Money.of(Currency.USD, BigDecimal("1.005"))
        assertEquals(BigDecimal("1.00"), m.amount)

        // 1.015 rounded HALF_EVEN with 2 digits = 1.02 (last kept digit rounds up to even).
        val m2 = Money.of(Currency.USD, BigDecimal("1.015"))
        assertEquals(BigDecimal("1.02"), m2.amount)
    }

    @Test
    fun `of rejects negative amounts`() {
        assertThrows(IllegalArgumentException::class.java) {
            Money.of(Currency.USD, BigDecimal("-0.01"))
        }
    }

    @Test
    fun `ofMinor constructs from minor units`() {
        val m = Money.ofMinor(Currency.USD, 199)
        assertEquals(BigDecimal("1.99"), m.amount)
        assertEquals(199L, m.minorAmount)
    }

    @Test
    fun `ofMinor rejects negative minor amounts`() {
        assertThrows(IllegalArgumentException::class.java) {
            Money.ofMinor(Currency.USD, -1)
        }
    }

    @Test
    fun `addition accumulates minor units exactly`() {
        // Classic floating-point surprise: 0.1 + 0.2 in IEEE-754 is 0.30000000000000004.
        val sum = Money.of(Currency.USD, BigDecimal("0.10")) +
            Money.of(Currency.USD, BigDecimal("0.20"))
        assertEquals(Money.of(Currency.USD, BigDecimal("0.30")), sum)
    }

    @Test
    fun `addition is exact at the JPY boundary`() {
        // JPY has 0 fraction digits — the implementation MUST drop the trailing zeros,
        // not carry forward phantom precision that would break equality.
        val sum = Money.of(Currency.JPY, BigDecimal("100")) +
            Money.of(Currency.JPY, BigDecimal("200"))
        assertEquals(Money.of(Currency.JPY, BigDecimal("300")), sum)
    }

    @Test
    fun `addition with mismatched currencies throws`() {
        val usd = Money.of(Currency.USD, BigDecimal("1.00"))
        val eur = Money.of(Currency.EUR, BigDecimal("1.00"))
        assertThrows(IllegalArgumentException::class.java) { usd + eur }
    }

    @Test
    fun `subtraction refuses to underflow below zero`() {
        val small = Money.of(Currency.USD, BigDecimal("1.00"))
        val big = Money.of(Currency.USD, BigDecimal("2.00"))
        assertThrows(IllegalArgumentException::class.java) { small - big }
    }

    @Test
    fun `multiplication by integer is exact in minor units`() {
        // USD(0.10) * 3 == USD(0.30), NOT USD(0.30000000000000004).
        val product = Money.of(Currency.USD, BigDecimal("0.10")) * 3
        assertEquals(Money.of(Currency.USD, BigDecimal("0.30")), product)
    }

    @Test
    fun `multiplication by BigDecimal rounds HALF_EVEN to currency scale`() {
        // 0.10 * 0.5 = 0.05 in USD; rounded to 2 digits HALF_EVEN is 0.05 (last kept digit 5 odd -> up).
        val product = Money.of(Currency.USD, BigDecimal("0.10")) * BigDecimal("0.5")
        assertEquals(BigDecimal("0.05"), product.amount)
    }

    @Test
    fun `multiplication rejects negative multiplier`() {
        val m = Money.of(Currency.USD, BigDecimal("1.00"))
        assertThrows(IllegalArgumentException::class.java) { m * BigDecimal("-1") }
    }

    @Test
    fun `compareTo uses minor-unit ordering`() {
        val a = Money.of(Currency.USD, BigDecimal("1.00"))
        val b = Money.of(Currency.USD, BigDecimal("2.00"))
        assert(a < b)
        assert(b > a)
        assertEquals(0, a.compareTo(Money.of(Currency.USD, BigDecimal("1.00"))))
    }

    @Test
    fun `equality is structural and ignores trailing-zero scale differences`() {
        val a = Money.of(Currency.USD, BigDecimal("1.0"))
        val b = Money.of(Currency.USD, BigDecimal("1.00"))
        assertEquals(a, b)
        assertEquals(a.hashCode(), b.hashCode())
    }

    @Test
    fun `equality distinguishes currencies with the same numeric amount`() {
        val usd = Money.of(Currency.USD, BigDecimal("1.00"))
        val eur = Money.of(Currency.EUR, BigDecimal("1.00"))
        assertNotEquals(usd, eur)
    }
}