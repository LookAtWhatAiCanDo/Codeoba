/// MCP tool executor
/// Bridges Realtime API function calls with MCP tool execution

import 'package:logger/logger.dart';
import 'mcp_client.dart';

class MCPToolExecutor {
  final Logger _logger = Logger();
  final MCPClient mcpClient;
  
  MCPToolExecutor({required this.mcpClient});
  
  /// Execute a code action through MCP
  Future<Map<String, dynamic>> executeCodeAction({
    required String action,
    String? filePath,
    String? code,
    Map<String, dynamic>? metadata,
  }) async {
    try {
      _logger.i('Executing code action: $action');
      
      switch (action.toLowerCase()) {
        case 'create':
          return await _createFile(filePath!, code!);
        case 'edit':
          return await _editFile(filePath!, code!);
        case 'delete':
          return await _deleteFile(filePath!);
        case 'read':
          return await _readFile(filePath!);
        case 'list':
          return await _listFiles(filePath ?? '.');
        default:
          throw Exception('Unknown action: $action');
      }
    } catch (e) {
      _logger.e('Error executing code action: $e');
      return {
        'success': false,
        'error': e.toString(),
      };
    }
  }
  
  /// Create a new file
  Future<Map<String, dynamic>> _createFile(String path, String content) async {
    _logger.i('Creating file: $path');
    
    final result = await mcpClient.callTool('create_file', {
      'path': path,
      'content': content,
    });
    
    return {
      'success': true,
      'action': 'create',
      'path': path,
      'result': result,
    };
  }
  
  /// Edit an existing file
  Future<Map<String, dynamic>> _editFile(String path, String changes) async {
    _logger.i('Editing file: $path');
    
    final result = await mcpClient.callTool('edit_file', {
      'path': path,
      'changes': changes,
    });
    
    return {
      'success': true,
      'action': 'edit',
      'path': path,
      'result': result,
    };
  }
  
  /// Delete a file
  Future<Map<String, dynamic>> _deleteFile(String path) async {
    _logger.i('Deleting file: $path');
    
    final result = await mcpClient.callTool('delete_file', {
      'path': path,
    });
    
    return {
      'success': true,
      'action': 'delete',
      'path': path,
      'result': result,
    };
  }
  
  /// Read a file
  Future<Map<String, dynamic>> _readFile(String path) async {
    _logger.i('Reading file: $path');
    
    final result = await mcpClient.callTool('read_file', {
      'path': path,
    });
    
    return {
      'success': true,
      'action': 'read',
      'path': path,
      'result': result,
    };
  }
  
  /// List files in a directory
  Future<Map<String, dynamic>> _listFiles(String path) async {
    _logger.i('Listing files in: $path');
    
    final result = await mcpClient.callTool('list_files', {
      'path': path,
    });
    
    return {
      'success': true,
      'action': 'list',
      'path': path,
      'result': result,
    };
  }
}
