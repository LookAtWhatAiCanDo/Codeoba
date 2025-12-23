import org.jetbrains.compose.desktop.application.dsl.TargetFormat

plugins {
    kotlin("jvm")
    alias(libs.plugins.compose)
    alias(libs.plugins.kotlin.compose)
}

dependencies {
    implementation(project(":core"))
    implementation(compose.desktop.currentOs)
    implementation(compose.material3)
    
    // SLF4J logging implementation
    implementation(libs.slf4j.simple)
}

compose.desktop {
    application {
        mainClass = "llc.lookatwhataicando.codeoba.desktop.MainKt"
        
        jvmArgs += listOf(
            "--enable-native-access=ALL-UNNAMED"
        )
        
        nativeDistributions {
            targetFormats(TargetFormat.Dmg, TargetFormat.Msi, TargetFormat.Deb)
            packageName = "Codeoba"
            packageVersion = "1.0.0"
        }
    }
}
