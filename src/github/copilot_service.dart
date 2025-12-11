/// GitHub Copilot integration service
/// Handles GitHub API interactions and repository management

import 'package:github/github.dart';
import 'package:logger/logger.dart';

class GitHubCopilotService {
  final Logger _logger = Logger();
  late GitHub _github;
  Repository? _currentRepository;
  
  /// Initialize GitHub client
  void initialize(String token) {
    _logger.i('Initializing GitHub client...');
    _github = GitHub(auth: Authentication.withToken(token));
  }
  
  /// List user repositories
  Future<List<Repository>> listRepositories() async {
    try {
      _logger.i('Fetching user repositories...');
      
      final repos = await _github.repositories.listUserRepositories().toList();
      _logger.i('Found ${repos.length} repositories');
      
      return repos;
    } catch (e) {
      _logger.e('Error listing repositories: $e');
      return [];
    }
  }
  
  /// Select a repository to work with
  Future<bool> selectRepository(String owner, String name) async {
    try {
      _logger.i('Selecting repository: $owner/$name');
      
      final slug = RepositorySlug(owner, name);
      _currentRepository = await _github.repositories.getRepository(slug);
      
      _logger.i('Repository selected: ${_currentRepository!.fullName}');
      return true;
    } catch (e) {
      _logger.e('Error selecting repository: $e');
      return false;
    }
  }
  
  /// Get current repository
  Repository? getCurrentRepository() {
    return _currentRepository;
  }
  
  /// Get file contents from repository
  Future<String?> getFileContents(String path, {String? ref}) async {
    if (_currentRepository == null) {
      throw Exception('No repository selected');
    }
    
    try {
      _logger.i('Fetching file: $path');
      
      final slug = _currentRepository!.slug();
      final contents = await _github.repositories.getContents(
        slug,
        path,
        ref: ref,
      );
      
      if (contents.file != null) {
        return contents.file!.text;
      }
      
      return null;
    } catch (e) {
      _logger.e('Error getting file contents: $e');
      return null;
    }
  }
  
  /// Create or update a file in the repository
  Future<bool> updateFile({
    required String path,
    required String content,
    required String message,
    String? branch,
    String? sha,
  }) async {
    if (_currentRepository == null) {
      throw Exception('No repository selected');
    }
    
    try {
      _logger.i('Updating file: $path');
      
      final slug = _currentRepository!.slug();
      
      await _github.repositories.updateFile(
        slug,
        path,
        message,
        content,
        sha: sha,
        branch: branch,
      );
      
      _logger.i('File updated successfully');
      return true;
    } catch (e) {
      _logger.e('Error updating file: $e');
      return false;
    }
  }
  
  /// Create a new file in the repository
  Future<bool> createFile({
    required String path,
    required String content,
    required String message,
    String? branch,
  }) async {
    if (_currentRepository == null) {
      throw Exception('No repository selected');
    }
    
    try {
      _logger.i('Creating file: $path');
      
      final slug = _currentRepository!.slug();
      
      await _github.repositories.createFile(
        slug,
        CreateFile(
          path: path,
          message: message,
          content: content,
          branch: branch,
        ),
      );
      
      _logger.i('File created successfully');
      return true;
    } catch (e) {
      _logger.e('Error creating file: $e');
      return false;
    }
  }
  
  /// Delete a file from the repository
  Future<bool> deleteFile({
    required String path,
    required String message,
    required String sha,
    String? branch,
  }) async {
    if (_currentRepository == null) {
      throw Exception('No repository selected');
    }
    
    try {
      _logger.i('Deleting file: $path');
      
      final slug = _currentRepository!.slug();
      
      await _github.repositories.deleteFile(
        slug,
        path,
        message,
        sha,
        branch: branch,
      );
      
      _logger.i('File deleted successfully');
      return true;
    } catch (e) {
      _logger.e('Error deleting file: $e');
      return false;
    }
  }
  
  /// List files in a directory
  Future<List<RepositoryContents>> listFiles(String path) async {
    if (_currentRepository == null) {
      throw Exception('No repository selected');
    }
    
    try {
      _logger.i('Listing files in: $path');
      
      final slug = _currentRepository!.slug();
      final contents = await _github.repositories.getContents(slug, path);
      
      return contents.tree ?? [];
    } catch (e) {
      _logger.e('Error listing files: $e');
      return [];
    }
  }
  
  /// Get repository branches
  Future<List<Branch>> getBranches() async {
    if (_currentRepository == null) {
      throw Exception('No repository selected');
    }
    
    try {
      _logger.i('Fetching branches...');
      
      final slug = _currentRepository!.slug();
      final branches = await _github.repositories.listBranches(slug).toList();
      
      _logger.i('Found ${branches.length} branches');
      return branches;
    } catch (e) {
      _logger.e('Error fetching branches: $e');
      return [];
    }
  }
  
  /// Dispose resources
  void dispose() {
    _github.dispose();
  }
}
