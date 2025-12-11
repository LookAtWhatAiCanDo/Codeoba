# Contributing to Codeoba

Thank you for your interest in contributing to Codeoba! This document provides guidelines and instructions for contributing.

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Focus on what is best for the community
- Show empathy towards others

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in [Issues](https://github.com/LookAtWhatAiCanDo/Codeoba/issues)
2. If not, create a new issue with:
   - Clear title and description
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshots if applicable
   - System information (OS, Flutter version)

### Suggesting Features

1. Check [Issues](https://github.com/LookAtWhatAiCanDo/Codeoba/issues) for existing feature requests
2. Create a new issue with:
   - Clear description of the feature
   - Use cases and benefits
   - Possible implementation approach
   - Any relevant examples or mockups

### Pull Requests

1. **Fork the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/Codeoba.git
   cd Codeoba
   ```

2. **Create a branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make your changes**
   - Follow the code style (see below)
   - Write tests for new functionality
   - Update documentation as needed

4. **Test your changes**
   ```bash
   flutter test
   flutter analyze
   flutter format .
   ```

5. **Commit your changes**
   ```bash
   git add .
   git commit -m "Add: brief description of changes"
   ```

   Commit message format:
   - `Add: new feature`
   - `Fix: bug description`
   - `Update: modification description`
   - `Refactor: code improvement`
   - `Docs: documentation changes`

6. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```

7. **Create Pull Request**
   - Go to the original repository
   - Click "New Pull Request"
   - Select your branch
   - Fill in the PR template
   - Link related issues

## Development Setup

### Prerequisites

- Flutter SDK 3.16.0+
- Dart SDK 3.0.0+
- Git
- Your favorite IDE (VS Code, Android Studio, IntelliJ)

### Environment Setup

```bash
# Clone the repository
git clone https://github.com/LookAtWhatAiCanDo/Codeoba.git
cd Codeoba

# Install dependencies
flutter pub get

# Run tests
flutter test

# Run the app
flutter run
```

### IDE Configuration

**VS Code:**
- Install Flutter extension
- Install Dart extension
- Enable format on save

**Android Studio:**
- Install Flutter plugin
- Install Dart plugin
- Configure dartfmt for format on save

## Code Style

### Dart Code Style

Follow the [Dart Style Guide](https://dart.dev/guides/language/effective-dart/style):

```dart
// Good
class UserService {
  final String baseUrl;
  
  UserService({required this.baseUrl});
  
  Future<User> getUser(String id) async {
    // Implementation
  }
}

// Use meaningful variable names
final userId = user.id;

// Prefer const constructors
const SizedBox(height: 16);
```

### Documentation

- Add dartdoc comments for public APIs
- Explain complex logic with inline comments
- Keep comments up-to-date with code changes

```dart
/// Retrieves a user by their unique identifier.
///
/// Returns a [User] object if found, or throws a [UserNotFoundException]
/// if the user does not exist.
///
/// Example:
/// ```dart
/// final user = await userService.getUser('123');
/// print(user.name);
/// ```
Future<User> getUser(String id) async {
  // Implementation
}
```

### Testing

Write tests for all new functionality:

```dart
void main() {
  group('UserService', () {
    late UserService service;

    setUp(() {
      service = UserService(baseUrl: 'https://api.example.com');
    });

    test('should fetch user by id', () async {
      final user = await service.getUser('123');
      expect(user.id, '123');
    });
  });
}
```

## Project Structure

```
src/
├── webrtc/       # Audio streaming components
├── realtime/     # OpenAI API integration
├── mcp/          # MCP protocol implementation
├── github/       # GitHub integration
└── ui/           # User interface
    └── widgets/  # Reusable UI components
```

### Adding New Features

1. **Choose the right module**
   - WebRTC changes → `src/webrtc/`
   - UI changes → `src/ui/`
   - API changes → respective module

2. **Create necessary files**
   - Implementation file (`.dart`)
   - Test file (`tests/`)
   - Documentation updates

3. **Follow naming conventions**
   - Files: `snake_case.dart`
   - Classes: `PascalCase`
   - Variables/functions: `camelCase`
   - Constants: `SCREAMING_SNAKE_CASE`

## Testing Guidelines

### Unit Tests

```bash
# Run all tests
flutter test

# Run specific test file
flutter test tests/webrtc_test.dart

# Run with coverage
flutter test --coverage
```

### Integration Tests

```bash
# Run integration tests
flutter test integration_test/
```

### Widget Tests

```dart
testWidgets('MicrophoneButton toggles state', (WidgetTester tester) async {
  await tester.pumpWidget(MyApp());
  
  final button = find.byType(MicrophoneButton);
  expect(button, findsOneWidget);
  
  await tester.tap(button);
  await tester.pump();
  
  // Verify state changed
});
```

## Documentation

### Updating Documentation

When making changes, update relevant documentation:

- `README.md` - Overview and getting started
- `docs/ARCHITECTURE.md` - System design changes
- `docs/CONFIGURATION.md` - Configuration changes
- `docs/QUICKSTART.md` - Setup process changes

### Writing Documentation

- Use clear, concise language
- Include code examples
- Add screenshots for UI changes
- Keep formatting consistent

## Review Process

### What We Look For

- Code quality and style
- Test coverage
- Documentation updates
- Performance impact
- Security implications
- Cross-platform compatibility

### Timeline

- Initial review: 1-3 days
- Follow-up reviews: 1-2 days
- Merge: After approval and CI passes

## Community

### Getting Help

- GitHub Issues for bugs/features
- Discussions for questions
- Pull Request comments for code review

### Recognition

Contributors will be:
- Listed in CONTRIBUTORS.md
- Mentioned in release notes
- Credited in documentation

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Questions?

Feel free to open an issue or discussion if you have questions about contributing!

---

Thank you for contributing to Codeoba! 🎉
