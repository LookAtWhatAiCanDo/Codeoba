/// Status indicator widget
/// Shows connection status in the app bar

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:codeoba/ui/app_state.dart';

class StatusIndicator extends StatelessWidget {
  const StatusIndicator({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<AppStateManager>(
      builder: (context, appState, _) {
        final status = _getStatusInfo(appState.state);
        
        return Tooltip(
          message: status.message,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: status.color.withOpacity(0.2),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: status.color, width: 1),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: status.color,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  status.label,
                  style: TextStyle(
                    color: status.color,
                    fontWeight: FontWeight.bold,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  _StatusInfo _getStatusInfo(AppState state) {
    switch (state) {
      case AppState.disconnected:
        return _StatusInfo(
          label: 'Offline',
          message: 'Not connected to services',
          color: Colors.grey,
        );
      case AppState.connecting:
        return _StatusInfo(
          label: 'Connecting',
          message: 'Connecting to services...',
          color: Colors.orange,
        );
      case AppState.connected:
        return _StatusInfo(
          label: 'Online',
          message: 'Connected and ready',
          color: Colors.green,
        );
      case AppState.error:
        return _StatusInfo(
          label: 'Error',
          message: 'Connection error',
          color: Colors.red,
        );
    }
  }
}

class _StatusInfo {
  final String label;
  final String message;
  final Color color;

  _StatusInfo({
    required this.label,
    required this.message,
    required this.color,
  });
}
