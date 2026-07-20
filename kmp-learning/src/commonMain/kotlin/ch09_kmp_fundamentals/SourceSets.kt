/*
 * ch09_kmp_fundamentals / SourceSets.kt
 *
 * A pure-commonMain explanation of the source-set hierarchy. The
 * Gradle DSL sets this up; the code below is what each source set
 * looks like as files on disk.
 *
 * The hierarchy is the load-bearing concept of KMP. Once you
 * understand it, every other multiplatform topic is a corollary.
 */
@file:Suppress("unused", "UNUSED_VARIABLE")

package ch09_kmp_fundamentals

// ---------------------------------------------------------------------------
// 1. The "expected vs actual" mental model
// ---------------------------------------------------------------------------
//
// In `commonMain` you write:
//
//   expect interface PlatformContext { val osName: String }
//
// In `jvmMain` you write:
//
//   actual object PlatformContext : ch09_kmp_fundamentals.PlatformContext {
//       actual override val osName = System.getProperty("os.name") ?: "unknown"
//   }
//
// The compiler verifies that the `actual` matches the `expect`:
//   - same FQN
//   - same generics
//   - same member signature
//   - same visibility
//
// Rename one, and the build fails for that target.

// ---------------------------------------------------------------------------
// 2. Source-set hierarchy, by example
// ---------------------------------------------------------------------------
//
//   src/
//     commonMain/kotlin/        ← every target sees these files
//       ch09_kmp_fundamentals/Platform.kt   ← expect decls
//     jvmMain/kotlin/           ← only the JVM/Android target
//       ch09_kmp_fundamentals/Platform.kt   ← actual impls
//     androidMain/kotlin/       ← only Android
//     iosMain/kotlin/           ← only iOS
//     nativeMain/kotlin/        ← any native target
//     jsMain/kotlin/            ← JS / Wasm
//     commonTest/kotlin/        ← tests on every target
//     jvmTest/kotlin/           ← tests on the JVM target only
//
// A file in `jvmMain/kotlin/foo/Bar.kt` overrides a file of the
// **same package** in `commonMain/kotlin/foo/Bar.kt`. This is how
// you "replace" a `commonMain` declaration with a JVM implementation
// without `expect`/`actual`.
//
// You can also group targets with `intermediateSourceSet`:
//
//   val jvmAndAndroidMain by creating {
//       dependsOn(commonMain)
//   }
//   val jvmMain by getting { dependsOn(jvmAndAndroidMain) }
//   val androidMain by getting { dependsOn(jvmAndAndroidMain) }
//
// In a real Gradle build that would be `applyDefaultHierarchyTemplate()`.

// ---------------------------------------------------------------------------
// 3. Code that is *always* commonMain-safe
// ---------------------------------------------------------------------------
// The rules of thumb:
//
//   - No imports from `java.*`, `javax.*`, `android.*`, `apple.*`, etc.
//   - No `Thread`, no `Class.forName`, no `System.getProperty`.
//     Use the expect/actual bridge.
//   - Coroutines: `kotlinx.coroutines` is KMP-friendly out of the box.
//   - Serialization: `kotlinx.serialization` is KMP-friendly.
//   - Time: `kotlinx-datetime` is KMP-friendly.
//   - HTTP: Ktor is KMP-friendly; engine choice is per-target.
//
// If you can keep the rule "no platform imports in commonMain", you
// have a portable module. If you can't, the leak must be wrapped in
// an expect/actual.

// ---------------------------------------------------------------------------
// 4. The mental table
// ---------------------------------------------------------------------------
// CommonMain declarations and how they show up at runtime:
//
//   ┌────────────────────────┬────────────────────────────────────────┐
//   │ CommonMain declaration │ Per-target realisation                 │
//   ├────────────────────────┼────────────────────────────────────────┤
//   │ expect fun readFile()  │ actual fun readFile() = java.io.File   │
//   │                        │      .readText()                       │
//   │                        │ actual fun readFile() =                │
//   │                        │      NSString.stringWithContentsOfFile │
//   │                        │ actual fun readFile() =                │
//   │                        │      fs.readFileSync(path, "utf-8")    │
//   ├────────────────────────┼────────────────────────────────────────┤
//   │ expect class UUID      │ actual class UUID(java.util.UUID)      │
//   │                        │ actual class UUID(NSUUID)              │
//   │                        │ actual class UUID(crypto.randomUUID()) │
//   ├────────────────────────┼────────────────────────────────────────┤
//   │ val greeting: String   │ one definition, compiled everywhere    │
//   │ fun double(n: Int)     │ one definition, compiled everywhere    │
//   └────────────────────────┴────────────────────────────────────────┘

// ---------------------------------------------------------------------------
// 5. The "leak audit" you do on every PR
// ---------------------------------------------------------------------------
//
// 1. For each `.kt` file in `commonMain`, `grep` the imports.
// 2. If you see anything that doesn't start with `kotlin.`,
//    `kotlinx.`, or a project package, ask: is there an
//    `expect` for it?
// 3. If yes, the file is fine.
// 4. If no, the file is leaking. Move the platform-specific code to a
//    leaf source set and add the `expect`/`actual` bridge.
// 5. A leak in `commonMain` is the single most common KMP defect.
//
// The companion `tools/verify.py` automates steps 1-3.

// ---------------------------------------------------------------------------
// 6. Worked example: a "kmp-info" command
// ---------------------------------------------------------------------------

data class PlatformInfo(
    val osName: String,
    val arch: String,
    val isDebug: Boolean,
    val nowEpochMillis: Long,
)

fun platformInfo(): PlatformInfo = PlatformInfo(
    osName = PlatformContext.osName,
    arch = PlatformContext.arch,
    isDebug = PlatformContext.isDebug,
    nowEpochMillis = PlatformClock.nowEpochMillis(),
)

// ---------------------------------------------------------------------------
// 7. The file-system example
// ---------------------------------------------------------------------------
// CommonMain: declare the contract.
// jvmMain:    supply a JVM implementation.

fun readConfigOrDefault(path: String, default: String): String {
    val f = platformFile(path)
    return if (f.exists()) f.readText() else default
}

fun writeIfMissing(path: String, content: String): Boolean {
    val f = platformFile(path)
    if (f.exists()) return false
    f.writeText(content)
    return true
}

// ---------------------------------------------------------------------------
// Tour
// ---------------------------------------------------------------------------

fun tour(): List<String> {
    val info = platformInfo()
    val sample = writeIfMissing("kmp-learning.txt", "hello from KMP\n")
    val read = readConfigOrDefault("kmp-learning.txt", "<missing>")
    return listOf(
        info.osName,
        info.arch,
        info.isDebug.toString(),
        info.nowEpochMillis.toString(),
        sample.toString(),
        read,
        PlatformContext::class.simpleName ?: "anonymous",
    )
}
