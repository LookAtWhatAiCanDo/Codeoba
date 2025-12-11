/// Main application UI
/// Voice WebRTC AI Programmer interface

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'app_state.dart';
import 'widgets/connection_panel.dart';
import 'widgets/microphone_button.dart';
import 'widgets/log_viewer.dart';
import 'widgets/repository_selector.dart';
import 'widgets/status_indicator.dart';

class MainApp extends StatelessWidget {
  const MainApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => AppStateManager(),
      child: MaterialApp(
        title: 'Codeoba - Voice AI Programmer',
        theme: ThemeData(
          primarySwatch: Colors.blue,
          useMaterial3: true,
          brightness: Brightness.light,
        ),
        darkTheme: ThemeData(
          primarySwatch: Colors.blue,
          useMaterial3: true,
          brightness: Brightness.dark,
        ),
        themeMode: ThemeMode.system,
        home: const MainScreen(),
      ),
    );
  }
}

class MainScreen extends StatelessWidget {
  const MainScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Codeoba - Voice AI Programmer'),
        actions: const [
          StatusIndicator(),
          SizedBox(width: 16),
        ],
      ),
      body: Column(
        children: [
          // Connection and repository selection
          const ConnectionPanel(),
          const Divider(height: 1),
          
          // Repository selector
          const RepositorySelector(),
          const Divider(height: 1),
          
          // Main content area with logs
          Expanded(
            child: Row(
              children: [
                // Log viewer
                Expanded(
                  child: const LogViewer(),
                ),
                
                // Transcription/Response panel
                Expanded(
                  child: _buildTranscriptionPanel(context),
                ),
              ],
            ),
          ),
          
          // Bottom controls
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surfaceVariant,
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.1),
                  blurRadius: 4,
                  offset: const Offset(0, -2),
                ),
              ],
            ),
            child: const Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                MicrophoneButton(),
              ],
            ),
          ),
        ],
      ),
    );
  }
  
  Widget _buildTranscriptionPanel(BuildContext context) {
    return Consumer<AppStateManager>(
      builder: (context, appState, _) {
        return Container(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Voice & Response',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 16),
              
              // Current transcription
              if (appState.currentTranscription != null) ...[
                Text(
                  'You said:',
                  style: Theme.of(context).textTheme.labelLarge,
                ),
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.primaryContainer,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    appState.currentTranscription!,
                    style: Theme.of(context).textTheme.bodyLarge,
                  ),
                ),
                const SizedBox(height: 16),
              ],
              
              // AI response
              if (appState.lastResponse != null) ...[
                Text(
                  'AI Response:',
                  style: Theme.of(context).textTheme.labelLarge,
                ),
                const SizedBox(height: 8),
                Expanded(
                  child: SingleChildScrollView(
                    child: Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Theme.of(context).colorScheme.secondaryContainer,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        appState.lastResponse!,
                        style: Theme.of(context).textTheme.bodyLarge,
                      ),
                    ),
                  ),
                ),
              ] else ...[
                const Expanded(
                  child: Center(
                    child: Text(
                      'Start speaking to see transcription and responses',
                      textAlign: TextAlign.center,
                    ),
                  ),
                ),
              ],
            ],
          ),
        );
      },
    );
  }
}
