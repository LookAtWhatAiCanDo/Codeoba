/// Tests for app state manager

import 'package:flutter_test/flutter_test.dart';
import 'package:codeoba/ui/app_state.dart';

void main() {
  group('AppStateManager', () {
    late AppStateManager appState;

    setUp(() {
      appState = AppStateManager();
    });

    tearDown(() {
      appState.dispose();
    });

    test('should start in disconnected state', () {
      expect(appState.state, AppState.disconnected);
    });

    test('should not have active microphone initially', () {
      expect(appState.isMicrophoneActive, false);
    });

    test('should have empty logs initially', () {
      expect(appState.logs, isEmpty);
    });

    test('should not have selected repository initially', () {
      expect(appState.selectedRepository, null);
    });

    test('should not toggle microphone when disconnected', () async {
      await appState.toggleMicrophone();
      expect(appState.isMicrophoneActive, false);
    });
  });
}
