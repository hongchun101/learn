/*
 * ch07_flow / Ch07Flow.kt
 *
 * Cold and hot Flows, the operator catalogue, sharing, and the
 * backpressure / conflation model.
 *
 * Mental model:
 *   - A `Flow<T>` is a cold, lazy stream. Every collector runs the
 *     upstream again.
 *   - A `StateFlow<T>` is a hot, conflated, always-has-a-current-value
 *     stream. Replay = 1, distinct values.
 *   - A `SharedFlow<T>` is a hot, multi-subscriber stream with
 *     configurable replay and buffer.
 *   - A `Channel<T>` is a hot, point-to-point queue. The two main
 *     flavours are `Channel()` (rendezvous) and `Channel(UNLIMITED)`.
 *   - A `callbackFlow` and `channelFlow` bridge callback-based and
 *     channel-based sources into the Flow world.
 */
@file:Suppress("unused", "UNUSED_VARIABLE")

package ch07_flow

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.conflate
import kotlinx.coroutines.flow.consumeAsFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.flow.flatMapConcat
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flatMapMerge
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.fold
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.merge
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.retry
import kotlinx.coroutines.flow.retryWhen
import kotlinx.coroutines.flow.scan
import kotlinx.coroutines.flow.shareIn
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.take
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.flow.transform
import kotlinx.coroutines.flow.zip
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlin.time.Duration.Companion.milliseconds

// ---------------------------------------------------------------------------
// 1. `flow { ... }` — the cold-flow builder
// ---------------------------------------------------------------------------
// A `flow { ... }` builder runs the body once for each collector.
// `emit(value)` is the only way to push a value; suspending inside
// the builder is fine.

fun ticker(periodMs: Long): Flow<Int> = flow {
    var n = 0
    while (true) {
        emit(n)
        delay(periodMs)
        n += 1
    }
}

// ---------------------------------------------------------------------------
// 2. Operator catalogue
// ---------------------------------------------------------------------------
// Intermediate operators are lazy; they build a new flow that
// re-runs the body for each collector.
//   map, filter, take, drop, transform, scan, distinctUntilChanged
//   flatMapConcat, flatMapMerge, flatMapLatest
//   onEach, debounce, sample, conflate, buffer
// Terminal operators consume the flow.
//   collect, first, firstOrNull, toList, fold, reduce, count, single

suspend fun transformExample() {
    val out = flowOf(1, 2, 3, 4, 5)
        .map { it * it }
        .filter { it > 5 }
        .toList()
    // out = [9, 16, 25]
}

// ---------------------------------------------------------------------------
// 3. `StateFlow` — hot, conflated, always-has-a-current-value
// ---------------------------------------------------------------------------
// Use it for "the current screen state". A `StateFlow` is essentially
// a coroutine-friendly `BehaviorSubject`.

class CounterState(initial: Int = 0) {
    private val _state = MutableStateFlow(initial)
    val state = _state.asStateFlow()

    fun inc() { _state.value += 1 }
    fun reset() { _state.value = 0 }
}

// ---------------------------------------------------------------------------
// 4. `SharedFlow` — hot, multi-subscriber, configurable replay
// ---------------------------------------------------------------------------
// Use it for "events that already happened" — the bus of the
// application. Replay = 0 means "new subscribers do not see past
// events"; replay = N means "they see the last N".

class EventBus {
    private val _events = MutableSharedFlow<String>(replay = 0, extraBufferCapacity = 64)
    val events = _events.asSharedFlow()
    suspend fun emit(event: String) { _events.emit(event) }
    fun tryEmit(event: String): Boolean = _events.tryEmit(event)
}

// ---------------------------------------------------------------------------
// 5. Backpressure: buffer / conflate / sample / debounce
// ---------------------------------------------------------------------------
//   - `buffer(N)` — up to N elements may be queued. Suspends the
//     producer when the buffer is full.
//   - `conflate()` — collapse intermediate values; the slow
//     collector gets the latest. Drops intermediate values.
//   - `sample(period)` — emit the latest value at fixed intervals.
//   - `debounce(timeout)` — wait for a quiet period; emit the latest
//     after the timeout of inactivity. Good for "user paused typing".

fun <T> Flow<T>.logEach(name: String): Flow<T> = onEach { println("$name: $it") }

// ---------------------------------------------------------------------------
// 6. Combine / merge / zip
// ---------------------------------------------------------------------------
//   - `combine(other)` — emits whenever any source emits; combines
//     the latest values of all sources.
//   - `merge(other)` — concatenates the two streams into one.
//   - `zip(other)` — pairs up values, one from each, in order. Suspends
//     the faster side until the slower one emits.

suspend fun combineExample(): List<String> {
    val a = flowOf("a1", "a2", "a3")
    val b = flowOf("b1", "b2", "b3")
    return a.zip(b) { x, y -> "$x+$y" }.toList()
}

suspend fun mergeExample(): List<Int> {
    val a = flowOf(1, 3, 5)
    val b = flowOf(2, 4, 6)
    return merge(a, b).toList()
}

suspend fun combineLatestExample(): List<String> {
    val a = flowOf("a1", "a2", "a3")
    val b = flowOf("b1", "b2", "b3")
    return a.combine(b) { x, y -> "$x+$y" }.toList()
}

// ---------------------------------------------------------------------------
// 7. `flatMapConcat`, `flatMapMerge`, `flatMapLatest`
// ---------------------------------------------------------------------------
// Each one maps an upstream value to a new flow, then composes them.
//   - flatMapConcat  — sequentially, in upstream order
//   - flatMapMerge   — concurrently, interleaved
//   - flatMapLatest  — cancel the previous inner flow when a new
//                      upstream value arrives

suspend fun flatMapConcatExample(): List<String> {
    val out = flowOf(1, 2, 3)
        .flatMapConcat { n -> flowOf("a$n", "b$n") }
        .toList()
    return out
}

suspend fun flatMapLatestExample(): List<String> {
    val out = flowOf(1, 2, 3)
        .flatMapLatest { n -> flowOf("a$n") }
        .toList()
    return out
}

// ---------------------------------------------------------------------------
// 8. `shareIn` / `stateIn` — turn a cold flow hot
// ---------------------------------------------------------------------------
// Use these when many collectors need the same emissions.
//   - `stateIn(scope, started, initial)` — turns a cold flow into a
//     StateFlow. `started` is one of `Eagerly`, `Lazily`, `WhileSubscribed`.
//   - `shareIn(scope, started, replay)` — turns a cold flow into a
//     SharedFlow.

suspend fun <T> Flow<T>.share(scope: CoroutineScope, replay: Int = 0) =
    shareIn(scope, SharingStarted.WhileSubscribed(), replay = replay)

suspend fun <T> Flow<T>.toState(scope: CoroutineScope, initial: T) =
    stateIn(scope, SharingStarted.Eagerly, initial)

// ---------------------------------------------------------------------------
// 9. Error handling: `catch`, `retry`, `retryWhen`
// ---------------------------------------------------------------------------
// `catch { e -> ... }` runs when an exception is thrown upstream.
// It can emit a fallback or rethrow. `retry()` re-subscribes to the
// upstream a fixed number of times; `retryWhen { cause, attempt -> ... }`
// is the more expressive version.

suspend fun catchExample(): List<String> {
    val out = flow {
        emit("ok")
        throw RuntimeException("boom")
    }.catch { e -> emit("recovered from ${e.message}") }
     .toList()
    return out
}

suspend fun retryExample(): List<Int> {
    var attempt = 0
    val out = flow {
        attempt += 1
        if (attempt < 3) throw RuntimeException("attempt $attempt")
        emit(attempt)
    }.retry(3)
     .toList()
    return out
}

// ---------------------------------------------------------------------------
// 10. `channelFlow` / `callbackFlow` — bridging non-Flow sources
// ---------------------------------------------------------------------------
// Use them to wrap a callback-based API or a producer/consumer
// channel into a Flow. **Both are cold; the body runs per collector.**

fun numbersFromChannel(): Flow<Int> = channelFlow {
    val ch = Channel<Int>(Channel.UNLIMITED)
    launch {
        for (n in 1..3) ch.send(n)
        ch.close()
    }
    for (x in ch) send(x)
}

// ---------------------------------------------------------------------------
// 11. `SharingStarted` — the lifecycle of a shared flow
// ---------------------------------------------------------------------------
//   - Eagerly            — start as soon as `shareIn` is called
//   - Lazily             — start on first subscriber
//   - WhileSubscribed    — start on first subscriber, stop N ms after
//                          the last unsubscribes
//
// `WhileSubscribed` is the default for screen state. `Eagerly` is
// for app-wide singletons (e.g., the user session).

// ---------------------------------------------------------------------------
// Tour
// ---------------------------------------------------------------------------

fun tour(): List<String> = runBlocking {
    val items = mutableListOf<String>()
    items += transformExample().toString()   // not used directly; see below
    val tickFirst5 = ticker(10).take(5).toList()
    items += tickFirst5.toString()
    val counter = CounterState(0)
    counter.inc(); counter.inc()
    items += counter.state.value.toString()
    val bus = EventBus()
    bus.tryEmit("e1"); bus.tryEmit("e2")
    items += "bus emitted"
    items += combineExample().toString()
    items += mergeExample().sorted().toString()
    items += combineLatestExample().toString()
    items += flatMapConcatExample().toString()
    items += flatMapLatestExample().toString()
    items += catchExample().toString()
    items += retryExample().toString()
    items += numbersFromChannel().toList().toString()
    val sumViaFold = flowOf(1, 2, 3, 4).fold(0) { acc, n -> acc + n }
    items += sumViaFold.toString()
    val distinct = flowOf(1, 1, 2, 2, 3).distinctUntilChanged().toList()
    items += distinct.toString()
    val debounced = flowOf(1, 2, 3).debounce(100.milliseconds).toList()
    items += debounced.toString()
    items
}
