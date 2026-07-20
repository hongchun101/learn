/*
 * ch15_http / Ch15HttpJvm.kt (JVM actual)
 *
 * The JVM-side engine: CIO (Coroutine-based I/O).
 */
@file:Suppress("unused")

package ch15_http

import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.engine.cio.CIO

actual fun platformEngine(): HttpClientEngine = CIO.create()
