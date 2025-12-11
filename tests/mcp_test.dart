/// Tests for MCP client

import 'package:flutter_test/flutter_test.dart';
import 'package:codeoba/mcp/mcp_client.dart';

void main() {
  group('MCPClient', () {
    late MCPClient client;

    setUp(() {
      client = MCPClient(
        serverUrl: 'http://localhost:3000',
      );
    });

    tearDown(() {
      client.dispose();
    });

    test('should initialize successfully', () async {
      final result = await client.initialize();
      // With mock implementation, this should succeed
      expect(result, true);
    });

    test('should list tools', () async {
      await client.initialize();
      final tools = await client.listTools();
      expect(tools, isNotEmpty);
    });

    test('should call tools with arguments', () async {
      await client.initialize();
      final result = await client.callTool('create_file', {
        'path': 'test.txt',
        'content': 'Hello World',
      });
      expect(result, isNotNull);
    });
  });
}
