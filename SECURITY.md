# Security Policy

## Supported Versions

We release patches for security vulnerabilities for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take the security of Codeoba seriously. If you believe you have found a security vulnerability, please report it to us as described below.

### How to Report

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, please report them via:
1. GitHub Security Advisories (preferred)
2. Email to the maintainers (check CONTRIBUTORS.md)

Include the following information:
- Type of issue (e.g., buffer overflow, SQL injection, cross-site scripting, etc.)
- Full paths of source file(s) related to the manifestation of the issue
- The location of the affected source code (tag/branch/commit or direct URL)
- Any special configuration required to reproduce the issue
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue, including how an attacker might exploit it

### What to Expect

- **Acknowledgment**: We will acknowledge receipt of your vulnerability report within 48 hours
- **Initial Assessment**: We will send an initial assessment within 5 business days
- **Regular Updates**: We will keep you informed about our progress
- **Disclosure**: We will work with you to understand and resolve the issue before any public disclosure

## Security Considerations

### API Keys and Tokens

**Critical**: Never commit API keys or tokens to the repository

- Use `.env` files for local development
- Store in environment variables for production
- Rotate keys regularly (recommended: every 90 days)
- Use tokens with minimal required permissions

**Best Practices**:
```bash
# ✅ Good: Use environment variables
OPENAI_API_KEY=sk-...

# ❌ Bad: Never hardcode in source
final apiKey = 'sk-actual-key-here';  // DON'T DO THIS!
```

### Audio Data Privacy

**OpenAI Processing**:
- Audio is streamed to OpenAI servers for processing
- Review [OpenAI's Privacy Policy](https://openai.com/privacy/)
- No local recording or storage of audio
- Audio processing is real-time only

**User Control**:
- Microphone access requires explicit user permission
- Visual indicator when microphone is active
- Easy on/off toggle for voice input
- No background audio capture

### GitHub Token Security

**Token Permissions**:
- Request only necessary scopes (`repo`, `workflow`)
- Use fine-grained tokens when possible
- Never share tokens between users
- Revoke tokens immediately if compromised

**Token Storage**:
- Stored in memory only during session
- Not persisted to disk
- Not logged or transmitted except to GitHub API
- Cleared on application exit

### Network Security

**Secure Connections**:
- All API calls use HTTPS/WSS
- Certificate validation enabled
- No insecure WebSocket connections
- Proxy support for corporate environments

**Data Transmission**:
- Encrypted in transit (TLS 1.2+)
- No sensitive data in URLs or logs
- Minimal data retention

### Dependencies

**Keeping Dependencies Secure**:
```bash
# Check for vulnerabilities
flutter pub outdated

# Update dependencies
flutter pub upgrade

# Audit dependencies
flutter pub audit
```

**Automated Checks**:
- GitHub Dependabot enabled
- Regular security scans in CI/CD
- Automated dependency updates

### Platform-Specific Security

#### Android
- Minimum SDK 21 (Android 5.0)
- Standard permission model
- No root access required
- App sandboxing enforced

#### iOS
- Minimum iOS 12
- App Transport Security enabled
- Keychain for sensitive data (if added)
- Standard permission prompts

#### Desktop
- Standard OS permissions
- No elevated privileges required
- Sandboxed when distributed via app stores

### Code Security

**Secure Coding Practices**:
- Input validation on all user inputs
- Output encoding for display
- Null safety (Dart 3.0+)
- Type safety throughout codebase
- No use of `dynamic` where avoidable

**WebRTC Security**:
- User consent required for microphone
- No automatic permission requests
- Clear visual indicators
- Microphone access only when needed

### Data Storage

**What We Store**:
- Activity logs (in memory only)
- UI state (session only)
- No persistent user data
- No offline caching of sensitive data

**What We Don't Store**:
- API keys (enter each session)
- Audio recordings
- Code history (unless committed to GitHub)
- Personal information

## Security Features

### Built-in Protections

1. **No Credential Persistence**
   - API keys required each session
   - No automatic credential storage
   - Clear credentials on exit

2. **Minimal Permissions**
   - Request only microphone access
   - No camera, location, or contacts
   - No background execution

3. **Secure Defaults**
   - HTTPS/WSS only
   - Certificate validation
   - Modern TLS versions

4. **Code Isolation**
   - Separated concerns
   - Modular architecture
   - Limited third-party dependencies

### Security Updates

We will:
- Monitor security advisories for dependencies
- Patch vulnerabilities promptly
- Communicate security updates clearly
- Provide migration guides if needed

## Compliance

### Data Protection
- Minimal data collection
- No analytics by default
- User control over all data
- Transparent data handling

### Open Source
- All code is open for review
- Community security audits welcome
- Transparent issue handling
- Public security advisories

## Responsible Disclosure

We follow responsible disclosure practices:
1. Issue reported privately
2. Issue confirmed and assessed
3. Fix developed and tested
4. Security advisory published
5. Fixed version released
6. Public disclosure after users can update

## Questions?

For security questions or concerns that aren't vulnerabilities:
- Open a GitHub Discussion
- Tag with "security" label
- We'll respond within 3 business days

---

**Last Updated**: December 11, 2024
