/// Microphone toggle button
/// Large circular button to start/stop voice input

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../app_state.dart';

class MicrophoneButton extends StatefulWidget {
  const MicrophoneButton({super.key});

  @override
  State<MicrophoneButton> createState() => _MicrophoneButtonState();
}

class _MicrophoneButtonState extends State<MicrophoneButton>
    with SingleTickerProviderStateMixin {
  late AnimationController _animationController;
  late Animation<double> _pulseAnimation;

  @override
  void initState() {
    super.initState();
    _animationController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    )..repeat(reverse: true);

    _pulseAnimation = Tween<double>(begin: 1.0, end: 1.1).animate(
      CurvedAnimation(
        parent: _animationController,
        curve: Curves.easeInOut,
      ),
    );
  }

  @override
  void dispose() {
    _animationController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<AppStateManager>(
      builder: (context, appState, _) {
        final isConnected = appState.state == AppState.connected;
        final isMicActive = appState.isMicrophoneActive;

        return AnimatedBuilder(
          animation: _pulseAnimation,
          builder: (context, child) {
            return Transform.scale(
              scale: isMicActive ? _pulseAnimation.value : 1.0,
              child: FloatingActionButton.large(
                onPressed: isConnected
                    ? () => appState.toggleMicrophone()
                    : null,
                backgroundColor: isMicActive
                    ? Colors.red
                    : (isConnected ? Colors.blue : Colors.grey),
                child: Icon(
                  isMicActive ? Icons.mic : Icons.mic_none,
                  size: 48,
                  color: Colors.white,
                ),
              ),
            );
          },
        );
      },
    );
  }
}
