plugins {
    // Kotlin Multiplatform
    kotlin("multiplatform") version "1.9.21" apply false
    
    // Compose
    id("org.jetbrains.compose") version "1.5.11" apply false
    
    // Serialization
    kotlin("plugin.serialization") version "1.9.21" apply false

    // Android
    kotlin("android") version "1.9.21" apply false
    id("com.android.application") version "8.2.0" apply false
    id("com.android.library") version "8.2.0" apply false
}

allprojects {
    group = "com.codeoba"
    version = "1.0.0"
}
