/// Tests for Realtime API client

import 'package:flutter_test/flutter_test.dart';
import 'package:codeoba/src/realtime/realtime_api_client.dart';

void main() {
  group('RealtimeAPIClient', () {
    late RealtimeAPIClient client;

    setUp(() {
      client = RealtimeAPIClient(
        apiKey: 'test-api-key',
      );
    });

    tearDown(() {
      client.dispose();
    });

    test('should start in disconnected state', () {
      expect(client.currentState, RealtimeConnectionState.disconnected);
    });

    test('should require connection before sending audio', () async {
      expect(
        () async => await client.sendAudio('base64data'),
        throwsException,
      );
    });

    test('should require connection before sending text', () async {
      expect(
        () async => await client.sendText('Hello'),
        throwsException,
      );
    });
  });
}
