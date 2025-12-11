# Codeoba

**Codeoba** is a cross-platform voice-based AI programming assistant that lets you talk to your development environment and have AI (via OpenAI Realtime API + MCP + GitHub/Copilot tooling) perform real actions on your repositories.

Built with **Compose Multiplatform** and **Kotlin**, Codeoba targets:
- 📱 **Android** (phone/tablet)
- 🍎 **iOS** (iPhone/iPad) 
- 💻 **Desktop** (macOS/Windows/Linux)
- 🌐 **Web** (browser)

Future support planned for:
- ⌚ **WearOS / watchOS** companion apps

---

## 🎯 Features

- **Voice-driven programming**: Speak commands to control your dev environment
- **Real-time AI transcription**: OpenAI Realtime API integration for instant voice recognition
- **MCP integration**: Execute GitHub/Copilot actions via Model Context Protocol
- **Multi-platform**: Single Kotlin codebase targeting all major platforms
- **Audio routing**: Smart Bluetooth headset and device audio management
- **Event logging**: Clear visibility into voice → transcript → actions → results

---

## 🏗️ Architecture

Codeoba uses a clean multiplatform architecture with shared business logic and platform-specific implementations:

### Modules

- **`:core`** - Shared business logic, domain models, and UI (Kotlin Multiplatform)
- **`:app-android`** - Android application with platform-specific implementations
- **`:app-desktop`** - Desktop (JVM) application 
- **`:app-ios`** - iOS application (stub in MVP)
- **`:app-web`** - Web application (planned)

### Core Abstractions

All platform-specific functionality is abstracted behind interfaces:

- `AudioCaptureService` - Microphone audio capture
- `AudioRouteManager` - Audio routing (Bluetooth, speaker, etc.)
- `RealtimeClient` - OpenAI Realtime API connection
- `McpClient` - MCP/GitHub integration
- `CompanionProxy` - Future wearable device support

See [docs/architecture.md](docs/architecture.md) for detailed architecture documentation.

---

## 🚀 Getting Started

### Prerequisites

- JDK 11 or higher
- Android Studio (for Android development)
- Xcode (for iOS development, macOS only)

### Build & Run

#### Android

```bash
./gradlew :app-android:assembleDebug
./gradlew :app-android:installDebug
```

Or open the project in Android Studio and run the `app-android` configuration.

#### Desktop

```bash
./gradlew :app-desktop:run
```

To create a distributable package:

```bash
./gradlew :app-desktop:packageDistributionForCurrentOS
```

#### iOS

iOS support is stubbed in the MVP. Full implementation coming in future releases.

### Configuration

Before running, you need to configure your OpenAI API key. See [docs/dev-setup.md](docs/dev-setup.md) for details.

---

## 📚 Documentation

- [Architecture Overview](docs/architecture.md) - System design and module structure
- [Development Setup](docs/dev-setup.md) - Detailed setup instructions and configuration
- [Framework Evaluation](FRAMEWORK_EVALUATION.md) - Analysis of why Compose Multiplatform was chosen

---

## 🧪 Current Status (MVP)

**Implemented:**
- ✅ Project structure with Gradle and Compose Multiplatform
- ✅ Core domain models and interfaces
- ✅ Android audio capture with AudioRecord
- ✅ Android audio route management (Bluetooth support)
- ✅ Desktop stub implementations
- ✅ iOS stub implementations
- ✅ Shared Compose UI
- ✅ Event logging system
- ✅ Basic Realtime client structure
- ✅ Basic MCP client structure

**In Progress:**
- 🚧 OpenAI Realtime API WebSocket integration
- 🚧 MCP protocol implementation
- 🚧 iOS audio capture (AVAudioEngine)
- 🚧 Web platform support

**Planned:**
- 📋 WearOS companion app
- 📋 watchOS companion app
- 📋 Enhanced Bluetooth audio routing
- 📋 Secure API key storage

---

## 🤝 Contributing

Contributions are welcome! This is part of the N-project series. See the [main ideation repo](https://github.com/LookAtWhatAiCanDo/Ideation/issues/4) for the broader vision.

---

## 📄 License

See [LICENSE](LICENSE) for details.

---

## Framework Evaluation

See [FRAMEWORK_EVALUATION.md](FRAMEWORK_EVALUATION.md) for a comprehensive analysis of various cross-platform framework options and why Compose Multiplatform was selected.