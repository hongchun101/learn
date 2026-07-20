# 01 · How to Run

The minimum you need to start: **JDK 17+** and a Kotlin-aware IDE.
The minimum you need to ship: **JDK 17+, Xcode 15+** (for iOS), and
**Android Studio Hedgehog or later** (for Android). JavaScript and
Wasm targets only need **Node 18+**.

This document is the per-target recipe book.

## 1. Toolchain

| Tool | Minimum | Used for | Where to get it |
|------|---------|----------|-----------------|
| **JDK** | 17 | `./gradlew`, `kotlinc`, source compatibility | <https://adoptium.net/> |
| **Gradle** | 8.4+ | build automation | wrapper is included; otherwise `brew install gradle` / `sdkman` |
| **Kotlin** | 1.9.24 | language | bundled with the Gradle plugin |
| **Xcode** | 15.0 | iOS target | App Store |
| **Android Studio** | Hedgehog | Android target | <https://developer.android.com/studio> |
| **Node** | 18 | JS target | <https://nodejs.org/> |
| **Python** | 3.10+ | `tools/verify.py` | <https://python.org/> |

The project pins everything in `gradle/libs.versions.toml`. If you
change a version there, `gradle :dependencyUpdates` will tell you
whether the new version is compatible.

## 2. The shortest path: JVM only

This is the path that runs on the most machines:

```bash
cd kmp-learning
./gradlew jvmTest         # compile + run the JVM test suite
./gradlew :jvmRun -PmainClass=io.learn.kmp.MainKt
```

Expected: 60+ tests pass, the demo prints a tour of the curriculum.

## 3. Per-target commands

### JVM (the one we ship by default)

```bash
./gradlew jvmTest
./gradlew jvmRun                  # runs the demo entry
```

### Android

Requires the Android Gradle plugin. To enable, **uncomment** the
`android()` block in `build.gradle.kts` and add to `settings.gradle.kts`:

```kotlin
pluginManagement {
    repositories {
        gradlePluginPortal()
        google()
        mavenCentral()
    }
}
```

Then:

```bash
./gradlew :androidTest            # instrumented tests
./gradlew assembleDebug           # produces an .aab
```

### iOS

Requires Xcode 15 and the Kotlin/Native plugin. Add the iOS target to
`build.gradle.kts`:

```kotlin
iosX64()
iosArm64()
iosSimulatorArm64()
```

Then:

```bash
./gradlew :iosX64Test             # unit tests on the simulator
./gradlew :iosX64Binaries         # produces a .klib + .framework
```

To produce a real iOS app, you need an Xcode project that links
against the produced framework. The capstone in `ch18_capstone` shows
the iOS entry point; it is wired but not runnable without Xcode.

### JavaScript

```bash
./gradlew jsBrowserTest           # browser tests
./gradlew jsNodeTest              # Node tests
```

### Wasm

```bash
./gradlew wasmJsBrowserTest
```

### Native (Linux / Windows / Apple)

```bash
./gradlew linuxX64Test
./gradlew mingwX64Test
```

## 4. Running the static verifier (no Kotlin toolchain required)

If you only have Python, you can still validate that the curriculum is
structurally complete:

```bash
python tools/verify.py
```

It will:

- Confirm every `.kt` file declares a package matching its directory.
- Pair every `expect` with every `actual` for the configured targets.
- Confirm every test file has at least one `@Test` method.
- Regenerate `tools/chapter-coverage-matrix.md` showing public API per
  chapter and which tests exercise it.
- Map the README's "What an expert can do" checklist to actual code
  locations.
- Print a `BUILD OK` summary at the end.

This is the **fallback ground truth** when you don't have a Kotlin
compiler locally.

## 5. IDE notes

- **IntelliJ IDEA Ultimate** has the best KMP story out of the box. The
  community edition handles JVM and JS targets but you need the
  ultimate edition for iOS.
- **Android Studio** inherits IntelliJ's KMP support, so it works for
  `commonMain` + `androidMain` immediately.
- **VS Code** with the Kotlin extension handles `commonMain` and
  `jvmMain` but does not yet understand the source-set hierarchy
  visually.

## 6. Common pitfalls

1. **"I imported `java.io.File` in `commonMain` and the build fails on
   iOS."** Move the import to `jvmMain` and add an `expect`/`actual`
   for the function you need.
2. **"My `expect` doesn't have a matching `actual`."** The compiler
   error is precise: it tells you which target needs an `actual`. Add
   one in the corresponding source set.
3. **"My Android tests pass but the JVM tests don't."** You're using
   an Android-only API (`android.util.Log`). Move the call to
   `androidMain` and abstract over a `Logger` `expect`.
4. **"My coroutine never returns."** You forgot `runBlocking` in the
   test, or you leaked a `GlobalScope`. Every coroutine must have a
   parent scope.
5. **"My Flow collector receives nothing."** Either the producer never
   emits (check upstream) or the collector's scope was cancelled
   before the upstream reached the first emission. Run in
   `runTest { ... }` with a `StandardTestDispatcher`.

## 7. The CI recipe (sketch)

A minimal GitHub Actions config that runs the JVM tests:

```yaml
- uses: actions/checkout@v4
- uses: actions/setup-java@v4
  with:
    distribution: temurin
    java-version: 17
- run: ./gradlew jvmTest
- run: python tools/verify.py
```

That's all you need for the curriculum's "always green" signal.
