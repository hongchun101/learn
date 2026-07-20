# 00 · KMP Taxonomy

The shared mental model for everything else in this curriculum. **Read this
once before any chapter; revisit when a new chapter introduces a name you
don't recognise.**

## 1. What KMP is, in one sentence

Kotlin Multiplatform is a Kotlin compiler feature that produces **JVM
bytecode, JavaScript, WebAssembly, and native binaries (Apple, Linux,
Windows, Android NDK)** from the same `commonMain` source set, with leaf
source sets supplying per-platform implementations of the `expect`ed
declarations.

The mental model:

```
                     commonMain           ← pure Kotlin, no platform imports
                    ┌────────────┐
                    │   expect   │     ← "here is the contract"
                    │  platform  │
                    │   Logger   │
                    └─────┬──────┘
                          │ expect/actual bridges
       ┌──────────┬───────┼───────┬──────────┐
       ▼          ▼       ▼       ▼          ▼
   jvmMain   androidMain iosMain  jsMain   nativeMain
   System     android.util  NSLog  console  std.cout
   .out       .Log
```

A `commonMain` source compiles into every leaf target. A `jvmMain` source
only joins the JVM/Android bytecode. An `iosMain` source joins every
Apple-target. **A `commonMain` file must not import anything that only
exists in one leaf set**, or the build breaks for everyone else.

## 2. The two-tier type system

KMP makes the type system do work the JVM type system never had to:

| Tier | What it means | What it forbids |
|------|---------------|-----------------|
| **`expect`** | A declaration in `commonMain` with **no body**. Every leaf target must provide an `actual` with the **same erased signature**. | `expect` functions can have no body. `expect` classes can have no constructor body. |
| **`actual`** | A leaf-set implementation. Kotlin checks that the signature matches the `expect`. | `actual` declarations must live in the **same fully-qualified name** as the `expect`. The `expect` and `actual` must agree on generics, return type, and visibility. |
| **`expect/actual` types** | A type whose specific class differs per target (`expect class UUID`, `actual class UUID` on JVM, etc.) | You cannot freely pass an `expect` type to a platform-specific API — it has to be unwrapped first. |

The compiler enforces this: rename an `expect`, the `actual` won't
compile. Change a parameter type, the leaf set breaks. **KMP is a
contract system; the compiler is the contract referee.**

## 3. Source-set hierarchy

```
commonMain ──────────────────────────────────────── pure Kotlin
   │
   ├── intermediateSourceSet("jvmAndNativeMain")  ← groups targets that share code
   │       ├── jvmMain                            ← JVM-only
   │       ├── androidMain                        ← Android-only
   │       └── nativeMain / appleMain / linuxMain ← Kotlin/Native targets
   │
   ├── jsMain / wasmJsMain                        ← JS / Wasm
   │
   └── Each leaf set sees: its own files + all ancestor files.
```

What this means concretely:

- A file in `jvmMain/kotlin/Foo.kt` overrides a file of the **same
  package** in `commonMain/kotlin/Foo.kt`. This is how you "replace" a
  `commonMain` declaration with a JVM implementation without `expect`.
- An `expect class Clock` in `commonMain` with an `actual class Clock`
  in `jvmMain` and another in `iosMain` is the **bridge** pattern.
- An `intermediateSourceSet` lets two targets (say Android & iOS) share
  code that the others don't see. Useful for the mobile-specific layer.

## 4. The runtime models KMP inherits

Each leaf target inherits the **runtime model** of its platform. There
is no KMP runtime — only Kotlin's coroutine runtime (`kotlinx.coroutines`)
which the KMP team ships for every target.

| Target | Concurrency model | UI thread | Notes |
|--------|-------------------|-----------|-------|
| **JVM** | OS threads, JVM happens-before | n/a (server) | Inherits everything from the JMM (JLS §17). |
| **Android** | Main + worker threads, `Looper` | UI thread (the "main looper") | Coroutines on Android must `Dispatchers.Main` to touch the UI. |
| **iOS** | Grand Central Dispatch; coroutine `Dispatchers.Main` dispatches to it. | Main thread (NSRunLoop) | Structured concurrency + `kotlinx.coroutines` integrates cleanly. |
| **JS / Wasm** | Single-threaded event loop | n/a | Coroutines run on a single dispatcher — no parallelism. |
| **Native** | Worker pool, frozen objects, strict aliasing | n/a | `MutableState` semantics differ from JVM; immutable state is the safe default. |

The KMP rule of thumb: **write code in `commonMain` as if the runtime
were the most restricted leaf set.** Don't rely on parallelism, don't
rely on specific GC behaviour, don't rely on JIT warmup. If you need
target-specific runtime, branch at the `expect/actual` boundary.

## 5. The "commonMain discipline"

The biggest KMP mistake is letting platform types leak into `commonMain`:

```kotlin
// commonMain — CORRECT
expect fun readLine(): String?

// jvmMain
actual fun readLine(): String? = java.io.BufferedReader(
    java.io.InputStreamReader(System.`in`)
).readLine()
```

vs. the wrong way:

```kotlin
// commonMain — WRONG
import java.io.File  // ❌ only resolves on JVM
fun readConfig(path: String): String = File(path).readText()
```

The wrong version compiles on JVM, breaks on iOS, and silently works on
Android (where `java.io.File` is available but not what you want).
**Every KMP code review should ask: "does this `import` come from a
target-specific package?"**

## 6. The memory model: shared vs. frozen

Kotlin/JVM and Kotlin/JS share the same `kotlinx.coroutines` runtime;
Kotlin/Native introduces the **frozen object** rule:

- On Native, an object is *frozen* (immutable, shareable across worker
  threads) by default after it crosses a concurrency boundary.
- A frozen object cannot be mutated — its fields are read-only.
- `MutableState` is a way to opt back into shared mutability, but it
  is opt-in and carries the JMM-like warnings.

Practical rule: **in `commonMain`, treat every object as if it will be
frozen tomorrow.** Don't capture mutable state in a coroutine. Don't
share mutable singletons between threads.

## 7. KMP vs. the alternatives

| Question | KMP | Flutter | React Native | .NET MAUI |
|---|---|---|---|---|
| **UI** | Use the platform's native UI toolkit. | Skia, draws its own widgets. | Bridge to native components. | Native, per platform. |
| **Language** | Kotlin. | Dart. | JavaScript / TypeScript. | C#. |
| **Code sharing** | `commonMain` 100% Kotlin. | Dart 100% one codebase. | JS/TS 100% one codebase, with platform modules. | C# 100% one codebase. |
| **Native look & feel** | Yes — you use the platform UI. | No — Material everywhere. | Yes — you bind native. | Yes. |
| **Single biggest win** | Reuse Kotlin idioms and libraries; native UI. | One rendering engine everywhere. | Reuse the JS/TS ecosystem. | Reuse C# and XAML. |
| **Single biggest loss** | You write the platform-specific glue yourself. | You inherit Flutter's UI choices. | The bridge tax; JS-type-to-native-type marshalling. | Smaller ecosystem than KMP. |

KMP is the choice when **the UI is not the shared asset** and the
shared asset is the **business logic, networking, persistence, and
domain model.** If you want one rendering engine for the whole app,
Flutter is the right call. KMP is the right call when you want a
**native** UI on every platform but don't want to write the same
domain model twice.

## 8. The seven problems every KMP project must solve

These map 1-to-1 with the chapter structure:

1. **Pick the right source set.** Where does a class live —
   `commonMain` or `jvmMain`? (ch09)
2. **Bridge a platform API.** `expect`/`actual` for the file system,
   logging, secure storage, clock. (ch09, ch12)
3. **Serialize data.** JSON across platforms, polymorphic types, and
   platform-specific encoders. (ch10)
4. **Handle time correctly.** `kotlinx-datetime`, timezones, the "is
   the server clock local?" question. (ch11)
5. **Talk to a server.** Ktor engines, content negotiation, error
   mapping. (ch15)
6. **Persist data.** SQLDelight, `MultiplatformSettings`, the
   `expect/actual` cache. (ch16)
7. **Wire it into the UI.** Architecture (MVVM/MVI), StateFlow, and the
   per-platform glue. (ch17, ch18)

The chapters in this curriculum are organised around these. Read them
in order and you have a working mental model.
