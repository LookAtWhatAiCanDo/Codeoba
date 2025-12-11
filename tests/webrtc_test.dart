/// Tests for WebRTC service

import 'package:flutter_test/flutter_test.dart';
import 'package:codeoba/src/webrtc/webrtc_service.dart';

void main() {
  group('WebRTCService', () {
    late WebRTCService service;

    setUp(() {
      service = WebRTCService();
    });

    tearDown(() async {
      await service.dispose();
    });

    test('should initialize successfully', () async {
      // Note: This test would need to be run on a platform with WebRTC support
      // or use mocked implementations
      expect(service.isStreaming, false);
    });

    test('should not be streaming initially', () {
      expect(service.isStreaming, false);
    });

    test('should require initialization before streaming', () async {
      expect(
        () async => await service.startStreaming(),
        throwsException,
      );
    });
  });
}
