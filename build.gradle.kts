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

    id("org.owasp.dependencycheck") version "12.1.9"
}

allprojects {
    group = "llc.lookatwhataicando.codeoba"
    version = "1.0.0"

    apply(plugin = "org.owasp.dependencycheck")
    dependencyCheck {
        nvd {
            apiKey = System.getenv("NVD_API_KEY")
        }
        analyzers {
            ossIndex {
                enabled = true
                username = System.getenv("OSS_INDEX_USERNAME")
                password = System.getenv("OSS_INDEX_API_TOKEN")
            }
        }
    }
}

configure<org.owasp.dependencycheck.gradle.extension.DependencyCheckExtension> {
    format = org.owasp.dependencycheck.reporting.ReportGenerator.Format.ALL.toString()
}
