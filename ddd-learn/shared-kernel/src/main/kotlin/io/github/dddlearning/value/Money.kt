package io.github.dddlearning.value

import java.math.BigDecimal
import java.math.RoundingMode

/**
 * Immutable monetary amount in a specific [currency].
 *
 * DDD role: a value object. Two [Money] instances are equal iff they carry the same currency and
 * the same scaled minor-unit amount. Arithmetic is scale-safe: every operation normalises the
 * operands into the currency's [minor units][Currency.fractionDigits] using banker's rounding, so
 * `USD(1.005) + USD(0.005) == USD(2.01)` rather than `USD(2.00)` (the classic binary-float
 * surprise) and `USD(0.1) * 3 == USD(0.30)` rather than `USD(0.30000000000000004)`.
 *
 * Amounts are non-negative. There is no concept of "negative money" at the value-object level —
 * direction of flow is expressed by the surrounding operation (payment vs refund, credit vs
 * debit). Use [zero] for an empty balance.
 *
 * Instances are constructed through [of], [ofMinor], [zero], or the arithmetic operators; the
 * constructor is intentionally not public.
 *
 * @property currency the currency; never null.
 * @property amount the scaled amount, in major units, rounded to [Currency.fractionDigits].
 */
class Money private constructor(
    val currency: Currency,
    val amount: BigDecimal,
) {

    init {
        require(amount.scale() <= currency.fractionDigits) {
            "amount scale ${amount.scale()} exceeds ${currency.fractionDigits} for $currency"
        }
        require(amount.signum() >= 0) { "amount must be non-negative, got $amount" }
    }

    /** The amount expressed in the currency's minor unit (e.g. cents for USD). */
    val minorAmount: Long
        get() = amount.movePointRight(currency.fractionDigits)
            .setScale(0, RoundingMode.UNNECESSARY)
            .toBigInteger()
            .toLong()

    /**
     * Returns a new [Money] equal to `this + [other]`. Requires matching [currency]s; mixing
     * currencies is a programmer error and throws.
     */
    operator fun plus(other: Money): Money {
        requireSameCurrency(other)
        return ofMinor(currency, minorAmount + other.minorAmount)
    }

    /**
     * Returns a new [Money] equal to `this - [other]`. Requires matching [currency]s and `this
     * >= other`; the non-negative invariant is preserved.
     */
    operator fun minus(other: Money): Money {
        requireSameCurrency(other)
        require(minorAmount >= other.minorAmount) {
            "subtraction would yield negative money: $this - $other"
        }
        return ofMinor(currency, minorAmount - other.minorAmount)
    }

    /**
     * Returns a new [Money] equal to `this * [multiplier]`. [multiplier] is a non-negative
     * [BigDecimal] (typically a unit price times a non-fractional quantity, or a percentage);
     * fractional results are rounded to the currency's [fractionDigits] using
     * [RoundingMode.HALF_EVEN] (banker's rounding) so the same calculation repeated in
     * different orders produces the same result.
     */
    operator fun times(multiplier: BigDecimal): Money {
        require(multiplier.signum() >= 0) { "multiplier must be non-negative, got $multiplier" }
        val scaled = amount.multiply(multiplier)
            .setScale(currency.fractionDigits, RoundingMode.HALF_EVEN)
        return of(currency, scaled)
    }

    /** Convenience overload for integer multipliers. */
    operator fun times(multiplier: Int): Money = times(BigDecimal(multiplier))

    /** Convenience overload for long multipliers. */
    operator fun times(multiplier: Long): Money = times(BigDecimal(multiplier))

    /**
     * Returns the integer comparison of the two minor-unit amounts. Requires matching
     * [currency]s.
     */
    operator fun compareTo(other: Money): Int {
        requireSameCurrency(other)
        return minorAmount.compareTo(other.minorAmount)
    }

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is Money) return false
        return currency == other.currency && amount.compareTo(other.amount) == 0
    }

    override fun hashCode(): Int = 31 * currency.hashCode() + amount.stripTrailingZeros().hashCode()

    override fun toString(): String = "$amount $currency"

    private fun requireSameCurrency(other: Money) {
        require(currency == other.currency) {
            "currency mismatch: $this vs $other"
        }
    }

    companion object {
        /** The canonical zero for [currency]. */
        fun zero(currency: Currency): Money = Money(currency, BigDecimal.ZERO.setScale(currency.fractionDigits))

        /**
         * Constructs a [Money] from a major-unit [amount], rounding to the currency's
         * [fractionDigits] using banker's rounding.
         *
         * @throws IllegalArgumentException if [amount] is negative.
         */
        fun of(currency: Currency, amount: BigDecimal): Money {
            require(amount.signum() >= 0) { "amount must be non-negative, got $amount" }
            val scaled = amount.setScale(currency.fractionDigits, RoundingMode.HALF_EVEN)
            return Money(currency, scaled)
        }

        /**
         * Constructs a [Money] from an integer minor-unit amount (e.g. cents). Useful when
         * receiving a value from an external system that already speaks in minor units.
         */
        fun ofMinor(currency: Currency, minor: Long): Money {
            require(minor >= 0) { "minor amount must be non-negative, got $minor" }
            val amount = BigDecimal(minor).movePointLeft(currency.fractionDigits)
            return Money(currency, amount)
        }
    }
}