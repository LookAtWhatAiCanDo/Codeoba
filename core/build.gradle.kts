plugins {
    alias(libs.plugins.kotlin.multiplatform)
    alias(libs.plugins.android.kotlin.multiplatform.library)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.compose)
    alias(libs.plugins.kotlin.compose)
}

kotlin {
    // Android target
    androidLibrary {
        namespace = "llc.lookatwhataicando.codeoba.core"
        minSdk = libs.versions.android.minSdk.get().toInt()
        compileSdk = libs.versions.android.compileSdk.get().toInt()

        compilerOptions {
            jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
        }
    }
    
    // JVM Desktop target - fully implemented
    jvm("desktop") {
        compilerOptions {
            jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
        }
    }
    
    // Note: iOS target temporarily disabled in MVP
    // - iOS: Stub implementations exist, full AVAudioEngine integration planned for future release
    //   iOS requires Kotlin/Native which has network access issues in current CI environment
    
    sourceSets {
        val commonMain by getting {
            dependencies {
                implementation(compose.runtime)
                implementation(compose.foundation)
                implementation(compose.material3)
                implementation(compose.materialIconsExtended)
                
                // Coroutines
                implementation(libs.kotlinx.coroutines.core)
                
                // Serialization
                implementation(libs.kotlinx.serialization.json)
                
                // Ktor for networking
                implementation(libs.ktor.client.core)
                implementation(libs.ktor.client.websockets)
                implementation(libs.ktor.client.content.negotiation)
                implementation(libs.ktor.serialization.kotlinx.json)
            }
        }
        
        val androidMain by getting {
            dependencies {
                implementation(libs.ktor.client.okhttp)
                implementation(libs.webrtc.android)
                implementation(libs.audioswitch)
            }
        }
        
        val desktopMain by getting {
            dependencies {
                implementation(libs.ktor.client.cio)
                
                // Platform-specific JavaFX native libraries for WebView support
                val osName = System.getProperty("os.name").lowercase()
                val platform = when {
                    osName.contains("mac") || osName.contains("darwin") -> "mac"
                    osName.contains("win") -> "win"
                    osName.contains("linux") -> "linux"
                    else -> "linux"
                }
                
                implementation("org.openjfx:javafx-base:${libs.versions.javafx.get()}:$platform")
                implementation("org.openjfx:javafx-graphics:${libs.versions.javafx.get()}:$platform")
                implementation("org.openjfx:javafx-controls:${libs.versions.javafx.get()}:$platform")
                implementation("org.openjfx:javafx-web:${libs.versions.javafx.get()}:$platform")
                implementation("org.openjfx:javafx-swing:${libs.versions.javafx.get()}:$platform")
            }
        }
    }
}
