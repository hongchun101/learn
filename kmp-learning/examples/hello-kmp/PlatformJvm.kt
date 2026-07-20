/*
 * examples/hello-kmp/PlatformJvm.kt (JVM actual)
 */
@file:JvmName("PlatformJvmKt")

package examples.hello_kmp

actual object Platform {
    actual val name: String = "JVM (${System.getProperty("os.name")})"
    actual fun nowMillis(): Long = System.currentTimeMillis()
}
