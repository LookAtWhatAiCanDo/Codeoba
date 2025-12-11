# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Enhanced voice activity detection
- Multi-language support
- Custom MCP server implementations
- Advanced code refactoring capabilities
- Team collaboration features
- Offline mode with local models

## [1.0.0] - 2024-12-11

### Added

#### Core Features
- **Voice Input System**
  - WebRTC-based microphone streaming
  - Real-time audio capture with 24kHz sample rate
  - Audio processing with echo cancellation and noise suppression
  - Configurable audio chunk buffering

- **OpenAI Realtime API Integration**
  - WebSocket client for real-time communication
  - Support for audio and text modalities
  - Server-side voice activity detection
  - Function calling support for code actions
  - Comprehensive response handling for all message types

- **Model Context Protocol (MCP)**
  - JSON-RPC 2.0 client implementation
  - Tool discovery and execution
  - Support for code operations (create, edit, delete, read, list)
  - Resource and prompt management
  - Mock server for development and testing

- **GitHub Integration**
  - Repository selection and management
  - File CRUD operations via GitHub API
  - Branch and commit support
  - Code generation utilities
  - GitHub Copilot-style suggestions

- **User Interface**
  - Modern Material Design 3 interface
  - Connection status indicator
  - Microphone toggle with visual feedback
  - Real-time activity log viewer
  - Repository selector
  - Transcription and response display
  - Settings panel for API keys

#### Cross-Platform Support
- Android (SDK 21+)
- iOS (12+)
- macOS
- Windows
- Linux
- Web (experimental)

#### Development Infrastructure
- **Testing**
  - Unit tests for all major components
  - Test suite for WebRTC, Realtime API, MCP, and UI
  - Mock implementations for offline testing

- **CI/CD**
  - GitHub Actions workflow for all platforms
  - Automated code quality checks
  - Build artifacts for Android, iOS, and Desktop
  - Code coverage reporting

- **Documentation**
  - Comprehensive README with getting started guide
  - Framework evaluation document (Flutter vs KMP vs Qt vs React Native)
  - Architecture documentation
  - Configuration guide
  - Quick start guide
  - Contributing guidelines

### Technical Specifications

#### Dependencies
- Flutter SDK 3.16.0+
- Dart SDK 3.0.0+
- flutter_webrtc: ^0.9.48
- web_socket_channel: ^2.4.0
- http: ^1.1.0
- permission_handler: ^11.0.1
- provider: ^6.1.1
- github: ^9.19.0
- logger: ^2.0.2

#### Architecture
- Clean architecture with separated concerns
- Provider-based state management
- Stream-based event handling
- Modular component design
- Platform-agnostic core logic

#### Security
- Secure API key handling (memory-only storage)
- No persistent credential storage
- User-controlled microphone access
- Minimal permission requests
- Secure WebSocket connections (WSS)

### Documentation
- README.md - Project overview and setup
- docs/FRAMEWORK_EVAL.md - Technology selection rationale
- docs/ARCHITECTURE.md - System design and data flow
- docs/CONFIGURATION.md - Setup and configuration guide
- docs/QUICKSTART.md - 5-minute getting started guide
- CONTRIBUTING.md - Contribution guidelines
- .env.example - Environment configuration template

### Build Configuration
- Flutter format configuration
- Linter rules (flutter_lints)
- GitHub Actions CI/CD pipeline
- Platform-specific configurations
- .gitignore for Flutter projects

## Release Notes

### Version 1.0.0 Highlights

This is the initial release of Codeoba, a cross-platform voice-driven AI programming assistant. The application enables developers to write code using natural voice commands through an innovative pipeline:

**Voice → OpenAI Realtime API → MCP Protocol → GitHub → Code**

Key capabilities:
- Speak your coding intentions naturally
- AI understands and generates appropriate code
- Direct integration with GitHub repositories
- Real-time feedback and logging
- Works across all major platforms

### Migration Guide

This is the first release, no migration needed.

### Breaking Changes

N/A - Initial release

### Known Issues

- WebRTC may require browser-specific permissions on web platform
- iOS simulator may have limited microphone support
- Some advanced MCP features require custom server implementation
- GitHub API rate limits apply to repository operations

### Credits

Built with:
- Flutter framework
- OpenAI Realtime API
- Model Context Protocol
- GitHub API
- flutter_webrtc package

---

For more details on any release, see the [GitHub Releases](https://github.com/LookAtWhatAiCanDo/Codeoba/releases) page.
