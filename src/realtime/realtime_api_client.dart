/// OpenAI Realtime API client
/// Handles WebSocket connection and communication with OpenAI's Realtime API

import 'dart:async';
import 'dart:convert';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:logger/logger.dart';

enum RealtimeConnectionState {
  disconnected,
  connecting,
  connected,
  error,
}

class RealtimeAPIClient {
  final Logger _logger = Logger();
  final String apiKey;
  final String model;
  
  WebSocketChannel? _channel;
  RealtimeConnectionState _state = RealtimeConnectionState.disconnected;
  
  final StreamController<Map<String, dynamic>> _messageController =
      StreamController.broadcast();
  final StreamController<RealtimeConnectionState> _stateController =
      StreamController.broadcast();
  
  Stream<Map<String, dynamic>> get messages => _messageController.stream;
  Stream<RealtimeConnectionState> get connectionState => _stateController.stream;
  RealtimeConnectionState get currentState => _state;
  
  RealtimeAPIClient({
    required this.apiKey,
    this.model = 'gpt-4o-realtime-preview-2024-10-01',
  });
  
  /// Connect to OpenAI Realtime API
  Future<void> connect() async {
    if (_state == RealtimeConnectionState.connected) {
      _logger.w('Already connected to Realtime API');
      return;
    }
    
    try {
      _updateState(RealtimeConnectionState.connecting);
      _logger.i('Connecting to OpenAI Realtime API...');
      
      final uri = Uri.parse(
        'wss://api.openai.com/v1/realtime?model=$model',
      );
      
      _channel = WebSocketChannel.connect(
        uri,
        protocols: ['realtime'],
      );
      
      // Add authorization header (note: WebSocket headers need special handling)
      // In production, this would be done via HTTP headers during upgrade
      
      _channel!.stream.listen(
        _handleMessage,
        onError: _handleError,
        onDone: _handleDisconnect,
      );
      
      _updateState(RealtimeConnectionState.connected);
      _logger.i('Connected to Realtime API');
      
      // Send session configuration
      await _configureSession();
      
    } catch (e) {
      _logger.e('Failed to connect to Realtime API: $e');
      _updateState(RealtimeConnectionState.error);
      rethrow;
    }
  }
  
  /// Disconnect from Realtime API
  Future<void> disconnect() async {
    if (_state == RealtimeConnectionState.disconnected) {
      return;
    }
    
    try {
      _logger.i('Disconnecting from Realtime API...');
      await _channel?.sink.close();
      _channel = null;
      _updateState(RealtimeConnectionState.disconnected);
      _logger.i('Disconnected from Realtime API');
    } catch (e) {
      _logger.e('Error disconnecting: $e');
    }
  }
  
  /// Send audio data to Realtime API
  Future<void> sendAudio(String base64Audio) async {
    if (_state != RealtimeConnectionState.connected) {
      throw Exception('Not connected to Realtime API');
    }
    
    final message = {
      'type': 'input_audio_buffer.append',
      'audio': base64Audio,
    };
    
    _send(message);
  }
  
  /// Commit audio buffer and request response
  Future<void> commitAudio() async {
    if (_state != RealtimeConnectionState.connected) {
      throw Exception('Not connected to Realtime API');
    }
    
    final message = {
      'type': 'input_audio_buffer.commit',
    };
    
    _send(message);
    
    // Request response generation
    final responseMessage = {
      'type': 'response.create',
    };
    
    _send(responseMessage);
  }
  
  /// Send a text message
  Future<void> sendText(String text) async {
    if (_state != RealtimeConnectionState.connected) {
      throw Exception('Not connected to Realtime API');
    }
    
    final message = {
      'type': 'conversation.item.create',
      'item': {
        'type': 'message',
        'role': 'user',
        'content': [
          {
            'type': 'input_text',
            'text': text,
          }
        ],
      },
    };
    
    _send(message);
  }
  
  /// Configure session with tools and instructions
  Future<void> _configureSession() async {
    final config = {
      'type': 'session.update',
      'session': {
        'modalities': ['text', 'audio'],
        'instructions': 'You are a helpful AI programming assistant. '
            'You help users write code by understanding their voice commands '
            'and generating appropriate code through the MCP protocol.',
        'voice': 'alloy',
        'input_audio_format': 'pcm16',
        'output_audio_format': 'pcm16',
        'input_audio_transcription': {
          'model': 'whisper-1',
        },
        'turn_detection': {
          'type': 'server_vad',
          'threshold': 0.5,
          'prefix_padding_ms': 300,
          'silence_duration_ms': 500,
        },
        'tools': _getToolDefinitions(),
      },
    };
    
    _send(config);
  }
  
  /// Get MCP tool definitions
  List<Map<String, dynamic>> _getToolDefinitions() {
    return [
      {
        'type': 'function',
        'name': 'execute_code_action',
        'description': 'Execute a code-related action through MCP protocol',
        'parameters': {
          'type': 'object',
          'properties': {
            'action': {
              'type': 'string',
              'description': 'The action to perform (create, edit, delete, etc.)',
            },
            'file_path': {
              'type': 'string',
              'description': 'Path to the file to modify',
            },
            'code': {
              'type': 'string',
              'description': 'The code to insert or modify',
            },
          },
          'required': ['action'],
        },
      },
    ];
  }
  
  /// Send message to WebSocket
  void _send(Map<String, dynamic> message) {
    try {
      final json = jsonEncode(message);
      _channel?.sink.add(json);
      _logger.d('Sent message: ${message['type']}');
    } catch (e) {
      _logger.e('Error sending message: $e');
    }
  }
  
  /// Handle incoming messages
  void _handleMessage(dynamic data) {
    try {
      final message = jsonDecode(data as String) as Map<String, dynamic>;
      _logger.d('Received message: ${message['type']}');
      _messageController.add(message);
    } catch (e) {
      _logger.e('Error handling message: $e');
    }
  }
  
  /// Handle WebSocket errors
  void _handleError(error) {
    _logger.e('WebSocket error: $error');
    _updateState(RealtimeConnectionState.error);
  }
  
  /// Handle WebSocket disconnection
  void _handleDisconnect() {
    _logger.w('WebSocket disconnected');
    _updateState(RealtimeConnectionState.disconnected);
  }
  
  /// Update connection state
  void _updateState(RealtimeConnectionState newState) {
    _state = newState;
    _stateController.add(newState);
  }
  
  /// Dispose resources
  void dispose() {
    disconnect();
    _messageController.close();
    _stateController.close();
  }
}
