/// Response handler for Realtime API messages
/// Processes different types of responses from OpenAI

import 'package:logger/logger.dart';

class RealtimeResponseHandler {
  final Logger _logger = Logger();
  
  /// Callback for transcriptions
  Function(String transcription)? onTranscription;
  
  /// Callback for AI text responses
  Function(String text)? onTextResponse;
  
  /// Callback for audio responses
  Function(String base64Audio)? onAudioResponse;
  
  /// Callback for function calls
  Function(String functionName, Map<String, dynamic> arguments)? onFunctionCall;
  
  /// Callback for errors
  Function(String error)? onError;
  
  /// Process incoming message from Realtime API
  void handleMessage(Map<String, dynamic> message) {
    final type = message['type'] as String?;
    
    if (type == null) {
      _logger.w('Received message without type');
      return;
    }
    
    try {
      switch (type) {
        case 'session.created':
          _handleSessionCreated(message);
          break;
        case 'session.updated':
          _handleSessionUpdated(message);
          break;
        case 'conversation.item.created':
          _handleConversationItem(message);
          break;
        case 'input_audio_buffer.speech_started':
          _handleSpeechStarted(message);
          break;
        case 'input_audio_buffer.speech_stopped':
          _handleSpeechStopped(message);
          break;
        case 'input_audio_buffer.committed':
          _handleAudioCommitted(message);
          break;
        case 'conversation.item.input_audio_transcription.completed':
          _handleTranscription(message);
          break;
        case 'response.created':
          _handleResponseCreated(message);
          break;
        case 'response.output_item.added':
          _handleOutputItemAdded(message);
          break;
        case 'response.content_part.added':
          _handleContentPartAdded(message);
          break;
        case 'response.text.delta':
          _handleTextDelta(message);
          break;
        case 'response.text.done':
          _handleTextDone(message);
          break;
        case 'response.audio.delta':
          _handleAudioDelta(message);
          break;
        case 'response.audio.done':
          _handleAudioDone(message);
          break;
        case 'response.function_call_arguments.delta':
          _handleFunctionCallDelta(message);
          break;
        case 'response.function_call_arguments.done':
          _handleFunctionCallDone(message);
          break;
        case 'response.done':
          _handleResponseDone(message);
          break;
        case 'error':
          _handleError(message);
          break;
        default:
          _logger.d('Unhandled message type: $type');
      }
    } catch (e) {
      _logger.e('Error processing message type $type: $e');
    }
  }
  
  void _handleSessionCreated(Map<String, dynamic> message) {
    _logger.i('Session created: ${message['session']?['id']}');
  }
  
  void _handleSessionUpdated(Map<String, dynamic> message) {
    _logger.i('Session updated');
  }
  
  void _handleConversationItem(Map<String, dynamic> message) {
    _logger.d('Conversation item created');
  }
  
  void _handleSpeechStarted(Map<String, dynamic> message) {
    _logger.i('User started speaking');
  }
  
  void _handleSpeechStopped(Map<String, dynamic> message) {
    _logger.i('User stopped speaking');
  }
  
  void _handleAudioCommitted(Map<String, dynamic> message) {
    _logger.d('Audio buffer committed');
  }
  
  void _handleTranscription(Map<String, dynamic> message) {
    final transcription = message['transcript'] as String?;
    if (transcription != null) {
      _logger.i('Transcription: $transcription');
      onTranscription?.call(transcription);
    }
  }
  
  void _handleResponseCreated(Map<String, dynamic> message) {
    _logger.d('Response created');
  }
  
  void _handleOutputItemAdded(Map<String, dynamic> message) {
    _logger.d('Output item added');
  }
  
  void _handleContentPartAdded(Map<String, dynamic> message) {
    _logger.d('Content part added');
  }
  
  void _handleTextDelta(Map<String, dynamic> message) {
    final delta = message['delta'] as String?;
    if (delta != null) {
      onTextResponse?.call(delta);
    }
  }
  
  void _handleTextDone(Map<String, dynamic> message) {
    final text = message['text'] as String?;
    if (text != null) {
      _logger.i('Text response complete: $text');
    }
  }
  
  void _handleAudioDelta(Map<String, dynamic> message) {
    final delta = message['delta'] as String?;
    if (delta != null) {
      onAudioResponse?.call(delta);
    }
  }
  
  void _handleAudioDone(Map<String, dynamic> message) {
    _logger.d('Audio response complete');
  }
  
  void _handleFunctionCallDelta(Map<String, dynamic> message) {
    _logger.d('Function call arguments delta');
  }
  
  void _handleFunctionCallDone(Map<String, dynamic> message) {
    final functionName = message['name'] as String?;
    final argumentsJson = message['arguments'] as String?;
    
    if (functionName != null && argumentsJson != null) {
      try {
        final arguments = {}; // Parse JSON arguments
        _logger.i('Function call: $functionName with args: $arguments');
        onFunctionCall?.call(functionName, arguments);
      } catch (e) {
        _logger.e('Error parsing function arguments: $e');
      }
    }
  }
  
  void _handleResponseDone(Map<String, dynamic> message) {
    _logger.i('Response complete');
  }
  
  void _handleError(Map<String, dynamic> message) {
    final error = message['error'];
    final errorMessage = error?['message'] ?? 'Unknown error';
    _logger.e('Realtime API error: $errorMessage');
    onError?.call(errorMessage);
  }
}
