# Package Structure Explanation

## Overview

The Codeoba codebase uses a **Clean Architecture** inspired package structure with the following organization:

```
llc.lookatwhataicando.codeoba.core/
├── domain/       # Interfaces and domain models
├── data/         # Interface implementations
├── ui/           # User interface components
└── platform/     # Platform-specific implementations
```

## Package Naming Rationale

### `domain` Package

Contains **interfaces** and **domain models** that define the core business logic abstractions:

- `AudioCaptureService.kt` - Interface for audio capture
- `AudioRouteManager.kt` - Interface for audio routing
- `RealtimeClient.kt` - Interface for OpenAI Realtime API
- `McpClient.kt` - Interface for Model Context Protocol
- `CompanionProxy.kt` - Interface for wearable companion

**Why "domain"?**
- In Clean Architecture, this is the **domain layer** containing business rules
- These are platform-agnostic interfaces that define **what** the application does
- No dependencies on any specific technology or framework

### `data` Package  

Contains **implementations** of the domain interfaces:

- `RealtimeClientImpl.kt` (expect/actual) - Realtime API implementation
- `McpClientImpl.kt` - MCP implementation
- `CompanionProxyStub.kt` - Stub implementation for wearables

**Why "data"?**
- In Clean Architecture, this is the **data layer** that implements domain interfaces
- These classes handle **how** the application interacts with external APIs and services
- Contains the actual logic for WebRTC connections, HTTP requests, etc.

### `platform` Package

Contains **platform-specific** implementations:

- `AndroidAudioCaptureService.kt` - Android microphone capture using AudioRecord
- `AndroidAudioRouteManager.kt` - Android Bluetooth/speaker routing
- `DesktopAudioCaptureService.kt` - Desktop microphone capture using JavaSound
- `DesktopAudioRouteManager.kt` - Desktop audio routing

**Why "platform"?**
- These are implementations that are specific to Android or Desktop platforms
- Cannot be shared between platforms due to platform-specific APIs
- Kept separate from the common `data` implementations

### `ui` Package

Contains **Compose Multiplatform** UI components:

- `CodeobaUI.kt` - Main UI composition

**Why "ui"?**
- Clear separation of presentation layer
- All UI code in one place

## Alternative Considered

An alternative structure would be feature-based packages like:

```
llc.lookatwhataicando.codeoba/
├── audio/
│   ├── capture/
│   ├── routing/
├── realtime/
├── mcp/
└── ui/
```

However, the current layer-based structure was chosen because:
1. **Clear separation of concerns** - Easy to find all interfaces or all implementations
2. **Kotlin Multiplatform conventions** - Common code separated from platform-specific
3. **Dependency flow** - UI → Data → Domain, clear unidirectional dependencies
4. **Scalability** - Easy to add new features without restructuring

## Summary

- **`domain`** = Interfaces and business rules (what)
- **`data`** = Implementations and external integrations (how)
- **`platform`** = Platform-specific code (where)
- **`ui`** = User interface (view)

This structure follows Clean Architecture principles while being pragmatic for a multiplatform Kotlin project.
