import com.android.build.gradle.internal.cxx.configure.gradleLocalProperties

plugins {
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.android.application)
    alias(libs.plugins.compose)
}

android {
    namespace = "com.codeoba.android"
    compileSdk = 34
    
    defaultConfig {
        applicationId = "com.codeoba.android"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"
        
        // Load API key from local.properties for development
        // This provides a default value that can be overridden at runtime
        val localProperties = gradleLocalProperties(rootDir)
        val dangerousOpenAiKey = localProperties.getProperty("DANGEROUS_OPENAI_API_KEY") ?: ""
        buildConfigField("String", "DANGEROUS_OPENAI_API_KEY", "\"$dangerousOpenAiKey\"")
    }
    
    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
    
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    
    kotlinOptions {
        jvmTarget = "11"
    }
    
    buildFeatures {
        compose = true
        buildConfig = true
    }
    
    composeOptions {
        kotlinCompilerExtensionVersion = libs.versions.compose.compiler.get()
    }
}

dependencies {
    implementation(project(":core"))
    implementation(compose.material3)
    implementation(compose.ui)
    implementation(compose.uiTooling)
    implementation(compose.preview)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
}
