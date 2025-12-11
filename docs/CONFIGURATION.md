# Configuration Guide

## Environment Setup

### Required API Keys

1. **OpenAI API Key**
   - Sign up at [OpenAI Platform](https://platform.openai.com/)
   - Navigate to API Keys section
   - Create new key with Realtime API access
   - Format: `sk-...`

2. **GitHub Personal Access Token**
   - Go to [GitHub Settings > Developer Settings > Personal Access Tokens](https://github.com/settings/tokens)
   - Generate new token (classic)
   - Required scopes:
     - `repo` (Full control of private repositories)
     - `workflow` (Update GitHub Action workflows)
   - Format: `ghp_...`

## Application Configuration

### WebRTC Settings

Configure in `src/webrtc/webrtc_service.dart`:

```dart
final Map<String, dynamic> mediaConstraints = {
  'audio': {
    'echoCancellation': true,  // Enable echo cancellation
    'noiseSuppression': true,  // Enable noise suppression
    'autoGainControl': true,   // Enable automatic gain control
    'sampleRate': 24000,       // Sample rate (Hz)
    'channelCount': 1,         // Mono (1) or Stereo (2)
  },
};
```

### Realtime API Settings

Configure in `src/realtime/realtime_api_client.dart`:

```dart
RealtimeAPIClient({
  required this.apiKey,
  this.model = 'gpt-4o-realtime-preview-2024-10-01', // AI model
});
```

Session configuration:
```dart
'session': {
  'modalities': ['text', 'audio'],           // Input/output modes
  'instructions': 'Your custom instructions', // AI behavior
  'voice': 'alloy',                           // Voice selection
  'input_audio_format': 'pcm16',              // Audio format
  'output_audio_format': 'pcm16',             // Audio format
  'turn_detection': {
    'type': 'server_vad',                     // Voice activity detection
    'threshold': 0.5,                         // Sensitivity (0.0-1.0)
    'prefix_padding_ms': 300,                 // Pre-speech buffer
    'silence_duration_ms': 500,               // End-of-speech delay
  },
}
```

### MCP Server Configuration

Configure in `src/mcp/mcp_client.dart`:

```dart
MCPClient({
  serverUrl: 'http://localhost:3000',  // MCP server URL
});
```

For custom MCP servers, update the URL and implement transport layer.

### Audio Processing

Configure in `src/webrtc/audio_processor.dart`:

```dart
AudioProcessor({
  this.sampleRate = 24000,      // Must match WebRTC setting
  this.channels = 1,             // Mono audio
  int chunkSizeMs = 100,         // Chunk duration in milliseconds
});
```

## Platform-Specific Configuration

### Android

Edit `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.INTERNET"/>
<uses-permission android:name="android.permission.RECORD_AUDIO"/>
<uses-permission android:name="android.permission.CAMERA"/>
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS"/>
```

Minimum SDK in `android/app/build.gradle`:
```gradle
android {
    defaultConfig {
        minSdkVersion 21
        targetSdkVersion 33
    }
}
```

### iOS

Edit `ios/Runner/Info.plist`:

```xml
<key>NSMicrophoneUsageDescription</key>
<string>This app needs microphone access for voice commands</string>
<key>NSCameraUsageDescription</key>
<string>This app needs camera access for video calls</string>
```

Minimum iOS version in `ios/Podfile`:
```ruby
platform :ios, '12.0'
```

### macOS

Edit `macos/Runner/DebugProfile.entitlements` and `macos/Runner/Release.entitlements`:

```xml
<key>com.apple.security.device.audio-input</key>
<true/>
<key>com.apple.security.network.client</key>
<true/>
```

### Linux

Ensure required libraries are installed:
```bash
sudo apt-get install -y \
  libgtk-3-dev \
  libgstreamer1.0-dev \
  libgstreamer-plugins-base1.0-dev
```

### Windows

No additional configuration required for basic functionality.

## Build Configuration

### Debug Build

```bash
flutter run --debug
```

Features:
- Hot reload enabled
- Verbose logging
- Debug symbols included
- Performance overlay available

### Release Build

```bash
flutter build <platform> --release
```

Features:
- Code optimization
- Minimal logging
- Smaller binary size
- No debug symbols

### Profile Build

```bash
flutter run --profile
```

Features:
- Performance profiling
- Some optimizations
- Debug symbols included

## Logging Configuration

Adjust log levels in service files:

```dart
final Logger _logger = Logger(
  level: Level.debug,  // debug, info, warning, error
  printer: PrettyPrinter(),
);
```

## Network Configuration

### Proxy Settings

If behind a corporate proxy, configure in your environment:

```bash
export HTTP_PROXY=http://proxy.example.com:8080
export HTTPS_PROXY=http://proxy.example.com:8080
export NO_PROXY=localhost,127.0.0.1
```

### Firewall Rules

Ensure these connections are allowed:
- `api.openai.com:443` (HTTPS/WSS)
- `github.com:443` (HTTPS)
- Custom MCP server port (default: 3000)

## Performance Tuning

### Audio Buffer Size

Adjust for latency vs. stability:
- **Lower latency**: 50-100ms chunks
- **Better stability**: 100-200ms chunks

### WebSocket Buffer

For high-latency connections:
```dart
// Increase buffer size in RealtimeAPIClient
final bufferSize = 8192; // bytes
```

### Memory Management

Monitor memory usage and adjust:
- Log retention (default: 100 entries)
- Audio buffer size
- Message queue size

## Development vs. Production

### Development Settings

- Verbose logging enabled
- Mock MCP responses for testing
- Relaxed error handling
- Debug UI controls

### Production Settings

- Minimal logging (errors only)
- Real MCP server connections
- Strict error handling
- Clean UI without debug info

## Environment Variables

Create `.env` file (not committed):

```bash
OPENAI_API_KEY=sk-...
GITHUB_TOKEN=ghp_...
MCP_SERVER_URL=http://localhost:3000
LOG_LEVEL=info
```

Load in app:
```dart
import 'package:flutter_dotenv/flutter_dotenv.dart';

await dotenv.load();
final apiKey = dotenv.env['OPENAI_API_KEY'];
```

## Testing Configuration

### Unit Tests

```bash
flutter test
```

### Integration Tests

```bash
flutter test integration_test/
```

### Platform Tests

```bash
flutter drive --target=test_driver/app.dart
```

## Troubleshooting

### Common Issues

1. **Microphone not working**
   - Check permissions granted
   - Verify audio constraints
   - Test on different browser/platform

2. **WebSocket connection fails**
   - Verify API key
   - Check network connectivity
   - Review firewall rules

3. **Build failures**
   - Run `flutter clean`
   - Update dependencies: `flutter pub get`
   - Check platform-specific requirements

## Security Best Practices

1. **Never commit API keys**
   - Use `.env` files
   - Add to `.gitignore`
   - Use environment variables

2. **Rotate tokens regularly**
   - GitHub tokens: every 90 days
   - OpenAI keys: as needed

3. **Limit token permissions**
   - GitHub: only required scopes
   - Use short-lived tokens when possible

4. **Monitor usage**
   - Track API calls
   - Set usage alerts
   - Review logs regularly
