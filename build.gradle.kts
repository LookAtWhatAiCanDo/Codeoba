plugins {
    // Kotlin Multiplatform
    alias(libs.plugins.kotlin.multiplatform) apply false
    
    // Compose
    alias(libs.plugins.compose) apply false
    
    // Serialization
    alias(libs.plugins.kotlin.serialization) apply false

    // Android
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.android.library) apply false
}

allprojects {
    group = "com.codeoba"
    version = "1.0.0"
}
