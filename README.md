# Codeoba - Voice WebRTC AI Programmer

A cross-platform voice-driven AI programming assistant that combines WebRTC audio streaming, OpenAI's Realtime API, Model Context Protocol (MCP), and GitHub Copilot integration to enable natural voice-to-code workflows.

[![CI/CD](https://github.com/LookAtWhatAiCanDo/Codeoba/workflows/CI%2FCD/badge.svg)](https://github.com/LookAtWhatAiCanDo/Codeoba/actions)
[![Code Quality](https://github.com/LookAtWhatAiCanDo/Codeoba/workflows/Code%20Quality/badge.svg)](https://github.com/LookAtWhatAiCanDo/Codeoba/actions)

## Overview

Codeoba enables developers to write code using natural voice commands. Simply speak what you want to build, and the AI will understand your intent, generate code, and commit it to your repository.

### Workflow

**Voice → Realtime API → MCP → GitHub Copilot → Code**

1. **Voice Input**: Capture audio via WebRTC microphone streaming
2. **AI Processing**: Send to OpenAI Realtime API for transcription and understanding
3. **Tool Execution**: Execute code actions through MCP protocol
4. **Code Generation**: Generate code using GitHub Copilot integration
5. **Repository Updates**: Apply changes to your GitHub repository

## Features

- 🎤 **Voice Input**: Real-time microphone streaming with WebRTC
- 🤖 **AI Assistant**: OpenAI Realtime API for natural language understanding
- 🛠️ **MCP Integration**: Model Context Protocol for tool execution
- 💻 **GitHub Integration**: Direct repository access and code generation
- 📱 **Cross-Platform**: Works on Android, iOS, Windows, macOS, and Linux
- 🎨 **Modern UI**: Clean interface with connection status, logs, and controls
- 🔒 **Secure**: API keys stored securely, never committed to repositories

## Technology Stack

Built with **Flutter** (selected after comprehensive framework evaluation - see [docs/FRAMEWORK_EVAL.md](docs/FRAMEWORK_EVAL.md))

### Key Dependencies

- `flutter_webrtc`: WebRTC support for microphone streaming
- `web_socket_channel`: WebSocket connection to Realtime API
- `github`: GitHub API client for repository management
- `provider`: State management
- `logger`: Structured logging

## Project Structure

```
Codeoba/
├── lib/
│   ├── webrtc/          # Microphone streaming and audio processing
│   │   ├── webrtc_service.dart
│   │   └── audio_processor.dart
│   ├── realtime/        # OpenAI Realtime API client
│   │   ├── realtime_api_client.dart
│   │   └── response_handler.dart
│   ├── mcp/             # Model Context Protocol implementation
│   │   ├── mcp_client.dart
│   │   └── tool_executor.dart
│   ├── github/          # GitHub Copilot integration
│   │   ├── copilot_service.dart
│   │   └── code_generator.dart
│   ├── ui/              # User interface components
│   │   ├── main_ui.dart
│   │   ├── app_state.dart
│   │   └── widgets/
│   │       ├── connection_panel.dart
│   │       ├── microphone_button.dart
│   │       ├── log_viewer.dart
│   │       ├── repository_selector.dart
│   │       └── status_indicator.dart
│   └── main.dart        # Application entry point
├── tests/               # Test files
│   ├── webrtc_test.dart
│   ├── realtime_test.dart
│   ├── mcp_test.dart
│   └── app_state_test.dart
├── docs/                # Documentation
│   └── FRAMEWORK_EVAL.md
├── .github/
│   └── workflows/       # CI/CD pipelines
│       ├── ci-cd.yml
│       └── code-quality.yml
├── pubspec.yaml         # Flutter dependencies
└── README.md
```

## Getting Started

### Prerequisites

- Flutter SDK 3.16.0 or higher
- Dart SDK 3.0.0 or higher
- Platform-specific requirements:
  - **Android**: Android Studio, SDK 21+
  - **iOS**: Xcode 15+, iOS 12+
  - **Desktop**: Platform-specific build tools (see Flutter docs)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/LookAtWhatAiCanDo/Codeoba.git
   cd Codeoba
   ```

2. **Install dependencies**
   ```bash
   flutter pub get
   ```

3. **Verify setup**
   ```bash
   flutter doctor
   ```

### Configuration

1. **OpenAI API Key**: Get from [OpenAI Platform](https://platform.openai.com/)
2. **GitHub Personal Access Token**: Generate from [GitHub Settings](https://github.com/settings/tokens)

### Running the Application

#### Desktop (Development)

```bash
# Linux
flutter run -d linux

# macOS
flutter run -d macos

# Windows
flutter run -d windows
```

#### Mobile

```bash
# Android
flutter run -d android

# iOS
flutter run -d ios
```

#### Web

```bash
flutter run -d chrome
```

### Building for Production

#### Android

```bash
flutter build apk --release
# or for app bundle
flutter build appbundle --release
```

#### iOS

```bash
flutter build ios --release
```

#### Desktop

```bash
# Linux
flutter build linux --release

# macOS
flutter build macos --release

# Windows
flutter build windows --release
```

## Usage

1. **Launch the application**

2. **Configure connections**
   - Enter your OpenAI API Key
   - Enter your GitHub Personal Access Token
   - Click "Connect"

3. **Select a repository**
   - Click "Select Repository"
   - Enter owner/organization and repository name

4. **Start coding with voice**
   - Click the microphone button to activate
   - Speak your coding instructions
   - Watch as the AI processes and generates code
   - Monitor the activity log for real-time feedback

### Example Voice Commands

- "Create a new Python function called calculate_sum that takes two parameters"
- "Add error handling to the main function"
- "Refactor the UserService class to use dependency injection"
- "Create a new React component for displaying user profiles"

## Testing

Run all tests:
```bash
flutter test
```

Run with coverage:
```bash
flutter test --coverage
```

View coverage report:
```bash
genhtml coverage/lcov.info -o coverage/html
open coverage/html/index.html
```

## Architecture

### Voice → Realtime → MCP → Copilot Flow

1. **WebRTC Layer** (`src/webrtc/`)
   - Captures microphone audio using `flutter_webrtc`
   - Processes PCM audio data
   - Streams to Realtime API

2. **Realtime API Layer** (`src/realtime/`)
   - Maintains WebSocket connection to OpenAI
   - Sends audio chunks for transcription
   - Receives AI responses and function calls
   - Handles conversation context

3. **MCP Layer** (`src/mcp/`)
   - Implements Model Context Protocol client
   - Executes tool calls from AI
   - Manages code operations (create, edit, delete files)

4. **GitHub Layer** (`src/github/`)
   - Interfaces with GitHub API
   - Manages repository operations
   - Generates code suggestions
   - Commits changes

5. **UI Layer** (`src/ui/`)
   - State management with Provider
   - Real-time status updates
   - Log visualization
   - Connection controls

## Development

### Code Style

This project follows Flutter's official style guide. Run the formatter:

```bash
flutter format .
```

### Linting

```bash
flutter analyze
```

### Adding Dependencies

```bash
flutter pub add <package_name>
flutter pub get
```

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Security

- **API Keys**: Never commit API keys to the repository
- **Tokens**: Store GitHub tokens securely
- **Permissions**: Request only necessary microphone permissions
- **Data**: Audio data is sent to OpenAI's servers - review their privacy policy

## Troubleshooting

### WebRTC Issues

- Ensure microphone permissions are granted
- Check browser compatibility (Chrome/Edge recommended for web)
- Verify WebRTC is supported on your platform

### Connection Errors

- Validate API keys are correct
- Check network connectivity
- Ensure firewall allows WebSocket connections

### Build Errors

- Run `flutter clean` and `flutter pub get`
- Update Flutter SDK: `flutter upgrade`
- Check platform-specific requirements

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- OpenAI for the Realtime API
- Flutter team for the excellent framework
- WebRTC contributors
- MCP protocol developers
- GitHub for API access

## Roadmap

- [ ] Enhanced voice activity detection
- [ ] Multi-language support
- [ ] Custom MCP server implementations
- [ ] Advanced code refactoring capabilities
- [ ] Team collaboration features
- [ ] Voice commands library
- [ ] Offline mode with local models
- [ ] Plugin system for extensibility

## Support

For issues and questions:
- Open an [issue](https://github.com/LookAtWhatAiCanDo/Codeoba/issues)
- Check [documentation](docs/)
- Review [framework evaluation](docs/FRAMEWORK_EVAL.md)

---

**Built with ❤️ using Flutter**