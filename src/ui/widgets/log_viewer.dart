/// Log viewer widget
/// Displays real-time application logs

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../app_state.dart';

class LogViewer extends StatefulWidget {
  const LogViewer({super.key});

  @override
  State<LogViewer> createState() => _LogViewerState();
}

class _LogViewerState extends State<LogViewer> {
  final ScrollController _scrollController = ScrollController();

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    if (_scrollController.hasClients) {
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOut,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<AppStateManager>(
      builder: (context, appState, _) {
        // Auto-scroll when new logs arrive
        WidgetsBinding.instance.addPostFrameCallback((_) {
          _scrollToBottom();
        });

        return Container(
          decoration: BoxDecoration(
            border: Border.all(
              color: Theme.of(context).dividerColor,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                color: Theme.of(context).colorScheme.surfaceVariant,
                child: Row(
                  children: [
                    const Icon(Icons.article, size: 20),
                    const SizedBox(width: 8),
                    Text(
                      'Activity Log',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const Spacer(),
                    Text(
                      '${appState.logs.length} entries',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
              Expanded(
                child: appState.logs.isEmpty
                    ? const Center(
                        child: Text('No logs yet'),
                      )
                    : ListView.builder(
                        controller: _scrollController,
                        padding: const EdgeInsets.all(8),
                        itemCount: appState.logs.length,
                        itemBuilder: (context, index) {
                          return _buildLogEntry(
                            context,
                            appState.logs[index],
                          );
                        },
                      ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildLogEntry(BuildContext context, String log) {
    // Parse timestamp and message
    final parts = log.split('] ');
    if (parts.length < 2) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Text(
          log,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                fontFamily: 'monospace',
              ),
        ),
      );
    }

    final timestamp = parts[0].substring(1); // Remove leading '['
    final message = parts.sublist(1).join('] ');

    // Color code based on message content
    Color? textColor;
    IconData? icon;

    if (message.toLowerCase().contains('error')) {
      textColor = Colors.red;
      icon = Icons.error;
    } else if (message.toLowerCase().contains('warning')) {
      textColor = Colors.orange;
      icon = Icons.warning;
    } else if (message.toLowerCase().contains('connected') ||
        message.toLowerCase().contains('success')) {
      textColor = Colors.green;
      icon = Icons.check_circle;
    } else if (message.toLowerCase().contains('transcription')) {
      textColor = Colors.blue;
      icon = Icons.mic;
    }

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 16, color: textColor),
            const SizedBox(width: 4),
          ],
          Expanded(
            child: RichText(
              text: TextSpan(
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      fontFamily: 'monospace',
                    ),
                children: [
                  TextSpan(
                    text: '$timestamp ',
                    style: TextStyle(
                      color: Colors.grey[600],
                    ),
                  ),
                  TextSpan(
                    text: message,
                    style: TextStyle(color: textColor),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
