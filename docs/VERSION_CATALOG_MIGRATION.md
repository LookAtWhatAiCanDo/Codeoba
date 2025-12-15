# Version Catalog Migration

## Overview
This document describes the migration from hardcoded dependency versions to Gradle Version Catalogs.

## What Changed

### New File: `gradle/libs.versions.toml`
Created a centralized version catalog containing:
- **Versions**: All dependency and plugin versions in one place
- **Libraries**: All project dependencies with proper references
- **Plugins**: All Gradle plugins with version references

### Modified Files
1. **`build.gradle.kts`** (root)
   - Plugins now use `alias(libs.plugins.*)` instead of hardcoded versions
   
2. **`core/build.gradle.kts`**
   - Plugins use version catalog aliases
   - Dependencies use `libs.*` references instead of string literals
   
3. **`app-desktop/build.gradle.kts`**
   - Compose plugin uses version catalog alias
   - **Note**: Kotlin JVM plugin uses `kotlin("jvm")` without version to avoid conflicts with the Kotlin Multiplatform plugin from the core module dependency
   
4. **`app-android/build.gradle.kts`**
   - Plugins use version catalog aliases
   - Dependencies use `libs.*` references
   - Compose compiler version uses `libs.versions.compose.compiler.get()`
   
5. **`settings.gradle.kts`**
   - Reordered repositories to prioritize Google Maven for Android plugins

## Benefits

1. **Centralized Version Management**: All versions in one file makes updates easier
2. **Type Safety**: IDE autocomplete for dependency references
3. **Consistency**: Same version used across all modules automatically
4. **Readability**: Clearer dependency declarations with named references
5. **Gradle Best Practice**: Aligns with modern Gradle recommendations

## Usage

### Adding a New Dependency
1. Add the version to `[versions]` section in `gradle/libs.versions.toml`
2. Add the library to `[libraries]` section
3. Reference it in build files as `libs.your.library.name`

### Updating a Version
Simply update the version number in `gradle/libs.versions.toml`. All modules using that dependency will automatically use the new version.

### Example
```toml
[versions]
ktor = "2.3.7"

[libraries]
ktor-client-core = { module = "io.ktor:ktor-client-core", version.ref = "ktor" }
```

```kotlin
dependencies {
    implementation(libs.ktor.client.core)
}
```

## Special Cases

### Kotlin JVM Plugin in app-desktop
The `app-desktop` module uses `kotlin("jvm")` without specifying a version via the catalog. This is intentional to avoid version conflicts - since `app-desktop` depends on the `core` module which applies the Kotlin Multiplatform plugin, the Kotlin version is already on the classpath. Using `kotlin("jvm")` without a version allows it to use the same version from the classpath, preventing the "plugin already on classpath with unknown version" error.

## Testing Notes

The migration is syntactically correct and follows Gradle best practices. However, build verification in the CI environment may be limited by network access restrictions to certain Maven repositories (specifically Google Maven for Android Gradle Plugin).

In a normal development environment with full internet access, the build should work perfectly with:
```bash
./gradlew clean build
```

## References
- [Gradle Version Catalogs Documentation](https://docs.gradle.org/current/userguide/platforms.html)
- [Sharing dependency versions between projects](https://docs.gradle.org/current/userguide/platforms.html#sub:version-catalog)
