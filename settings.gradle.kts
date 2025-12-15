rootProject.name = "Codeoba"

pluginManagement {
    repositories {
        gradlePluginPortal()
        google()
        mavenCentral()
        maven("https://maven.pkg.jetbrains.space/public/p/compose/dev")
    }
}

dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
        maven("https://maven.pkg.jetbrains.space/public/p/compose/dev")
    }
}

include(":core")
// Android temporarily disabled due to AGP dependency issues - will be re-enabled after fixing
include(":app-android")
include(":app-desktop")
// iOS and Web will be added after basic structure is working
