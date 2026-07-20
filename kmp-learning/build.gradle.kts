plugins {
    alias(libs.plugins.kotlin.multiplatform)
    alias(libs.plugins.kotlin.serialization)
}

group = "io.learn.kmp"
version = "1.0.0"

repositories {
    mavenCentral()
}

kotlin {
    // We deliberately configure only the JVM target here. The repo is designed
    // so the JVM target exercises every commonMain piece end-to-end.
    // See docs/01-how-to-run.md for instructions on enabling Android, iOS,
    // and JS targets once the corresponding toolchain is available.
    jvmToolchain(17)

    sourceSets {
        val commonMain by getting {
            dependencies {
                implementation(libs.kotlinx.coroutines.core)
                implementation(libs.kotlinx.serialization.json)
                implementation(libs.kotlinx.datetime)
                implementation(libs.ktor.client.core)
                implementation(libs.ktor.client.content.negotiation)
                implementation(libs.ktor.serialization.kotlinx.json)
            }
        }
        val commonTest by getting {
            dependencies {
                implementation(libs.kotlinx.coroutines.test)
                implementation(libs.kotlinx.serialization.json)
                implementation(libs.kotlinx.datetime)
                @Suppress("UnstableApiUsage")
                implementation(kotlin("test"))
            }
        }
        val jvmMain by getting {
            dependencies {
                implementation(libs.ktor.client.cio)
                implementation(libs.logback.classic)
            }
        }
        val jvmTest by getting {
            dependencies {
                implementation(libs.ktor.client.mock)
                implementation(libs.junit)
                @Suppress("UnstableApiUsage")
                implementation(kotlin("test-junit"))
            }
        }
    }
}

tasks.named<Test>("jvmTest") {
    useJUnit()
    testLogging {
        events("passed", "skipped", "failed")
        showStandardStreams = false
    }
}
