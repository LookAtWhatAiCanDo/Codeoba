/// Audio processor for WebRTC stream
/// Handles PCM audio conversion and buffering for Realtime API

import 'dart:typed_data';
import 'package:logger/logger.dart';

class AudioProcessor {
  final Logger _logger = Logger();
  final int sampleRate;
  final int channels;
  final List<int> _buffer = [];
  final int _chunkSize;
  
  AudioProcessor({
    this.sampleRate = 24000,
    this.channels = 1,
    int chunkSizeMs = 100,
  }) : _chunkSize = (sampleRate * channels * chunkSizeMs ~/ 1000);
  
  /// Process raw audio samples
  void processAudioSamples(List<int> samples) {
    _buffer.addAll(samples);
    
    // Emit chunks when buffer is full
    while (_buffer.length >= _chunkSize) {
      final chunk = _buffer.sublist(0, _chunkSize);
      _buffer.removeRange(0, _chunkSize);
      _emitChunk(chunk);
    }
  }
  
  /// Convert PCM to base64 for Realtime API
  String _pcmToBase64(List<int> pcmData) {
    final bytes = Int16List.fromList(pcmData);
    final buffer = bytes.buffer.asUint8List();
    return buffer.toString(); // In production, use proper base64 encoding
  }
  
  /// Emit audio chunk
  void _emitChunk(List<int> chunk) {
    _logger.d('Emitting audio chunk: ${chunk.length} samples');
    // Callback would be invoked here with encoded data
  }
  
  /// Clear buffer
  void clear() {
    _buffer.clear();
    _logger.i('Audio buffer cleared');
  }
  
  /// Get current buffer size
  int getBufferSize() {
    return _buffer.length;
  }
}
