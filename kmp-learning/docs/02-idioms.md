# 02 · Idioms, Anti-patterns, Naming

A short, opinionated reference. Read it once; refer back when a code
review goes sideways.

## 1. Naming

| Construct | Convention | Example |
|---|---|---|
| Package | lowercase, dot-separated, matches directory | `io.learn.kmp.ch06_coroutines` |
| Class / object / interface | `UpperCamelCase` | `ChannelScope`, `Logger` |
| Function / property | `lowerCamelCase` | `launchInScope`, `isCompleted` |
| Top-level constant | `UPPER_SNAKE_CASE` or `UpperCamelCase` | `MAX_RETRIES` or `MaxRetries` |
| Type parameter | single capital letter, sometimes `T`, `R`, `K`, `V` | `<T>`, `<K, V>` |
| `expect` declaration | use a noun, no `I` prefix | `expect interface Clock` |
| `actual` declaration | same name as the `expect` | `actual class Clock` |
| Composable-style | not applicable; KMP doesn't ship its own UI | n/a |
| Coroutine function | verb, returns `Unit` unless it computes a value | `loadUser()` returns `User`; `showError()` returns `Unit` |
| Suspend function | the verb form, prefixed with the noun if it can be confused with a non-suspend | `suspend fun loadUser(): User` |
| Flow factory | `flow`/`channelFlow`/etc. + noun | `tickerFlow`, `stateFlow` |
| Test function | backtick description of behaviour | `` fun `cancels the scope on first failure`() {} `` |
| Test class | `XxxTest` | `CoroutineScopeTest` |

## 2. Idioms

### 2.1 Prefer `val` to `var`

```kotlin
// GOOD
val items = listOf(1, 2, 3)

// BAD
var items = mutableListOf(1, 2, 3)  // until you have evidence you need mutability
```

### 2.2 Prefer immutable collections

```kotlin
// GOOD
val read: List<User> = repo.all()

// BAD — exposes the implementation detail "this is mutable"
val read: MutableList<User> = repo.all()
```

### 2.3 `if` is an expression

```kotlin
val name = if (user != null) user.name else "anonymous"
```

### 2.4 Use `data class` for value types

```kotlin
data class Money(val amount: Long, val currency: String)
```

`equals` / `hashCode` / `toString` / `copy` for free. The KMP compiler
verifies that `data class` works the same way on every target.

### 2.5 `sealed class` / `sealed interface` for sum types

```kotlin
sealed interface Result<out T> {
    data class Success<T>(val value: T) : Result<T>
    data class Failure(val cause: Throwable) : Result<Nothing>
}
```

`when` over a `sealed` type is exhaustive — the compiler enforces
handling every branch.

### 2.6 Use `object` for stateless singletons, `companion object` for namespaced constants

```kotlin
object Clock { fun now(): Instant = ... }

class Token {
    companion object {
        const val EXPIRY_SECONDS = 3600
    }
}
```

### 2.7 Trailing lambda for last-argument functions

```kotlin
listOf(1, 2, 3).map { it * 2 }      // GOOD
listOf(1, 2, 3).map({ it * 2 })    // less idiomatic
```

### 2.8 Scope functions

| Function | Reference | Return | When |
|---|---|---|---|
| `let` | `it` | lambda result | null-checks, conversions |
| `run` | `this` | lambda result | configuration blocks |
| `with` | `this` | lambda result | non-null receivers |
| `apply` | `this` | receiver | configuration that returns the receiver |
| `also` | `it` | receiver | side-effects |

```kotlin
val user = User(name = "Ada").apply { logger.info("created $name") }
val token = user.token?.let { "Bearer $it" }
```

**Anti-pattern**: chaining more than two scope functions. The reader
loses the thread of identity.

### 2.9 Extension functions over inheritance

```kotlin
fun List<Int>.sumOfSquares(): Int = sumOf { it * it }
```

Kotlin's standard library is mostly extensions; so is `kotlinx.coroutines`,
`kotlinx.serialization`, Ktor. **Look for the extension first**.

### 2.10 `inline` + `reified` for type-safe builders

```kotlin
inline fun <reified T : Any> loggerFor(): Logger = LoggerFactory.getLogger(T::class.java)
```

`reified` is the closest thing Kotlin has to Java's `Class<T>` tricks.
Use it when a function genuinely needs runtime type info.

### 2.11 Structured concurrency

```kotlin
suspend fun loadDashboard(): Dashboard = coroutineScope {
    val user = async { repo.user() }
    val feed = async { repo.feed() }
    Dashboard(user.await(), feed.await())
}
```

If `repo.user()` throws, the `feed` coroutine is cancelled. The whole
function either returns a `Dashboard` or throws. **Never `GlobalScope`.**

## 3. Anti-patterns

### 3.1 `!!` everywhere

```kotlin
// BAD
val name = user!!.name!!

// GOOD
val name = user?.name ?: "anonymous"
```

The compiler is warning you that you have a hole in your null story.
Patch the story; don't suppress the warning.

### 3.2 `companion object` as a poor man's singleton

`object` exists for a reason. A `companion object` is for namespaced
constants and factory methods.

### 3.3 Mutable state in `commonMain`

```kotlin
// BAD
object Counter {
    var count = 0  // frozen on Native, not safe across workers
}

// GOOD
class Counter {
    private val state = atomic(0)
    fun inc() = state.incrementAndGet()
}
```

### 3.4 Stringly-typed APIs

```kotlin
// BAD
fun findUser(kind: String, id: String): User

// GOOD
sealed interface UserKey {
    data class ById(val id: String) : UserKey
    data class ByEmail(val email: String) : UserKey
}
fun findUser(key: UserKey): User
```

### 3.5 Catching `Throwable` and swallowing it

```kotlin
// BAD
try { ... } catch (t: Throwable) { }

// GOOD
try { ... } catch (e: IOException) { logger.warn(e) { "..." } }
```

Be specific about what you can handle. Cancellation is
`CancellationException`; catching and ignoring it breaks structured
concurrency.

### 3.6 `runBlocking` in production code

`runBlocking` is for tests and `main()`. It bridges the suspending
world to the blocking one, and you only need that at a boundary.

### 3.7 Mixing concurrency models in one function

```kotlin
// BAD
suspend fun load(): User {
    val user = withContext(Dispatchers.IO) { ... }
    return runBlocking { ... }   // breaks the contract
}
```

Pick one. If you need to bridge, do it at the function boundary
(`main()` or test), not inside.

## 4. Visibility defaults

| Visibility | When |
|---|---|
| `public` (default) | API the caller will need. |
| `internal` | Module-internal. In KMP, "module" means the Gradle module — every source set in one module sees `internal`. |
| `protected` | Open-class hierarchies. |
| `private` | File- or class-scoped. |

**Default to `internal` and widen as needed.** A KMP `commonMain` is a
published module surface; treat it like a library API.

## 5. KMP-specific rules

1. **No `expect` in leaf source sets.** `expect` is a `commonMain`
   declaration.
2. **`actual` is for leaves only.** Don't put `actual` in
   `commonMain`.
3. **Names match exactly.** A typo in `expect` and `actual` fails at
   compile time — fix it once.
4. **No leaf-only imports in `commonMain`.** Use an `expect`/
   `actual` bridge.
5. **Test the contract, not the implementation.** Test what the
   `expect` promises, not what the `actual` does.

## 6. Naming pairs that frequently appear in this curriculum

| Type | Use |
|---|---|
| `Logger` | logging abstraction (ch12) |
| `Clock` | time abstraction (ch11) |
| `AppSettings` | cross-platform preferences (ch16) |
| `HttpClient` | Ktor facade (ch15) |
| `EventBus` / `MutableSharedFlow<Event>` | event broadcasting (ch07) |
| `Repository<T>` | domain-layer data source (ch17) |
| `UseCase<in P, out R>` | single-purpose business action (ch17) |
| `State` / `Intent` / `Effect` | MVI trio (ch17) |
| `ViewModel` | platform-agnostic screen state holder (ch17) |
