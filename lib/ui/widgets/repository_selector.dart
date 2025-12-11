/// Repository selector widget
/// Allows selection of GitHub repository to work with

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:codeoba/ui/app_state.dart';

class RepositorySelector extends StatefulWidget {
  const RepositorySelector({super.key});

  @override
  State<RepositorySelector> createState() => _RepositorySelectorState();
}

class _RepositorySelectorState extends State<RepositorySelector> {
  final _ownerController = TextEditingController();
  final _nameController = TextEditingController();

  @override
  void dispose() {
    _ownerController.dispose();
    _nameController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<AppStateManager>(
      builder: (context, appState, _) {
        return Container(
          padding: const EdgeInsets.all(16),
          color: Theme.of(context).colorScheme.surface,
          child: Row(
            children: [
              const Icon(Icons.folder_outlined),
              const SizedBox(width: 12),
              Expanded(
                child: appState.selectedRepository != null
                    ? Row(
                        children: [
                          Text(
                            'Repository: ${appState.selectedRepository}',
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          const SizedBox(width: 8),
                          IconButton(
                            icon: const Icon(Icons.edit, size: 20),
                            onPressed: () => _showRepositoryDialog(context, appState),
                            tooltip: 'Change repository',
                          ),
                        ],
                      )
                    : TextButton.icon(
                        onPressed: appState.state == AppState.connected
                            ? () => _showRepositoryDialog(context, appState)
                            : null,
                        icon: const Icon(Icons.add),
                        label: const Text('Select Repository'),
                      ),
              ),
            ],
          ),
        );
      },
    );
  }

  void _showRepositoryDialog(BuildContext context, AppStateManager appState) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Select Repository'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: _ownerController,
              decoration: const InputDecoration(
                labelText: 'Owner/Organization',
                hintText: 'e.g., octocat',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _nameController,
              decoration: const InputDecoration(
                labelText: 'Repository Name',
                hintText: 'e.g., hello-world',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              if (_ownerController.text.isNotEmpty &&
                  _nameController.text.isNotEmpty) {
                appState.selectRepository(
                  _ownerController.text,
                  _nameController.text,
                );
                Navigator.of(context).pop();
              } else {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Please enter both owner and repository name'),
                    backgroundColor: Colors.red,
                  ),
                );
              }
            },
            child: const Text('Select'),
          ),
        ],
      ),
    );
  }
}
