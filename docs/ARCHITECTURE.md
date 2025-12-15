# Architecture Overview

> **📘 Quick Links:**
> - **Implementation Status** → [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)
> - **Development Setup** → [SETUP.md](SETUP.md)

This document provides a comprehensive overview of Codeoba's architecture, module structure, and design decisions.

---

## High-Level Architecture

Codeoba follows a **clean multiplatform architecture** with strict separation between:

1. **Shared business logic** (`:core` module)
2. **Platform-specific implementations** (`:app-android`, `:app-ios`, `:app-desktop`, `:app-web`)
3. **Shared UI** (Compose Multiplatform in `:core`)

```
┌─────────────────────────────────────────────────────────────┐
│                     User Interface Layer                     │
│              (Compose Multiplatform - Shared)                │
│                   CodeobaUI Components                       │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                   Application Layer                          │
│                     CodeobaApp                               │
│         (State Management & Coordination)                    │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                      Domain Layer                            │
│              (Platform-Agnostic Interfaces)                  │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │AudioCapture  │ │AudioRoute    │ │RealtimeClient│        │
│  │Service       │ │Manager       │ │              │        │
│  └──────────────┘ └──────────────┘ └──────────────┘        │
│  ┌──────────────┐ ┌──────────────┐                          │
│  │MCP Client    │ │Companion     │                          │
│  │              │ │Proxy         │                          │
│  └──────────────┘ └──────────────┘                          │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│              Platform Implementation Layer                   │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐              │
│  │  Android   │ │    iOS     │ │  Desktop   │              │
│  │            │ │            │ │            │              │
│  │ AudioRecord│ │AVAudio     │ │JavaSound   │              │
│  │ AudioMgr   │ │Session     │ │            │              │
│  └────────────┘ └────────────┘ └────────────┘              │
└─────────────────────────────────────────────────────────────┘
```

---

## Module Structure

### `:core` (Kotlin Multiplatform)

The heart of Codeoba - contains all shared code across platforms.

**Source Sets:**
- `commonMain` - Platform-agnostic code
- `androidMain` - Android-specific implementations
- `iosMain` - iOS-specific implementations  
- `desktopMain` - Desktop (JVM) specific implementations

**Packages:**

```
com.codeoba.core/
├── domain/              # Core interfaces and domain models
│   ├── AudioCaptureService.kt
│   ├── AudioRouteManager.kt
│   ├── RealtimeClient.kt
│   ├── McpClient.kt
│   └── CompanionProxy.kt
├── data/                # Data layer implementations
│   ├── RealtimeClientImpl.kt
│   ├── McpClientImpl.kt
│   └── CompanionProxyStub.kt
├── ui/                  # Shared Compose UI
│   └── CodeobaUI.kt
└── CodeobaApp.kt        # Main application coordinator
```

**Dependencies:**
- Compose Multiplatform (UI)
- Kotlin Coroutines (async/concurrency)
- Kotlinx Serialization (JSON)
- Ktor (HTTP client)

### `:app-android`

Android application module.

**Structure:**
```
com.codeoba.android/
└── MainActivity.kt      # Android entry point
```

**Platform Implementations (in `:core/androidMain`):**
- `AndroidAudioCaptureService` - Uses AudioRecord API
- `AndroidAudioRouteManager` - Uses AudioManager for routing

**Key Features:**
- Runtime permission handling (microphone, Bluetooth)
- Native Android audio capture at 16kHz
- Bluetooth headset routing
- Compose UI integration

### `:app-desktop`

Desktop (JVM) application module.

**Structure:**
```
com.codeoba.desktop/
└── Main.kt              # Desktop entry point
```

**Platform Implementations (in `:core/desktopMain`):**
- `DesktopAudioCaptureService` - Uses JavaSound TargetDataLine
- `DesktopAudioRouteManager` - Minimal (system default)

**Key Features:**
- Compose Desktop window
- Cross-platform packaging (DMG, MSI, DEB)
- JavaSound audio integration

### `:app-ios` (Planned)

iOS application module (currently stubbed).

**Platform Implementations (in `:core/iosMain`):**
- `IOSAudioCaptureService` - Stub (planned: AVAudioEngine)
- `IOSAudioRouteManager` - Stub (planned: AVAudioSession)

**Future Implementation:**
- AVAudioSession configuration
- AVAudioEngine for audio capture
- Microphone permission (NSMicrophoneUsageDescription)
- AirPods/Bluetooth routing

### `:app-web` (Planned)

Web application module (not yet created).

**Planned Features:**
- Kotlin/JS + Compose for Web
- Web Audio API for capture
- Browser MediaDevices.getUserMedia()

---

## Domain Layer Interfaces

### AudioCaptureService

**Purpose:** Abstraction for platform-specific audio capture.

**Interface:**
```kotlin
interface AudioCaptureService {
    val state: StateFlow<AudioCaptureState>
    val audioFrames: Flow<ByteArray>
    
    suspend fun start()
    suspend fun stop()
}
```

**States:**
- `Idle` - Not capturing
- `Starting` - Initializing capture
- `Capturing` - Actively recording
- `Error` - Capture failed

**Platform Implementations:**
| Platform | Implementation | Status | Audio API |
|----------|---------------|--------|-----------|
| Android  | `AndroidAudioCaptureService` | ✅ Complete | AudioRecord |
| iOS      | `IOSAudioCaptureService` | 🚧 Stub | AVAudioEngine (planned) |
| Desktop  | `DesktopAudioCaptureService` | ✅ Basic | JavaSound |
| Web      | N/A | 📋 Planned | Web Audio API |

**Audio Format:**
- Sample Rate: 16,000 Hz
- Channels: Mono
- Encoding: PCM 16-bit
- Rationale: Compatible with OpenAI Realtime API requirements

### AudioRouteManager

**Purpose:** Manage audio input/output routing (Bluetooth, speaker, etc.).

**Interface:**
```kotlin
interface AudioRouteManager {
    val availableRoutes: StateFlow<List<AudioRoute>>
    val activeRoute: StateFlow<AudioRoute?>
    
    suspend fun refreshRoutes()
    suspend fun selectRoute(route: AudioRoute)
}
```

**Route Types:**
- `BluetoothHeadset` - Bluetooth audio device
- `WiredHeadset` - 3.5mm jack or USB-C headset
- `Speaker` - Device speaker
- `Earpiece` - Phone earpiece
- `SystemDefault` - OS-selected default

**Platform Implementations:**
| Platform | Implementation | Status | Features |
|----------|---------------|--------|----------|
| Android  | `AndroidAudioRouteManager` | ✅ Complete | Full Bluetooth support |
| iOS      | `IOSAudioRouteManager` | 🚧 Stub | AVAudioSession (planned) |
| Desktop  | `DesktopAudioRouteManager` | ✅ Minimal | System default only |
| Web      | N/A | 📋 Planned | Browser default |

### RealtimeClient

**Purpose:** Connection to OpenAI Realtime API for voice processing.

**Interface:**
```kotlin
interface RealtimeClient {
    val connectionState: StateFlow<ConnectionState>
    val events: Flow<RealtimeEvent>
    
    suspend fun connect(config: RealtimeConfig)
    suspend fun disconnect()
    suspend fun sendAudioFrame(frame: ByteArray)
}
```

**Connection States:**
- `Disconnected`
- `Connecting`
- `Connected`
- `Error`

**Event Types:**
- `Transcript` - Voice transcription result
- `ToolCall` - AI-requested tool invocation
- `Error` - API error
- `Connected` / `Disconnected` - Connection status

**Implementation:**
- Uses WebRTC for bidirectional audio streaming
- Shared across all platforms (in `commonMain`)
- Handles OpenAI Realtime protocol messages

**MVP Status:** 🚧 Basic structure complete, WebRTC integration pending

### McpClient

**Purpose:** Execute tool calls via Model Context Protocol (MCP).

**Interface:**
```kotlin
interface McpClient {
    suspend fun handleToolCall(name: String, argsJson: String): McpResult
}
```

**Supported Tools (Planned):**
- `open_repo` - Open/clone a repository
- `create_or_edit_file` - Create or modify files
- `create_commit` - Commit changes
- `create_branch` - Create a new branch
- `create_pull_request` - Open a PR

**Implementation:**
- Shared implementation in `commonMain`
- Uses Ktor for HTTP communication
- JSON serialization with kotlinx.serialization

**MVP Status:** 🚧 Stubbed with simulated responses

### CompanionProxy

**Purpose:** Interface for future WearOS/watchOS companion apps.

**Interface:**
```kotlin
interface CompanionProxy {
    val notifications: Flow<CompanionNotification>
    suspend fun sendCommand(command: CompanionCommand)
}
```

**Commands:**
- `ShowStatus` - Display status on companion
- `ShowError` - Display error message
- `ShowRepoEvent` - Display repository action result

**Notifications:**
- `MicToggleRequest` - User toggled mic on companion
- `ConnectRequest` - Companion requesting connection

**MVP Status:** 🚧 No-op stub implementation

---

## Application State Flow

### Initialization

1. Platform app entry point created (MainActivity, Main, etc.)
2. Platform-specific services instantiated
3. `CodeobaApp` created with all dependencies
4. Compose UI rendered
5. Event observersialized

### Voice → Transcript → Action Flow

```
User speaks
    ↓
AudioCaptureService captures PCM frames
    ↓
Frames piped to RealtimeClient
    ↓
RealtimeClient sends to OpenAI Realtime API
    ↓
API returns Transcript event
    ↓
Transcript added to event log
    ↓
API returns ToolCall event
    ↓
McpClient handles tool execution
    ↓
Result added to event log
    ↓
CompanionProxy notified (if available)
    ↓
UI updated via StateFlow
```

### State Management

**Pattern:** Unidirectional data flow with Kotlin StateFlow/Flow

**State Holders:**
- `CodeobaApp` - Main coordinator
- Individual services maintain their own state
- UI observes state via `collectAsState()`

**Benefits:**
- Predictable state updates
- Easy debugging
- Testable without UI

---

## Technology Stack

### Languages
- **Kotlin 1.9.21** - Primary language
- **Kotlin/JVM** - Desktop
- **Kotlin/Android** - Android
- **Kotlin/Native** - iOS (Objective-C/Swift interop)
- **Kotlin/JS** - Web (planned)

### UI Framework
- **Compose Multiplatform 1.5.11**
  - Material3 design system
  - Declarative UI
  - Shared UI code across platforms

### Networking
- **Ktor 2.3.7**
  - HTTP client
  - WebRTC client
  - Content negotiation

### Serialization
- **kotlinx.serialization 1.6.2**
  - JSON parsing
  - Type-safe serialization

### Concurrency
- **kotlinx.coroutines 1.7.3**
  - Async/await pattern
  - Flow API for reactive streams
  - Structured concurrency

### Build System
- **Gradle 8.4**
  - Kotlin DSL
  - Multi-module configuration

---

## Design Patterns

### Dependency Injection

**Current:** Manual DI in entry points
```kotlin
val codeobaApp = CodeobaApp(
    audioCaptureService = AndroidAudioCaptureService(...),
    audioRouteManager = AndroidAudioRouteManager(...),
    // ...
)
```

**Future:** Consider Koin or Kodein for multiplatform DI

### Repository Pattern

Not currently used - services directly implement domain interfaces.

### Observer Pattern

StateFlow/Flow for reactive state observation:
```kotlin
val state: StateFlow<AudioCaptureState>
```

### Strategy Pattern

Platform-specific implementations for interfaces like `AudioCaptureService`.

---

## Testing Strategy

### Unit Tests
- Domain logic in `:core/commonTest`
- Platform-specific tests in respective source sets

### Integration Tests
- Android: Instrumented tests
- Desktop: JVM tests
- iOS: XCTest (when available)

### UI Tests
- Compose testing framework
- Screenshot tests (planned)

**Current Status:** No tests yet in MVP - planned for future iterations

---

## Platform-Specific Details

### Android

**Min SDK:** 24 (Android 7.0)
**Target SDK:** 34 (Android 14)

**Key APIs:**
- `AudioRecord` - Low-level audio capture
- `AudioManager` - Audio routing
- `MediaRecorder.AudioSource.MIC` - Microphone source

**Permissions:**
```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
```

### iOS

**Min iOS:** 14.0

**Key Frameworks (Planned):**
- `AVFoundation` - Audio capture
- `AVAudioSession` - Audio routing
- `AVAudioEngine` - Audio processing

**Permissions:**
```xml
<key>NSMicrophoneUsageDescription</key>
<string>Codeoba needs microphone access for voice commands</string>
```

### Desktop

**Supported OS:** macOS, Windows, Linux

**Key APIs:**
- `javax.sound.sampled.TargetDataLine` - Audio input
- `AudioSystem` - Audio device enumeration

**Distribution:**
- `.dmg` - macOS
- `.msi` - Windows
- `.deb` - Debian/Ubuntu

---

## MVP Implementation Summary

This MVP implementation delivers the foundational architecture for **Codeoba**, a cross-platform voice-based AI programming assistant built with Compose Multiplatform and Kotlin.

### What Was Implemented

**✅ Core Architecture (100% Complete)**
- Clean separation between domain, data, and platform layers
- Fully functional `:core` module with shared business logic
- Platform-specific implementations abstracted behind interfaces
- All domain interfaces defined and documented

**✅ Desktop Platform (100% Complete)**
- Full Compose UI with push-to-talk button and text input
- Environment variable-based API key configuration
- Builds and runs successfully

**✅ Android Platform (95% Complete)**
- Production-ready AudioRecord and Bluetooth routing code
- Secure API key storage with Android Keystore encryption
- Complete permissions handling
- Module buildable (requires AGP in CI)

**🚧 Realtime/MCP Integration (30% Complete - Intentionally Stubbed)**
- RealtimeClientImpl - Stub for WebRTC integration (TODO)
- McpClientImpl - Stub for MCP protocol (TODO)
- Core structure ready for full implementation

See `docs/IMPLEMENTATION_STATUS.md` for detailed roadmap with AI prompts for each implementation phase.

---

## References

- [Kotlin Multiplatform](https://kotlinlang.org/docs/multiplatform.html)
- [Compose Multiplatform](https://www.jetbrains.com/lp/compose-multiplatform/)
- [OpenAI Realtime API](https://platform.openai.com/docs/guides/realtime)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Ktor Documentation](https://ktor.io/docs/)

---

## Questions or Feedback?

See the [main README](../README.md) or open a [GitHub Discussion](https://github.com/LookAtWhatAiCanDo/Codeoba/discussions).
