package io.github.dddlearning.value

/**
 * Closed set of currencies the domain knows how to handle with exact arithmetic.
 *
 * We deliberately avoid the JDK `java.util.Currency` as the public type so we can guarantee a
 * stable three-letter code and a fixed number of fractional digits per currency code. New
 * entries can be added here as new markets are launched; once added, an entry MUST NOT change
 * its code or [fractionDigits].
 *
 * @property fractionDigits the standard number of fractional digits for the currency (e.g. 2 for
 *   USD/EUR, 0 for JPY). Used to scale amounts into a uniform integer representation.
 */
enum class Currency(val fractionDigits: Int) {
    USD(2),
    EUR(2),
    GBP(2),
    JPY(0),
    CNY(2);

    /** Three-letter ISO-4217 style code. */
    val code: String get() = name

    companion object {
        /** Returns the [Currency] with the given [code], or `null` if unknown. */
        fun fromCode(code: String): Currency? = values().firstOrNull { it.code == code }
    }
}