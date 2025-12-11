/// Connection panel widget
/// Handles OpenAI API key and GitHub token input

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../app_state.dart';

class ConnectionPanel extends StatefulWidget {
  const ConnectionPanel({super.key});

  @override
  State<ConnectionPanel> createState() => _ConnectionPanelState();
}

class _ConnectionPanelState extends State<ConnectionPanel> {
  final _openaiKeyController = TextEditingController();
  final _githubTokenController = TextEditingController();
  bool _isExpanded = false;

  @override
  void dispose() {
    _openaiKeyController.dispose();
    _githubTokenController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<AppStateManager>(
      builder: (context, appState, _) {
        return Card(
          margin: const EdgeInsets.all(8),
          child: ExpansionPanelList(
            expansionCallback: (_, __) {
              setState(() {
                _isExpanded = !_isExpanded;
              });
            },
            children: [
              ExpansionPanel(
                headerBuilder: (context, isExpanded) {
                  return ListTile(
                    leading: Icon(
                      appState.state == AppState.connected
                          ? Icons.check_circle
                          : Icons.settings,
                      color: appState.state == AppState.connected
                          ? Colors.green
                          : null,
                    ),
                    title: const Text('Connection Settings'),
                    subtitle: Text(_getStateText(appState.state)),
                  );
                },
                body: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      TextField(
                        controller: _openaiKeyController,
                        decoration: const InputDecoration(
                          labelText: 'OpenAI API Key',
                          hintText: 'sk-...',
                          border: OutlineInputBorder(),
                        ),
                        obscureText: true,
                        enabled: appState.state == AppState.disconnected,
                      ),
                      const SizedBox(height: 16),
                      TextField(
                        controller: _githubTokenController,
                        decoration: const InputDecoration(
                          labelText: 'GitHub Personal Access Token',
                          hintText: 'ghp_...',
                          border: OutlineInputBorder(),
                        ),
                        obscureText: true,
                        enabled: appState.state == AppState.disconnected,
                      ),
                      const SizedBox(height: 16),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          if (appState.state == AppState.connected)
                            ElevatedButton.icon(
                              onPressed: () => appState.disconnect(),
                              icon: const Icon(Icons.power_off),
                              label: const Text('Disconnect'),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: Colors.red,
                                foregroundColor: Colors.white,
                              ),
                            )
                          else
                            ElevatedButton.icon(
                              onPressed: appState.state == AppState.connecting
                                  ? null
                                  : () => _handleConnect(appState),
                              icon: appState.state == AppState.connecting
                                  ? const SizedBox(
                                      width: 16,
                                      height: 16,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                      ),
                                    )
                                  : const Icon(Icons.power),
                              label: Text(
                                appState.state == AppState.connecting
                                    ? 'Connecting...'
                                    : 'Connect',
                              ),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
                isExpanded: _isExpanded,
              ),
            ],
          ),
        );
      },
    );
  }

  String _getStateText(AppState state) {
    switch (state) {
      case AppState.disconnected:
        return 'Disconnected - Enter credentials to connect';
      case AppState.connecting:
        return 'Connecting...';
      case AppState.connected:
        return 'Connected and ready';
      case AppState.error:
        return 'Connection error - Check credentials';
    }
  }

  void _handleConnect(AppStateManager appState) {
    if (_openaiKeyController.text.isEmpty ||
        _githubTokenController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please enter both API keys'),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    appState.connect(
      openaiApiKey: _openaiKeyController.text,
      githubToken: _githubTokenController.text,
    );
  }
}
