/// Main application state manager
/// Coordinates WebRTC, Realtime API, MCP, and GitHub services

import 'package:flutter/foundation.dart';
import 'package:logger/logger.dart';
import 'package:codeoba/webrtc/webrtc_service.dart';
import 'package:codeoba/realtime/realtime_api_client.dart';
import 'package:codeoba/realtime/response_handler.dart';
import 'package:codeoba/mcp/mcp_client.dart';
import 'package:codeoba/mcp/tool_executor.dart';
import 'package:codeoba/github/copilot_service.dart';
import 'package:codeoba/github/code_generator.dart';

enum AppState {
  disconnected,
  connecting,
  connected,
  error,
}

class AppStateManager extends ChangeNotifier {
  final Logger _logger = Logger();
  
  // Services
  late WebRTCService _webrtcService;
  late RealtimeAPIClient _realtimeClient;
  late RealtimeResponseHandler _responseHandler;
  late MCPClient _mcpClient;
  late MCPToolExecutor _toolExecutor;
  late GitHubCopilotService _githubService;
  late CodeGenerator _codeGenerator;
  
  // State
  AppState _state = AppState.disconnected;
  bool _isMicrophoneActive = false;
  final List<String> _logs = [];
  String? _selectedRepository;
  String? _currentTranscription;
  String? _lastResponse;
  
  // Getters
  AppState get state => _state;
  bool get isMicrophoneActive => _isMicrophoneActive;
  List<String> get logs => List.unmodifiable(_logs);
  String? get selectedRepository => _selectedRepository;
  String? get currentTranscription => _currentTranscription;
  String? get lastResponse => _lastResponse;
  
  AppStateManager() {
    _initializeServices();
  }
  
  void _initializeServices() {
    _webrtcService = WebRTCService();
    _realtimeClient = RealtimeAPIClient(
      apiKey: '', // Should be loaded from config
    );
    _responseHandler = RealtimeResponseHandler();
    _mcpClient = MCPClient(
      serverUrl: 'http://localhost:3000', // Should be configurable
    );
    _toolExecutor = MCPToolExecutor(mcpClient: _mcpClient);
    _githubService = GitHubCopilotService();
    _codeGenerator = CodeGenerator(githubService: _githubService);
    
    _setupCallbacks();
  }
  
  void _setupCallbacks() {
    // Response handler callbacks
    _responseHandler.onTranscription = (text) {
      _currentTranscription = text;
      _addLog('Transcription: $text');
      notifyListeners();
    };
    
    _responseHandler.onTextResponse = (text) {
      _lastResponse = (_lastResponse ?? '') + text;
      notifyListeners();
    };
    
    _responseHandler.onFunctionCall = (name, args) async {
      _addLog('Function call: $name');
      await _handleFunctionCall(name, args);
    };
    
    _responseHandler.onError = (error) {
      _addLog('Error: $error');
      _state = AppState.error;
      notifyListeners();
    };
    
    // Realtime API message stream
    _realtimeClient.messages.listen((message) {
      _responseHandler.handleMessage(message);
    });
    
    // Connection state changes
    _realtimeClient.connectionState.listen((state) {
      switch (state) {
        case RealtimeConnectionState.connected:
          _state = AppState.connected;
          _addLog('Connected to Realtime API');
          break;
        case RealtimeConnectionState.connecting:
          _state = AppState.connecting;
          _addLog('Connecting...');
          break;
        case RealtimeConnectionState.disconnected:
          _state = AppState.disconnected;
          _addLog('Disconnected');
          break;
        case RealtimeConnectionState.error:
          _state = AppState.error;
          _addLog('Connection error');
          break;
      }
      notifyListeners();
    });
  }
  
  /// Connect to all services
  Future<void> connect({
    required String openaiApiKey,
    required String githubToken,
  }) async {
    try {
      _addLog('Initializing services...');
      _state = AppState.connecting;
      notifyListeners();
      
      // Initialize WebRTC
      final webrtcOk = await _webrtcService.initialize();
      if (!webrtcOk) {
        throw Exception('Failed to initialize WebRTC');
      }
      _addLog('WebRTC initialized');
      
      // Initialize MCP
      final mcpOk = await _mcpClient.initialize();
      if (!mcpOk) {
        throw Exception('Failed to initialize MCP');
      }
      _addLog('MCP initialized');
      
      // Initialize GitHub
      _githubService.initialize(githubToken);
      _addLog('GitHub initialized');
      
      // Connect to Realtime API
      await _realtimeClient.connect();
      _addLog('All services connected');
      
    } catch (e) {
      _logger.e('Connection error: $e');
      _state = AppState.error;
      _addLog('Connection failed: $e');
      notifyListeners();
    }
  }
  
  /// Disconnect from all services
  Future<void> disconnect() async {
    try {
      await _webrtcService.dispose();
      await _realtimeClient.disconnect();
      _githubService.dispose();
      _mcpClient.dispose();
      
      _state = AppState.disconnected;
      _addLog('Disconnected from all services');
      notifyListeners();
    } catch (e) {
      _logger.e('Disconnection error: $e');
    }
  }
  
  /// Toggle microphone on/off
  Future<void> toggleMicrophone() async {
    if (_state != AppState.connected) {
      _addLog('Cannot toggle microphone: not connected');
      return;
    }
    
    try {
      if (_isMicrophoneActive) {
        await _webrtcService.stopStreaming();
        _isMicrophoneActive = false;
        _addLog('Microphone stopped');
      } else {
        await _webrtcService.startStreaming();
        _isMicrophoneActive = true;
        _addLog('Microphone started');
      }
      notifyListeners();
    } catch (e) {
      _logger.e('Error toggling microphone: $e');
      _addLog('Microphone error: $e');
    }
  }
  
  /// Select a repository
  Future<void> selectRepository(String owner, String name) async {
    try {
      final success = await _githubService.selectRepository(owner, name);
      if (success) {
        _selectedRepository = '$owner/$name';
        _addLog('Selected repository: $_selectedRepository');
        notifyListeners();
      }
    } catch (e) {
      _logger.e('Error selecting repository: $e');
      _addLog('Repository selection error: $e');
    }
  }
  
  /// Handle function calls from Realtime API
  Future<void> _handleFunctionCall(
    String functionName,
    Map<String, dynamic> arguments,
  ) async {
    try {
      if (functionName == 'execute_code_action') {
        final result = await _toolExecutor.executeCodeAction(
          action: arguments['action'] ?? '',
          filePath: arguments['file_path'],
          code: arguments['code'],
        );
        
        _addLog('Code action result: ${result['success']}');
      }
    } catch (e) {
      _logger.e('Error handling function call: $e');
      _addLog('Function call error: $e');
    }
  }
  
  /// Add a log message
  void _addLog(String message) {
    final timestamp = DateTime.now().toIso8601String();
    _logs.add('[$timestamp] $message');
    
    // Keep only last 100 logs
    if (_logs.length > 100) {
      _logs.removeAt(0);
    }
    
    _logger.i(message);
  }
  
  @override
  void dispose() {
    disconnect();
    super.dispose();
  }
}
