# Codeoba

[![CI Build](https://github.com/LookAtWhatAiCanDo/Codeoba/actions/workflows/ci.yml/badge.svg)](https://github.com/LookAtWhatAiCanDo/Codeoba/actions/workflows/ci.yml)
[![Security](https://github.com/LookAtWhatAiCanDo/Codeoba/actions/workflows/security.yml/badge.svg)](https://github.com/LookAtWhatAiCanDo/Codeoba/actions/workflows/security.yml)
[![Documentation](https://github.com/LookAtWhatAiCanDo/Codeoba/actions/workflows/docs.yml/badge.svg)](https://github.com/LookAtWhatAiCanDo/Codeoba/actions/workflows/docs.yml)

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
- **Tabbed interface**: Monitor GitHub Copilot Agents progress alongside voice interaction
- **WebView integration**: Cross-platform browser components for GitHub Copilot Agents (fully functional on Android, limited on Desktop)

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

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed architecture documentation.

---

## 🚀 Getting Started

### Prerequisites

- JDK 25 or higher
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

Before running, you need to configure your OpenAI API key. See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for details.

---

## 📚 Documentation

- **[Implementation Status](docs/IMPLEMENTATION_STATUS.md)** - ⭐ **START HERE** - Complete status of what's done and what's next
- **[Issue Tracking](docs/ISSUE_TRACKING.md)** - How we use GitHub Issues for planning and tracking
- **[WebView Evaluation](docs/WEBVIEW_EVALUATION.md)** - 🆕 **December 23, 2025** - Comprehensive WebView technology assessment and decision
  - [Decision Summary](docs/WEBVIEW_DECISION_SUMMARY.md) - Quick overview of WebView evaluation and recommendation
- [Architecture Overview](docs/ARCHITECTURE.md) - System design and module structure
- [Package Structure](docs/PACKAGE_STRUCTURE.md) - Clean Architecture package organization explained
- [Development Setup](docs/DEVELOPMENT.md) - Setup instructions and configuration
- [Framework Evaluation](docs/FRAMEWORK_EVALUATION.md) - Why Compose Multiplatform was chosen
- [GitHub Workflows](.github/workflows/README.md) - CI/CD documentation

---

## 🧪 Current Status

> **📊 For detailed status, see [IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md)**

| Component | Status |
|-----------|--------|
| Desktop App | ✅ Functional (with WebView) |
| Android App | ✅ Ready (enhanced with WebView) |
| Shared UI | 🟡 Tabbed Interface (85%) |
| Realtime API | 🔴 Stub (Desktop), ✅ Complete (Android) |
| MCP Client | 🔴 Stub (10%) |
| iOS App | 🔴 Stub (5%) |

---

## 🤝 Contributing

Contributions are welcome! This is part of the N-project series. See the [main ideation repo](https://github.com/LookAtWhatAiCanDo/Ideation/issues/4) for the broader vision.

---

## 📄 License

See [LICENSE](LICENSE) for details.