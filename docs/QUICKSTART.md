# Quick Start Guide

## Get Started in 5 Minutes

### Step 1: Install Flutter

If you don't have Flutter installed:

```bash
# macOS/Linux
git clone https://github.com/flutter/flutter.git -b stable
export PATH="$PATH:`pwd`/flutter/bin"

# Windows
# Download from https://flutter.dev/docs/get-started/install/windows
```

Verify installation:
```bash
flutter doctor
```

### Step 2: Clone and Setup

```bash
# Clone the repository
git clone https://github.com/LookAtWhatAiCanDo/Codeoba.git
cd Codeoba

# Install dependencies
flutter pub get
```

### Step 3: Get Your API Keys

**OpenAI API Key**:
1. Visit https://platform.openai.com/api-keys
2. Create new secret key
3. Copy the key (starts with `sk-`)

**GitHub Token**:
1. Visit https://github.com/settings/tokens
2. Generate new token (classic)
3. Select scopes: `repo`, `workflow`
4. Copy the token (starts with `ghp_`)

### Step 4: Run the App

```bash
# For desktop (recommended for development)
flutter run -d macos    # macOS
flutter run -d linux    # Linux
flutter run -d windows  # Windows

# For mobile
flutter run -d android  # Android device/emulator
flutter run -d ios      # iOS device/simulator
```

### Step 5: Connect and Use

1. **Enter API Keys**
   - Click the settings panel at top
   - Enter your OpenAI API key
   - Enter your GitHub token
   - Click "Connect"

2. **Select Repository**
   - Click "Select Repository"
   - Enter owner and repository name
   - Click "Select"

3. **Start Coding**
   - Click the microphone button
   - Speak your coding request
   - Watch the AI generate code!

## Example Voice Commands

Try these to get started:

```
"Create a new Python file called hello.py with a function that prints hello world"

"Add error handling to the main function in app.js"

"Create a React component for a user profile card"

"Write a function to calculate fibonacci numbers recursively"

"Add unit tests for the UserService class"
```

## Troubleshooting Quick Fixes

**Microphone not working?**
```bash
# Check permissions in system settings
# macOS: System Settings > Privacy & Security > Microphone
# Linux: Check PulseAudio/ALSA settings
# Windows: Settings > Privacy > Microphone
```

**Build errors?**
```bash
flutter clean
flutter pub get
flutter run
```

**Connection fails?**
- Verify API keys are correct
- Check internet connection
- Ensure no firewall blocking OpenAI/GitHub

## What's Next?

- Read the full [README.md](../README.md)
- Check [ARCHITECTURE.md](ARCHITECTURE.md) for system design
- Review [CONFIGURATION.md](CONFIGURATION.md) for advanced settings
- See [FRAMEWORK_EVAL.md](FRAMEWORK_EVAL.md) for technology choices

## Need Help?

- Open an issue: https://github.com/LookAtWhatAiCanDo/Codeoba/issues
- Check documentation in `docs/` folder
- Review example code in `src/` folder

## Pro Tips

💡 **Better Voice Recognition**: Speak clearly and pause between commands

💡 **Faster Development**: Use desktop version for development, mobile for demos

💡 **Save API Costs**: Stop microphone when not actively coding

💡 **Repository Access**: Ensure your GitHub token has correct permissions

💡 **Testing**: Use small repositories first to test functionality

---

**Happy Voice Coding! 🎤💻**
