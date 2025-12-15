# Development Setup

> **Note:** For current implementation status, see [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)

This guide covers setting up your development environment for Codeoba across all supported platforms.

---

## Prerequisites

### All Platforms

- **JDK 11 or higher** - Required for Kotlin compilation
  - Download from [AdoptOpenJDK](https://adoptopenjdk.net/) or [Oracle](https://www.oracle.com/java/technologies/downloads/)
  
- **Git** - For version control
  - Download from [git-scm.com](https://git-scm.com/)

### Android Development

- **Android Studio** - Otter 2025.2.2 or newer
  - Download from [developer.android.com](https://developer.android.com/studio)
  - Includes Android SDK and emulator

- **Android SDK** - API level 24 (Android 7.0) or higher
  - Configured automatically in Android Studio

### iOS Development

- **macOS** - Required for iOS development
- **Xcode 14+** - For iOS compilation
  - Download from Mac App Store
- **CocoaPods** - Dependency manager for iOS
  ```bash
  sudo gem install cocoapods
  ```

### Desktop Development

- No additional requirements beyond JDK

---

## Clone the Repository

```bash
git clone https://github.com/LookAtWhatAiCanDo/Codeoba.git
cd Codeoba
```

---

## Configuration

### API Keys and Secrets

Codeoba requires an OpenAI API key for the Realtime API. **Never commit API keys to the repository.**

#### Configuration Methods

**Android:**
- API keys are stored securely using Android Keystore encryption
- Default key can be provided via `local.properties` (see below)
- Keys are encrypted in SharedPreferences using AES/GCM

**Desktop:**
- Environment variable: `OPENAI_API_KEY`
- System property: `-Dopenai.api.key=sk-...`
- local.properties file: `DANGEROUS_OPENAI_API_KEY=sk-...`

#### Setting Up local.properties

Create a `local.properties` file in the project root (this file is gitignored):

```properties
# local.properties
# For Android: Provides default API key (stored encrypted on first run)
DANGEROUS_OPENAI_API_KEY=sk-your-api-key-here

# Optional: Custom Realtime endpoint
realtime.endpoint=wss://api.openai.com/v1/realtime
```

**Why "DANGEROUS"?**
The prefix reminds developers that this is a development convenience. In production:
- Android: Users should enter their own API key through the app UI
- Desktop: Use environment variables or secure configuration management

#### Alternative: Environment Variables (Desktop/CI)

For desktop or CI environments:

```bash
export OPENAI_API_KEY=sk-your-api-key-here
export REALTIME_ENDPOINT=wss://api.openai.com/v1/realtime  # optional
```

Or use system properties:

```bash
./gradlew :app-desktop:run -Dopenai.api.key=sk-your-api-key-here
```

#### Getting an OpenAI API Key

1. Sign up at [platform.openai.com](https://platform.openai.com/)
2. Navigate to API Keys section
3. Create a new API key with the following permissions:
   - **List models** = Read
   - **Model capabilities/Realtime** = Request
4. Copy and save it securely (you won't be able to see it again)

> **Note:** OpenAI Realtime API may have specific pricing and availability. Check [OpenAI's pricing page](https://openai.com/pricing) for current details.

#### Security Best Practices

- ✅ Use `local.properties` for local development (gitignored)
- ✅ Android encrypts keys using Android Keystore
- ✅ Use environment variables in CI/production
- ❌ Never hardcode API keys in source files
- ❌ Never commit `local.properties` to git

---

## Building

### Android

#### Using Gradle

```bash
# Debug build
./gradlew :app-android:assembleDebug

# Install on connected device/emulator
./gradlew :app-android:installDebug

# Run directly
./gradlew :app-android:installDebugAndroidTest
```

#### Using Android Studio

1. Open the project in Android Studio
2. Select `app-android` run configuration
3. Click Run (green play button) or press Shift+F10

### Desktop

```bash
# Run the app
./gradlew :app-desktop:run

# Create distributable package for your OS
./gradlew :app-desktop:packageDistributionForCurrentOS

# Create packages for all platforms (macOS only for .dmg)
./gradlew :app-desktop:packageDmg    # macOS
./gradlew :app-desktop:packageMsi    # Windows
./gradlew :app-desktop:packageDeb    # Linux
```

### iOS

iOS support is currently stubbed in MVP. To prepare for iOS development:

1. Ensure Xcode is installed
2. Navigate to the iOS project folder (when available)
3. Run `pod install` to install CocoaPods dependencies
4. Open the `.xcworkspace` file in Xcode
5. Build and run on simulator or device

---

## Running

### Android

#### Emulator

1. Open Android Studio
2. AVD Manager → Create Virtual Device
3. Select a device (e.g., Pixel 5)
4. Select a system image (API 24+)
5. Launch the emulator
6. Run the app from Android Studio or:
   ```bash
   ./gradlew :app-android:installDebug
   ```

#### Physical Device

1. Enable Developer Options on your device
2. Enable USB Debugging
3. Connect via USB
4. Run:
   ```bash
   ./gradlew :app-android:installDebug
   ```

**Required Permissions:**
- Microphone access (RECORD_AUDIO) - Required for voice input
- Internet access - Required for OpenAI API

### Desktop

```bash
./gradlew :app-desktop:run
```

The application window will open automatically.

---

## MCP Configuration

### GitHub Integration

Codeoba uses MCP (Model Context Protocol) to interact with GitHub. Setup:

1. **GitHub Personal Access Token**
   - Create a token at [github.com/settings/tokens](https://github.com/settings/tokens)
   - Required scopes: `repo`, `workflow`

2. **MCP Server** (Future - Not Required for MVP)
   - Install MCP server (when available)
   - Configure endpoint in `local.properties`:
     ```properties
     mcp.endpoint=http://localhost:8080
     github.token=ghp_your_token_here
     ```

Currently, the MCP client is stubbed with simulated responses for MVP demonstration.

---

## Platform-Specific Notes

### Android

- **Minimum SDK:** API 24 (Android 7.0)
- **Target SDK:** API 34 (Android 14)
- **Audio Format:** 16kHz mono PCM-16 (compatible with OpenAI Realtime)

**Permissions:**

The app requests these permissions at runtime:
- `RECORD_AUDIO` - Microphone access
- `BLUETOOTH_CONNECT` - Bluetooth headset routing (Android 12+)

### Desktop

- **Supported OS:** macOS, Windows, Linux
- **Audio:** JavaSound API (basic functionality)
- **Distribution:** Creates native installers (.dmg, .msi, .deb)

### iOS

- **Minimum iOS:** 14.0
- **Audio:** AVAudioEngine (planned)
- **Permissions:** NSMicrophoneUsageDescription in Info.plist

---

## Troubleshooting

### Build Failures

**Gradle sync failed:**
```bash
./gradlew clean
./gradlew build --refresh-dependencies
```

**Android build tools not found:**
- Open Android Studio
- SDK Manager → Install latest Build Tools

**Kotlin version conflicts:**
- Check `gradle.properties` and `build.gradle.kts`
- Ensure all Kotlin versions match

### Runtime Issues

**Microphone not working on Android:**
- Check if permission is granted in device Settings
- Verify `RECORD_AUDIO` permission in AndroidManifest.xml
- Test with a physical device (emulators may have audio issues)

**Connection timeout:**
- Verify API key is correct
- Check internet connectivity
- Confirm endpoint URL is correct

**Bluetooth audio not routing:**
- Ensure Bluetooth device is paired and connected
- Check that `BLUETOOTH_CONNECT` permission is granted (Android 12+)
- Try refreshing audio routes in the app

---

## IDE Setup

### IntelliJ IDEA / Android Studio

Recommended plugins:
- Kotlin Multiplatform Mobile (KMM)
- Compose Multiplatform IDE Support

### VS Code

While not officially supported, you can use VS Code with:
- Kotlin extension
- Gradle for Java extension

---

## Next Steps

- Read [Architecture Overview](architecture.md) to understand the codebase
- Check the [main README](../README.md) for current MVP status
- Review [FRAMEWORK_EVALUATION.md](../FRAMEWORK_EVALUATION.md) for technical decisions

---

## Getting Help

- **Issues:** [GitHub Issues](https://github.com/LookAtWhatAiCanDo/Codeoba/issues)
- **Discussions:** [GitHub Discussions](https://github.com/LookAtWhatAiCanDo/Codeoba/discussions)
- **Epic Tracker:** [N-project series](https://github.com/LookAtWhatAiCanDo/Ideation/issues/4)
