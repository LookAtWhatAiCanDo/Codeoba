# WebRTC Implementation Plan for OpenAI Realtime API

## Overview

This document outlines the complete WebRTC implementation plan for the OpenAI Realtime API client. The implementation uses the expect/actual pattern for platform-specific WebRTC integration.

## Architecture

### Connection Flow

1. **Get Ephemeral Token**: Call OpenAI API to get a session-specific client secret
2. **Initialize WebRTC**: Set up platform-specific PeerConnectionFactory
3. **Create Peer Connection**: Establish RTCPeerConnection with STUN servers
4. **Create Data Channel**: Set up reliable data channel named "oai-events" for signaling
5. **Add Audio Track**: Configure bidirectional audio streaming
6. **SDP Exchange**: Create offer, set local description, exchange with OpenAI, set remote description
7. **ICE Handling**: Process ICE candidates for NAT traversal
8. **Event Handling**: Parse events from data channel and emit to application

## Platform-Specific Implementation

### Android (IMPLEMENTED)

**Library**: `org.webrtc:google-webrtc` (Note: Correct artifact name needs verification)

**Key Classes**:
- `PeerConnectionFactory` - Factory for creating peer connections
- `PeerConnection` - Main WebRTC connection object
- `DataChannel` - Bidirectional messaging channel
- `AudioTrack` - Audio streaming track
- `SessionDescription` - SDP offer/answer handling

**Implementation Status**: 
- ✅ Complete WebRTC connection flow implemented
- ✅ Ephemeral token retrieval
- ✅ SDP exchange
- ✅ Data channel messaging
- ✅ Event parsing (transcripts, tool calls)
- ⚠️ Dependency resolution issue - need correct WebRTC artifact

**Next Steps**:
1. Find correct WebRTC library artifact (alternatives: `io.getstream:stream-webrtc-android`, custom build)
2. Add Context injection mechanism (currently using lateinit)
3. Test with actual OpenAI API
4. Verify audio track configuration for PCM16 format

### Desktop (PARTIAL)

**Challenge**: No mature JVM WebRTC library exists

**Options**:
1. **webrtc-java** - JNI wrapper around native libwebrtc (unmaintained)
2. **Jitsi** - Uses native WebRTC but heavyweight
3. **Custom JNI** - Build custom wrapper around libwebrtc
4. **Electron/Node.js** - Use Node.js WebRTC libraries via process communication

**Current Implementation**:
- Skeleton code with TODO comments
- Ephemeral token retrieval implemented  
- Event parsing logic implemented
- Missing: Actual WebRTC peer connection

**Recommended Approach**:
For Desktop, consider using a WebSocket-based fallback since WebRTC on JVM is extremely challenging. OpenAI's Realtime API supports both WebRTC and WebSocket protocols.

## API Endpoints

### Ephemeral Token
```
POST https://api.openai.com/v1/realtime/sessions
Authorization: Bearer {API_KEY}
Content-Type: application/json

{
  "model": "gpt-4o-realtime-preview-2024-10-01",
  "voice": "alloy"
}

Response:
{
  "id": "sess_xxx",
  "object": "realtime.session",
  "model": "gpt-4o-realtime-preview-2024-10-01",
  "expires_at": 1234567890,
  "client_secret": {
    "value": "eph_xxx",
    "expires_at": 1234567890
  }
}
```

### SDP Exchange
```
POST https://api.openai.com/v1/realtime
Authorization: Bearer {EPHEMERAL_TOKEN}
Content-Type: application/json

{
  "type": "offer",
  "sdp": "{SDP_OFFER_STRING}"
}

Response:
{
  "type": "answer",
  "sdp": "{SDP_ANSWER_STRING}"
}
```

## Data Channel Events

### Events Sent (Client → OpenAI)

**session.update**:
```json
{
  "type": "session.update",
  "session": {
    "modalities": ["text", "audio"],
    "instructions": "You are a helpful AI assistant",
    "voice": "alloy",
    "input_audio_format": "pcm16",
    "output_audio_format": "pcm16",
    "turn_detection": {
      "type": "server_vad"
    }
  }
}
```

**input_audio_buffer.append** (if sending manual chunks):
```json
{
  "type": "input_audio_buffer.append",
  "audio": "{BASE64_PCM16_DATA}"
}
```

### Events Received (OpenAI → Client)

**session.created**:
```json
{
  "type": "session.created",
  "session": { ... }
}
```

**conversation.item.input_audio_transcription.completed**:
```json
{
  "type": "conversation.item.input_audio_transcription.completed",
  "transcript": "Hello, how can I help?"
}
```

**response.audio_transcript.delta**:
```json
{
  "type": "response.audio_transcript.delta",
  "delta": "I can"
}
```

**response.audio_transcript.done**:
```json
{
  "type": "response.audio_transcript.done",
  "transcript": "I can help you with that."
}
```

**response.function_call_arguments.done**:
```json
{
  "type": "response.function_call_arguments.done",
  "name": "create_file",
  "arguments": "{\"path\": \"test.txt\", \"content\": \"Hello\"}"
}
```

## Audio Streaming

### Format
- Sample Rate: 16,000 Hz
- Channels: Mono
- Encoding: PCM 16-bit signed little-endian
- Frame Size: Typically 20ms chunks (640 bytes)

### RTP Streaming
Audio is automatically sent via RTP when using WebRTC AudioTrack. No manual frame sending needed - the track handles encoding and transmission.

For manual control (if needed):
- Frames can be sent via data channel as base64-encoded chunks
- Use `input_audio_buffer.append` events

## Error Handling

### Connection Errors
- Network failures → Retry with exponential backoff
- Token expiration → Request new ephemeral token
- ICE connection failure → Reconnect with new peer connection

### API Errors
```json
{
  "type": "error",
  "error": {
    "type": "invalid_request_error",
    "code": "invalid_value",
    "message": "Invalid audio format",
    "param": "input_audio_format"
  }
}
```

## Testing Strategy

### Unit Tests
1. Ephemeral token retrieval
2. SDP parsing
3. Event parsing (JSON deserialization)
4. State management

### Integration Tests
1. Full connection flow with mock OpenAI server
2. Audio streaming end-to-end
3. Error recovery scenarios

### Manual Tests
1. Connect with real OpenAI API key
2. Record audio via microphone
3. Verify transcripts in UI
4. Test tool calls

## Dependencies

### Android
```kotlin
// core/build.gradle.kts
val androidMain by getting {
    dependencies {
        // Option 1: Official Google WebRTC (if available)
        implementation("org.webrtc:google-webrtc:M114")
        
        // Option 2: Stream WebRTC (more actively maintained)
        implementation("io.getstream:stream-webrtc-android:1.0.7")
    }
}
```

### Desktop
```kotlin
// Recommended: Use WebSocket fallback instead of WebRTC
val desktopMain by getting {
    dependencies {
        implementation("io.ktor:ktor-client-websockets:2.3.7")
    }
}
```

## Implementation Checklist

### Phase 1: Core WebRTC (Android)
- [x] Expect/actual class structure
- [x] Ephemeral token retrieval
- [x] SDP offer creation
- [x] SDP answer handling
- [x] Data channel setup
- [x] Event parsing
- [ ] Fix WebRTC library dependency
- [ ] Context injection
- [ ] Test with real API

### Phase 2: Desktop Alternative
- [ ] Evaluate WebSocket vs WebRTC
- [ ] Implement chosen protocol
- [ ] Test parity with Android

### Phase 3: Audio Integration
- [ ] Connect AudioCaptureService to RealtimeClient
- [ ] Verify audio format (16kHz PCM16)
- [ ] Test bidirectional audio
- [ ] Add audio playback for responses

### Phase 4: Production Readiness
- [ ] Error recovery and reconnection
- [ ] Token refresh logic
- [ ] Connection state management
- [ ] Metrics and logging
- [ ] Update documentation

## Known Issues

1. **WebRTC Library Availability**: org.webrtc:google-webrtc artifact not found in Maven Central
   - **Solution**: Try io.getstream:stream-webrtc-android or build from source

2. **Context Dependency**: Android implementation needs Context for WebRTC initialization
   - **Solution**: Add factory method or dependency injection

3. **Desktop WebRTC**: No mature JVM WebRTC library
   - **Solution**: Use WebSocket fallback for Desktop

4. **Audio Format**: Need to verify AudioTrack uses correct PCM16 format
   - **Solution**: Configure MediaConstraints with explicit audio settings

## References

- [OpenAI Realtime API Docs](https://platform.openai.com/docs/guides/realtime)
- [WebRTC API](https://webrtc.org/)
- [Google WebRTC for Android](https://webrtc.googlesource.com/src/)
- [Stream WebRTC Android](https://github.com/GetStream/webrtc-android)
