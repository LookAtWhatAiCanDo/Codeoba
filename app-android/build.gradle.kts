import com.android.build.gradle.internal.cxx.configure.gradleLocalProperties

plugins {
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.android.application)
    alias(libs.plugins.compose)
    alias(libs.plugins.kotlin.compose)
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_21)
    }
}

android {
    namespace = "llc.lookatwhataicando.codeoba.android"
    compileSdk = libs.versions.android.compileSdk.get().toInt()
    
    defaultConfig {
        applicationId = "llc.lookatwhataicando.codeoba.android"
        minSdk = libs.versions.android.minSdk.get().toInt()
        targetSdk = libs.versions.android.targetSdk.get().toInt()
        versionCode = 1
        versionName = "0.1.0"
        
        // Load API key from local.properties for development
        // This provides a default value that can be overridden at runtime
        val localProperties = gradleLocalProperties(rootDir, providers)
        val dangerousOpenAiKey = localProperties.getProperty("DANGEROUS_OPENAI_API_KEY") ?: ""
        buildConfigField("String", "DANGEROUS_OPENAI_API_KEY", "\"$dangerousOpenAiKey\"")
    }
    
    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
    
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }
    
    buildFeatures {
        compose = true
        buildConfig = true
    }
    
    // Note: As of Kotlin 2.0+, Compose Compiler is bundled with Kotlin
    // The kotlinCompilerExtensionVersion is automatically set by the Compose plugin
    
    // Workaround for 16KB page size compatibility on Android 15+ devices
    // See https://developer.android.com/guide/practices/page-sizes#agp_version_85_or_lower
    packaging {
        jniLibs {
            useLegacyPackaging = true
        }
    }
}

dependencies {
    implementation(project(":core"))
    implementation(compose.material3)
    implementation(compose.materialIconsExtended)
    implementation(compose.ui)
    implementation(compose.uiTooling)
    implementation(compose.preview)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
}
