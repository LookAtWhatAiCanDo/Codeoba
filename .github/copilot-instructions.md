# Copilot Instructions for Codeoba

## Repository Overview

**Codeoba** is a cross-platform voice-based AI programming assistant built with Kotlin Multiplatform and Compose Multiplatform. It streams audio to OpenAI's Realtime API and executes repository actions via Model Context Protocol (MCP).

**Project Type:** Kotlin Multiplatform application  
**Targets:** Android, iOS, Desktop (JVM), Web  
**UI Framework:** Compose Multiplatform  
**Architecture:** Clean architecture with platform-agnostic core

**Repository Size:** ~2,500 lines of Kotlin code across 3 modules

## Technology Stack

- **Language:** Kotlin 1.9.21
- **Build:** Gradle 8.4 with Kotlin DSL
- **UI:** Compose Multiplatform 1.5.11
- **Platforms:**
  - Desktop: JVM (Java 11+)
  - Android: API 24+ (Android Gradle Plugin 8.2.2)
  - iOS: iOS 14+ (planned)
  - Web: Kotlin/JS (planned)
- **Libraries:** Kotlinx.coroutines, Kotlinx.serialization, Ktor (planned)

## Build & Validation Commands

### Bootstrap (First Time Setup)

```bash
# Clone repository
git clone https://github.com/LookAtWhatAiCanDo/Codeoba.git
cd Codeoba

# Verify Gradle wrapper
./gradlew --version
# Expected: Gradle 8.4, Kotlin 1.9.21, JVM 11+

# Sync dependencies
./gradlew clean
```

### Build Commands

**Core module (shared code):**
```bash
./gradlew :core:build
# Success: BUILD SUCCESSFUL
# Artifacts: core/build/libs/core-*.jar
```

**Desktop application:**
```bash
./gradlew :app-desktop:build
# Success: BUILD SUCCESSFUL
# Artifacts: app-desktop/build/libs/app-desktop-*.jar
```

**Android application:**
```bash
./gradlew :app-android:assembleDebug
# Success: BUILD SUCCESSFUL
# Artifacts: app-android/build/outputs/apk/debug/app-android-debug.apk
```

### Test Commands

```bash
# Run all tests
./gradlew test

# Run specific module tests
./gradlew :core:test
./gradlew :app-desktop:test
```

**Note:** Test infrastructure is minimal in MVP. Most validation is manual.

### Lint Commands

```bash
# Android lint
./gradlew :core:lintDebug
./gradlew :app-android:lintDebug

# Kotlin lint (if configured)
./gradlew ktlintCheck
```

### Run Commands

**Desktop application:**
```bash
# Run with environment variable
OPENAI_API_KEY=sk-your-key ./gradlew :app-desktop:run

# Or with system property
./gradlew :app-desktop:run -Dopenai.api.key=sk-your-key

# Or with local.properties
echo "DANGEROUS_OPENAI_API_KEY=sk-your-key" >> local.properties
./gradlew :app-desktop:run
```

**Android application:**
```bash
# Install on connected device/emulator
./gradlew :app-android:installDebug

# Then launch from device
# API key configured in local.properties
```

### Clean Build

```bash
# Clean all build artifacts
./gradlew clean

# Clean and rebuild
./gradlew clean build
```

## Code Style & Patterns

### Architectural Patterns

**Module Structure:**
- `:core` - Platform-agnostic interfaces and shared UI (Kotlin Multiplatform)
- `:app-desktop` - JVM entry point and platform implementations
- `:app-android` - Android entry point and platform implementations

**Clean Architecture Layers:**
1. **Domain** (`core/domain`) - Interfaces: AudioCaptureService, RealtimeClient, McpClient
2. **Data** (`core/data`) - Implementations: RealtimeClientImpl, McpClientImpl
3. **UI** (`core/ui`) - Compose UI components
4. **Platform** (`*/src/*Main/kotlin`) - Platform-specific implementations

**State Management:**
- Use `StateFlow<T>` for state that can be observed
- Use `SharedFlow<T>` for events/occurrences
- Expose immutable flows from services

**Dependency Flow:**
- UI depends on Domain
- Data implements Domain interfaces
- Platform code wires everything together in entry points

### Naming Conventions

- Interfaces: `AudioCaptureService`, `RealtimeClient`
- Implementations: `RealtimeClientImpl`, `AndroidAudioCaptureService`
- UI Components: `ConnectionPanel`, `VoiceControlPanel`
- State classes: `ConnectionState`, `AudioCaptureState`

### Kotlin Style

```kotlin
// Prefer sealed classes for state
sealed class ConnectionState {
    object Disconnected : ConnectionState()
    object Connecting : ConnectionState()
    data class Connected(val sessionId: String) : ConnectionState()
    data class Error(val message: String) : ConnectionState()
}

// Use StateFlow for observable state
interface AudioCaptureService {
    val state: StateFlow<AudioCaptureState>
    suspend fun start()
    suspend fun stop()
}

// Emit events via SharedFlow
interface RealtimeClient {
    val connectionState: StateFlow<ConnectionState>
    val events: SharedFlow<RealtimeEvent>
}
```

## Common Pitfalls

### 1. Platform-Specific Code in Common

**❌ Wrong:**
```kotlin
// In commonMain
import android.content.Context // Won't compile!
```

**✅ Correct:**
```kotlin
// In commonMain - define interface
expect class PlatformContext

// In androidMain - implement
actual typealias PlatformContext = android.content.Context
```

### 2. Mixing StateFlow and SharedFlow

**❌ Wrong:**
```kotlin
val events: StateFlow<RealtimeEvent> // Events aren't state!
```

**✅ Correct:**
```kotlin
val state: StateFlow<ConnectionState> // State
val events: SharedFlow<RealtimeEvent> // Events
```

### 3. Forgetting to Handle Permissions

**❌ Wrong:**
```kotlin
// Android - directly using AudioRecord without permission annotation
AudioRecord(...)
```

**✅ Correct:**
```kotlin
@RequiresPermission(Manifest.permission.RECORD_AUDIO)
suspend fun start() {
    audioRecord = AudioRecord(...)
}
```

### 4. Hardcoding API Keys

**❌ Wrong:**
```kotlin
val apiKey = "sk-1234..." // Never do this!
```

**✅ Correct:**
```kotlin
val apiKey = System.getenv("OPENAI_API_KEY")
    ?: error("OPENAI_API_KEY environment variable not set")
```

### 5. Not Using Gradle Build Cache

```bash
# Slow - always rebuilds
./gradlew clean build

# Fast - uses cache
./gradlew build
```

Only use `clean` when necessary (dependency conflicts, cache corruption).

## Platform-Specific Notes

### Android

- **Min SDK:** 24 (Android 7.0)
- **Target SDK:** 34
- **AGP Version:** 8.2.2
- **IDE:** Android Studio Otter 2025.2.2+

**Key files:**
- `app-android/build.gradle.kts` - Android build configuration
- `app-android/src/main/AndroidManifest.xml` - Permissions and app config
- `core/src/androidMain/kotlin/` - Android platform implementations

**Permissions required:**
- `RECORD_AUDIO` - Microphone access
- `MODIFY_AUDIO_SETTINGS` - Bluetooth routing
- `BLUETOOTH` - Bluetooth headset detection

### Desktop (JVM)

- **Java Version:** 11+
- **Platforms:** macOS, Windows, Linux
- **Distribution:** Gradle `packageDeb`, `packageDmg`, `packageMsi`

**Key files:**
- `app-desktop/build.gradle.kts` - Desktop build configuration
- `app-desktop/src/main/kotlin/Main.kt` - JVM entry point
- `core/src/desktopMain/kotlin/` - Desktop platform implementations

**Audio:** Uses `javax.sound.sampled` APIs (JavaSound)

### iOS (Planned)

- **Min Version:** iOS 14+
- **Framework:** SwiftUI + Compose Multiplatform
- **Audio:** AVAudioEngine/AVAudioSession

**Status:** Stub implementations only. See `docs/IMPLEMENTATION_STATUS.md` for roadmap.

## Troubleshooting

**Build fails with "Android Gradle Plugin not found":**
- Ensure you have internet access (AGP downloads from Google Maven)
- Check `settings.gradle.kts` repository order

**Desktop app won't start:**
- Verify Java 11+ is installed: `java -version`
- Check API key configuration (environment variable or local.properties)

**Android app crashes on audio capture:**
- Check RECORD_AUDIO permission is granted
- Verify mic is not in use by another app

**Gradle sync fails:**
```bash
./gradlew clean
# Delete .gradle folder if needed
rm -rf .gradle
./gradlew --refresh-dependencies
```

## Quick Start for New Tasks

1. **Check current status:** Read `docs/IMPLEMENTATION_STATUS.md`
2. **Understand architecture:** Skim `docs/ARCHITECTURE.md`
3. **Find the task:** Look for AI prompt in IMPLEMENTATION_STATUS.md
4. **Make changes:** Follow architectural patterns
5. **Test locally:** Run builds and manual tests
6. **Update docs:** Update progress tracking if feature completed
7. **Commit:** Use conventional commit format (see `AGENTS.md`)

## Additional Resources

- [Kotlin Multiplatform Docs](https://kotlinlang.org/docs/multiplatform.html)
- [Compose Multiplatform](https://www.jetbrains.com/lp/compose-multiplatform/)
- [OpenAI Realtime API](https://platform.openai.com/docs/guides/realtime)
- [AGENTS.md](../AGENTS.md) - Full AI agent responsibilities
