# Phase 1.5 GitHub Issues

This document contains the **GitHub Issue content for Phase 1.5 tasks**.

> **Historical Note:** This document uses "Phase 1.5" and label `phase-1.5` as it was created during the transition period. Going forward, the project adopts a **whole integer phase numbering convention** (Phase 1, 2, 3, etc.). Future phases will use labels like `phase-2`, `phase-3`, etc., and unstarted phases may be renumbered. See AGENTS.md for the complete phase numbering convention.

## Purpose

While GitHub Copilot can create issues directly, this document serves as:

1. **Review & Approval** - Provides the issue content for human review before creation
2. **Version Control** - Tracks issue definitions in git history alongside code changes
3. **Batch Reference** - Allows reviewing all Phase 1.5 issues together for planning
4. **Reusability** - Can be used as templates for similar issues in future phases
5. **Documentation** - Permanent record of what Phase 1.5 entails, even after issues are closed

## Usage

**Option 1: Manual Creation**
- Copy issue content from this document
- Create issues via GitHub web UI or CLI
- Apply labels and assignees as specified

**Option 2: Copilot Creation** (Preferred)
- Ask GitHub Copilot to create these issues
- Reference this document for content
- Example: "@copilot create the 6 issues defined in docs/PHASE_1.5_ISSUES.md"

---

## Parent Issue #1: Implement Android Audio Streaming Integration

**Labels:** `feature`, `phase-1.5`, `android`, `priority-high`

**Assignee:** @copilot

### Summary
Integrate audio capture with the Realtime API client on Android to enable real-time voice streaming to OpenAI.

### Context
This feature is part of **Phase 1.5: Complete Phase 1 Features** and is needed to enable actual voice input in the Android app.

**Current State:**
- ✅ WebRTC connection established successfully
- ✅ AudioCaptureService implemented with AudioRecord
- ✅ RealtimeClient has WebRTC peer connection
- 🔴 Audio frames are not flowing from capture to WebRTC

**Dependencies:**
- None (all prerequisites complete)

### Acceptance Criteria
- [ ] AudioCaptureService.audioFrames flow is connected to RealtimeClient
- [ ] Audio frames are transmitted via WebRTC AudioTrack to peer connection
- [ ] Audio streaming starts when PTT button is pressed
- [ ] Audio streaming stops when PTT button is released
- [ ] Microphone permission denial is handled gracefully
- [ ] Network connection errors are handled gracefully
- [ ] Logcat shows audio frames being captured and sent
- [ ] Manual testing with real microphone confirms audio reaches OpenAI
- [ ] Documentation updated in IMPLEMENTATION_STATUS.md
- [ ] All sub-issues completed

### Sub-Issues
- [ ] #TBD - Wire AudioCaptureService output to RealtimeClient input
- [ ] #TBD - Implement WebRTC AudioTrack configuration
- [ ] #TBD - Add PTT button event handlers
- [ ] #TBD - Add error handling for audio and network issues
- [ ] #TBD - Test with real microphone and verify in logs

### AI Implementation Prompt

```
Connect audio capture to Realtime client for Android:

Files to modify:
- app-android/src/main/kotlin/llc/lookatwhataicando/codeoba/android/MainActivity.kt
- core/src/androidMain/kotlin/llc/lookatwhataicando/codeoba/core/data/RealtimeClientImpl.kt

Implementation steps:
1. In RealtimeClientImpl, add method to configure WebRTC AudioTrack:
   - Create AudioTrack from peer connection
   - Set audio source as microphone input
   - Configure for 16kHz mono PCM (matching AudioCaptureService output)
   
2. In MainActivity or CodeobaApp state management:
   - Collect audioFrames flow from AudioCaptureService
   - For each captured frame, send to RealtimeClient
   - Use realtimeClient.sendAudioFrame(frameBytes)
   
3. Handle PTT button lifecycle:
   - onPTTPressed: 
     - Start AudioCaptureService
     - Start WebRTC audio track
   - onPTTReleased:
     - Stop AudioCaptureService
     - Stop WebRTC audio track
   
4. Add error handling:
   - Catch microphone permission denied → show UI message
   - Catch audio capture failure → log and retry
   - Catch network connection issues → show connection error
   
5. Testing:
   - Build and run on Android device
   - Press PTT button and speak
   - Check logcat for:
     - "AudioCaptureService: Captured frame: X bytes"
     - "RealtimeClient: Sent audio frame to peer connection"
   - Verify audio reaches OpenAI (check for response events)
   
6. Update docs/IMPLEMENTATION_STATUS.md:
   - Mark "Android Audio Streaming Integration" as ✅ Complete
   - Update Phase 1.5 completion percentage

Reference:
- Existing AudioCaptureService: core/src/androidMain/kotlin/llc/lookatwhataicando/codeoba/core/platform/AndroidAudioCaptureService.kt
- Existing RealtimeClient: core/src/androidMain/kotlin/llc/lookatwhataicando/codeoba/core/data/RealtimeClientImpl.kt
```

### Testing Plan
1. Run app on Android device
2. Press "Connect" button → verify WebRTC connection established
3. Press and hold PTT button → speak into microphone
4. Check logcat for audio frame capture and transmission
5. Release PTT button → verify audio stops
6. Verify OpenAI receives audio (check for response events)

### Related Documentation
- IMPLEMENTATION_STATUS.md: [Phase 1.5 section](../IMPLEMENTATION_STATUS.md#phase-15-complete-phase-1-features-next)
- ARCHITECTURE.md: [Audio Capture Service](../ARCHITECTURE.md#audio-capture-abstraction)

---

## Parent Issue #2: Implement Android Audio Playback

**Labels:** `feature`, `phase-1.5`, `android`, `priority-high`

**Assignee:** @copilot

### Summary
Implement audio playback on Android to play voice responses received from OpenAI Realtime API.

### Context
This feature is part of **Phase 1.5: Complete Phase 1 Features** and is needed to enable users to hear AI responses.

**Current State:**
- ✅ WebRTC connection receives audio frames
- ✅ RealtimeClient has audioFrames: Flow<ByteArray> 
- 🔴 Received audio frames are not played through device speakers

**Dependencies:**
- Depends on #TBD (Android Audio Streaming) - partial dependency (can work independently)

### Acceptance Criteria
- [ ] AudioTrack configured for 16kHz mono PCM playback
- [ ] Audio frames from RealtimeClient.audioFrames are played
- [ ] Playback uses appropriate audio stream (USAGE_MEDIA, CONTENT_TYPE_SPEECH)
- [ ] Volume control implemented
- [ ] Playback works on speaker, Bluetooth, and wired headsets
- [ ] Audio device errors are handled gracefully
- [ ] Manual testing confirms clear audio output
- [ ] Documentation updated in IMPLEMENTATION_STATUS.md
- [ ] All sub-issues completed

### Sub-Issues
- [ ] #TBD - Configure AudioTrack for playback
- [ ] #TBD - Implement playback loop from audioFrames flow
- [ ] #TBD - Add volume control
- [ ] #TBD - Test on multiple audio devices

### AI Implementation Prompt

```
Implement audio playback for received audio frames on Android:

Files to modify:
- core/src/androidMain/kotlin/llc/lookatwhataicando/codeoba/core/data/RealtimeClientImpl.kt
- app-android/src/main/kotlin/llc/lookatwhataicando/codeoba/android/MainActivity.kt (if needed)

Implementation steps:
1. In RealtimeClientImpl or separate playback service:
   - Import android.media.AudioTrack, AudioFormat, AudioAttributes
   - Create AudioTrack instance:
     ```kotlin
     private val audioTrack = AudioTrack.Builder()
         .setAudioAttributes(
             AudioAttributes.Builder()
                 .setUsage(AudioAttributes.USAGE_MEDIA)
                 .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                 .build()
         )
         .setAudioFormat(
             AudioFormat.Builder()
                 .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                 .setSampleRate(16000)
                 .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                 .build()
         )
         .setBufferSizeInBytes(bufferSize)
         .setTransferMode(AudioTrack.MODE_STREAM)
         .build()
     ```
   
2. Collect audioFrames flow and write to AudioTrack:
   ```kotlin
   audioFrames.collect { frameBytes ->
       audioTrack.write(frameBytes, 0, frameBytes.size)
       if (audioTrack.playState != AudioTrack.PLAYSTATE_PLAYING) {
           audioTrack.play()
       }
   }
   ```
   
3. Add lifecycle management:
   - Start playback when connection established
   - Stop playback when disconnected
   - Release AudioTrack resources in cleanup
   
4. Add volume control:
   - Implement setVolume(level: Float) method
   - Use audioTrack.setVolume(level)
   
5. Add error handling:
   - Handle audio device disconnection
   - Handle audio format incompatibility
   - Log errors and emit error events
   
6. Testing:
   - Connect to OpenAI Realtime API
   - Speak a question
   - Verify audio response plays clearly
   - Test on: device speaker, Bluetooth headset, wired headset
   - Test volume control
   
7. Update docs/IMPLEMENTATION_STATUS.md:
   - Mark "Android Audio Playback" as ✅ Complete
   - Update Phase 1.5 completion percentage

Reference:
- Android AudioTrack documentation: https://developer.android.com/reference/android/media/AudioTrack
- Existing audio route manager for device selection
```

### Testing Plan
1. Run app on Android device
2. Connect to OpenAI Realtime API
3. Send voice input (via PTT or text)
4. Verify AI response is played through speakers
5. Test on multiple audio routes:
   - Device speaker
   - Bluetooth headset
   - Wired headset
6. Test volume control
7. Verify audio quality (clear, no distortion)

### Related Documentation
- IMPLEMENTATION_STATUS.md: [Phase 1.5 section](../IMPLEMENTATION_STATUS.md#phase-15-complete-phase-1-features-next)

---

## Parent Issue #3: Implement Android PTT & Text Input

**Labels:** `feature`, `phase-1.5`, `android`, `priority-medium`

**Assignee:** @copilot

### Summary
Wire up Push-to-Talk (PTT) button and text input field to enable user interaction with the Realtime API.

### Context
This feature is part of **Phase 1.5: Complete Phase 1 Features** and completes the user interface for voice and text interaction.

**Current State:**
- ✅ PTT button UI component exists
- ✅ Text input field UI component exists
- 🔴 PTT button doesn't control audio capture
- 🔴 Text input doesn't send to Realtime API

**Dependencies:**
- Partially depends on #TBD (Audio Streaming) for PTT functionality

### Acceptance Criteria
- [ ] PTT button press starts AudioCaptureService
- [ ] PTT button release stops AudioCaptureService
- [ ] PTT button visual state changes (blue → red) while active
- [ ] Text input sends message to OpenAI via data channel
- [ ] Text input clears after sending
- [ ] Both inputs work seamlessly with Realtime API
- [ ] Error states are displayed to user
- [ ] Documentation updated in IMPLEMENTATION_STATUS.md
- [ ] All sub-issues completed

### Sub-Issues
- [ ] #TBD - Wire PTT button to AudioCaptureService
- [ ] #TBD - Implement PTT visual feedback
- [ ] #TBD - Wire text input to send events
- [ ] #TBD - Test both input methods

### AI Implementation Prompt

```
Implement PTT button and text input functionality for Android:

Files to modify:
- core/src/commonMain/kotlin/llc/lookatwhataicando/codeoba/core/ui/CodeobaUI.kt
- app-android/src/main/kotlin/llc/lookatwhataicando/codeoba/android/MainActivity.kt

Implementation steps:
1. PTT Button (in CodeobaUI.kt or MainActivity):
   - Add onPTTPressed callback:
     ```kotlin
     onPTTPressed = {
         scope.launch {
             audioCaptureService.start()
             // Update UI state to show recording
         }
     }
     ```
   - Add onPTTReleased callback:
     ```kotlin
     onPTTReleased = {
         scope.launch {
             audioCaptureService.stop()
             // Update UI state to show not recording
         }
     }
     ```
   
2. Visual feedback for PTT:
   - Use state flow to track isRecording: Boolean
   - Change button color: blue (idle) → red (recording)
   - Optional: add recording indicator animation
   
3. Text input (in CodeobaUI.kt or MainActivity):
   - Add onTextSubmit callback:
     ```kotlin
     onTextSubmit = { text ->
         scope.launch {
             realtimeClient.sendTextMessage(text)
             // Clear input field
             textInputState.value = ""
         }
     }
     ```
   
4. Implement sendTextMessage in RealtimeClient:
   - Format as JSON event for data channel:
     ```json
     {
       "type": "conversation.item.create",
       "item": {
         "type": "message",
         "role": "user",
         "content": [{"type": "input_text", "text": "..."}]
       }
     }
     ```
   - Send via WebRTC data channel
   
5. Error handling:
   - Show snackbar if mic permission denied
   - Show error if not connected when PTT pressed
   - Disable inputs when disconnected
   
6. Testing:
   - Press and hold PTT → speak → release → verify audio sent
   - Type message → press send → verify text sent
   - Check logcat for events
   - Verify responses received for both input types
   
7. Update docs/IMPLEMENTATION_STATUS.md:
   - Mark "Android PTT & Text Input" as ✅ Complete
   - Update Phase 1.5 completion percentage

Reference:
- Existing UI: core/src/commonMain/kotlin/llc/lookatwhataicando/codeoba/core/ui/CodeobaUI.kt
- OpenAI Realtime API events: https://platform.openai.com/docs/guides/realtime
```

### Testing Plan
1. Run app on Android device
2. Connect to OpenAI Realtime API
3. Test PTT:
   - Press and hold button
   - Speak "What is Kotlin?"
   - Release button
   - Verify audio sent and response received
4. Test text input:
   - Type "What is Compose?"
   - Press send
   - Verify message sent and response received
5. Test error cases:
   - Press PTT without mic permission
   - Try to send while disconnected

### Related Documentation
- IMPLEMENTATION_STATUS.md: [Phase 1.5 section](../IMPLEMENTATION_STATUS.md#phase-15-complete-phase-1-features-next)
- OpenAI Realtime API: https://platform.openai.com/docs/guides/realtime

---

## Parent Issue #4: Implement Desktop WebSocket Realtime Client

**Labels:** `feature`, `phase-1.5`, `desktop`, `priority-high`

**Assignee:** @copilot

### Summary
Implement WebSocket-based Realtime API client for Desktop platform to enable voice interaction on JVM.

### Context
This feature is part of **Phase 1.5: Complete Phase 1 Features** and brings Desktop platform to feature parity with Android.

**Current State:**
- ✅ Desktop app has stub RealtimeClientImpl
- ✅ Ephemeral token retrieval implemented
- ✅ Event parsing logic implemented
- 🔴 No WebSocket connection (WebRTC not viable on JVM)

**Dependencies:**
- None (independent implementation)

**Technology Choice:**
- Use Ktor WebSocket client (already a dependency)
- WebSocket is more suitable for JVM than WebRTC

### Acceptance Criteria
- [ ] Ktor WebSocket client connects to wss://api.openai.com/v1/realtime
- [ ] Authentication via ephemeral token in query parameter
- [ ] Session configuration sent via session.update event
- [ ] Audio frames sent as base64-encoded events
- [ ] Incoming events parsed and emitted via events flow
- [ ] Reconnection logic with exponential backoff
- [ ] Error handling for network issues
- [ ] Manual testing with Desktop audio capture works
- [ ] Documentation updated in IMPLEMENTATION_STATUS.md
- [ ] All sub-issues completed

### Sub-Issues
- [ ] #TBD - Implement Ktor WebSocket connection
- [ ] #TBD - Implement session configuration
- [ ] #TBD - Implement audio frame streaming
- [ ] #TBD - Implement event parsing and emission
- [ ] #TBD - Add reconnection logic
- [ ] #TBD - Test with Desktop audio capture

### AI Implementation Prompt

```
Implement Desktop Realtime client using Ktor WebSocket:

File to modify:
- core/src/desktopMain/kotlin/llc/lookatwhataicando/codeoba/core/data/RealtimeClientImpl.kt

Implementation steps:
1. Add Ktor WebSocket dependency (already in project):
   - io.ktor:ktor-client-websockets
   - io.ktor:ktor-client-cio (engine)
   
2. Implement connect() method:
   ```kotlin
   override suspend fun connect(config: RealtimeConfig) {
       val token = getEphemeralToken(config.apiKey)
       
       client.webSocket(
           urlString = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17",
           request = {
               header("Authorization", "Bearer $token")
               header("OpenAI-Beta", "realtime=v1")
           }
       ) {
           // Connection established
           _connectionState.value = ConnectionState.Connected
           _events.emit(RealtimeEvent.Connected)
           
           // Send session configuration
           sendSessionUpdate()
           
           // Start receiving events
           for (frame in incoming) {
               when (frame) {
                   is Frame.Text -> {
                       val eventJson = frame.readText()
                       parseAndEmitEvent(eventJson)
                   }
                   else -> {}
               }
           }
       }
   }
   ```
   
3. Implement sendSessionUpdate():
   ```kotlin
   private suspend fun sendSessionUpdate() {
       val config = """
       {
           "type": "session.update",
           "session": {
               "turn_detection": {"type": "server_vad"},
               "voice": "alloy",
               "input_audio_format": "pcm16",
               "output_audio_format": "pcm16",
               "input_audio_transcription": {"model": "whisper-1"}
           }
       }
       """.trimIndent()
       
       outgoing.send(Frame.Text(config))
   }
   ```
   
4. Implement sendAudioFrame():
   ```kotlin
   override suspend fun sendAudioFrame(frame: ByteArray) {
       val base64Audio = Base64.getEncoder().encodeToString(frame)
       val event = """
       {
           "type": "input_audio_buffer.append",
           "audio": "$base64Audio"
       }
       """.trimIndent()
       
       outgoing.send(Frame.Text(event))
   }
   ```
   
5. Implement parseAndEmitEvent():
   - Parse JSON using kotlinx.serialization
   - Handle event types: session.created, response.audio.delta, conversation.item.created
   - Emit appropriate RealtimeEvent instances
   
6. Add reconnection logic:
   - Catch connection failures
   - Implement exponential backoff (1s, 2s, 4s, 8s, max 60s)
   - Auto-reconnect on disconnect
   
7. Testing:
   - Run Desktop app: ./gradlew :app-desktop:run
   - Press Connect → verify WebSocket connection
   - Send audio or text → verify events received
   - Check logs for connection and event flow
   
8. Update docs/IMPLEMENTATION_STATUS.md:
   - Mark "Desktop Realtime Client" as ✅ Complete
   - Update Phase 1.5 completion percentage

Reference:
- Ktor WebSocket docs: https://ktor.io/docs/websocket-client.html
- Existing Android WebRTC implementation for event parsing patterns
- OpenAI Realtime API: https://platform.openai.com/docs/guides/realtime
```

### Testing Plan
1. Run Desktop app: `./gradlew :app-desktop:run`
2. Click "Connect" button
3. Verify WebSocket connection in logs
4. Test audio input (if Desktop audio capture ready)
5. Test text input
6. Verify responses are received
7. Test reconnection by simulating network interruption

### Related Documentation
- IMPLEMENTATION_STATUS.md: [Phase 1.5 section](../IMPLEMENTATION_STATUS.md#phase-15-complete-phase-1-features-next)
- ARCHITECTURE.md: [Realtime Client](../ARCHITECTURE.md)

---

## Parent Issue #5: Implement Desktop Audio Playback

**Labels:** `feature`, `phase-1.5`, `desktop`, `priority-medium`

**Assignee:** @copilot

### Summary
Implement audio playback on Desktop using JavaSound to play voice responses from OpenAI.

### Context
This feature is part of **Phase 1.5: Complete Phase 1 Features** and completes audio functionality for Desktop platform.

**Current State:**
- ✅ Desktop Realtime client receives audio frames (after Issue #4)
- 🔴 No playback implementation

**Dependencies:**
- Depends on #TBD (Desktop WebSocket Client)

### Acceptance Criteria
- [ ] JavaSound SourceDataLine configured for 16kHz mono PCM
- [ ] Audio frames from RealtimeClient.audioFrames are played
- [ ] Playback works on system default audio device
- [ ] Volume control implemented
- [ ] Audio device errors handled gracefully
- [ ] Manual testing confirms clear audio output
- [ ] Documentation updated in IMPLEMENTATION_STATUS.md

### AI Implementation Prompt

```
Implement audio playback for Desktop using JavaSound:

File to modify:
- core/src/desktopMain/kotlin/llc/lookatwhataicando/codeoba/core/data/RealtimeClientImpl.kt
or create:
- core/src/desktopMain/kotlin/llc/lookatwhataicando/codeoba/core/platform/DesktopAudioPlaybackService.kt

Implementation steps:
1. Configure JavaSound SourceDataLine:
   ```kotlin
   import javax.sound.sampled.*
   
   private val audioFormat = AudioFormat(
       16000f,  // sample rate
       16,      // sample size in bits
       1,       // channels (mono)
       true,    // signed
       false    // little-endian
   )
   
   private val line: SourceDataLine = AudioSystem.getSourceDataLine(audioFormat).apply {
       open(audioFormat)
       start()
   }
   ```
   
2. Collect audioFrames flow and write to line:
   ```kotlin
   scope.launch {
       audioFrames.collect { frameBytes ->
           line.write(frameBytes, 0, frameBytes.size)
       }
   }
   ```
   
3. Add lifecycle management:
   - Start line when connection established
   - Stop and drain line when disconnected
   - Close line in cleanup
   
4. Add volume control:
   - Get volume control: line.getControl(FloatControl.Type.MASTER_GAIN)
   - Implement setVolume(level: Float)
   
5. Error handling:
   - Handle LineUnavailableException
   - Handle audio format not supported
   - Log errors and emit error events
   
6. Testing:
   - Run Desktop app
   - Connect and send voice/text input
   - Verify audio response plays clearly
   - Test volume control
   
7. Update docs/IMPLEMENTATION_STATUS.md:
   - Mark "Desktop Audio Playback" as ✅ Complete
   - Update Phase 1.5 completion percentage

Reference:
- JavaSound docs: https://docs.oracle.com/javase/tutorial/sound/
- Existing Desktop audio capture for patterns
```

### Testing Plan
1. Run Desktop app: `./gradlew :app-desktop:run`
2. Connect to OpenAI Realtime API
3. Send voice or text input
4. Verify audio response plays through speakers
5. Test volume control
6. Verify audio quality

### Related Documentation
- IMPLEMENTATION_STATUS.md: [Phase 1.5 section](../IMPLEMENTATION_STATUS.md#phase-15-complete-phase-1-features-next)

---

## Parent Issue #6: Phase 1.5 Integration Testing

**Labels:** `feature`, `phase-1.5`, `testing`, `priority-high`

**Assignee:** @copilot

### Summary
Comprehensive end-to-end testing of Phase 1.5 features to ensure all components work together correctly.

### Context
This feature is part of **Phase 1.5: Complete Phase 1 Features** and validates that all Phase 1 features are production-ready.

**Dependencies:**
- Depends on all other Phase 1.5 issues being complete

### Acceptance Criteria
- [ ] End-to-end voice flow works on Android
- [ ] End-to-end voice flow works on Desktop
- [ ] Text input works on both platforms
- [ ] Connection resilience tested (reconnection, errors)
- [ ] Error recovery validated (mic permission, network failures)
- [ ] Audio quality is acceptable on both platforms
- [ ] Documentation updated with test results
- [ ] Phase 1 marked as ✅ Complete in IMPLEMENTATION_STATUS.md

### Testing Checklist

#### Android Testing
- [ ] Connect to OpenAI Realtime API
- [ ] Voice input via PTT: question → response
- [ ] Text input: question → response
- [ ] Test all audio routes: speaker, Bluetooth, wired
- [ ] Test error cases: no mic permission, no network
- [ ] Test reconnection after network interruption
- [ ] Performance: no lag, no audio stuttering

#### Desktop Testing
- [ ] Connect to OpenAI Realtime API
- [ ] Voice input via PTT: question → response
- [ ] Text input: question → response
- [ ] Test on macOS, Windows, Linux (if possible)
- [ ] Test error cases: no mic permission, no network
- [ ] Test reconnection after network interruption
- [ ] Performance: no lag, no audio stuttering

#### Cross-Platform
- [ ] Consistent behavior between Android and Desktop
- [ ] Consistent UI/UX
- [ ] Consistent error messages
- [ ] Event logs show same information

### AI Implementation Prompt

```
Perform comprehensive integration testing for Phase 1.5:

Testing approach:
1. Review all Phase 1.5 issues are closed and merged
2. Pull latest main branch
3. Build both Android and Desktop apps
4. Execute test scenarios on both platforms
5. Document results in test report
6. Fix any critical issues discovered
7. Update IMPLEMENTATION_STATUS.md

Test scenarios:
- Happy path: connect → voice input → hear response
- Text alternative: connect → text input → hear response
- Error paths: no permission, no network, etc.
- Reconnection: simulate network interruption
- Audio quality: verify clarity on various devices
- Performance: monitor CPU/memory usage

Deliverables:
1. Test report documenting:
   - Test environment (devices, OS versions)
   - Test results (pass/fail for each scenario)
   - Issues found and resolution
   - Performance metrics
2. Updated IMPLEMENTATION_STATUS.md:
   - Phase 1: ✅ Complete (with completion date)
   - Phase 1.5: ✅ Complete (with completion date)
   - Updated completion percentages
3. Recommendations for Phase 2

Reference:
- IMPLEMENTATION_STATUS.md for all Phase 1/1.5 features
```

### Related Documentation
- IMPLEMENTATION_STATUS.md: [Phase 1.5 section](../IMPLEMENTATION_STATUS.md#phase-15-complete-phase-1-features-next)

---

## Summary

**Total Parent Issues:** 6
- 3 Android features (high priority)
- 2 Desktop features (high/medium priority)
- 1 Integration testing (high priority)

**Recommended Order:**
1. Issue #1: Android Audio Streaming (blocks other Android features)
2. Issue #4: Desktop WebSocket Client (independent, parallel work)
3. Issue #2: Android Audio Playback (depends on #1)
4. Issue #3: Android PTT & Text Input (depends on #1)
5. Issue #5: Desktop Audio Playback (depends on #4)
6. Issue #6: Integration Testing (depends on all above)

**Estimated Timeline:** 8-10 days for full Phase 1.5 completion

**Next Steps:**
1. Create these 6 issues in GitHub
2. Assign to @copilot
3. Start with Issues #1 and #4 in parallel
4. Track progress in GitHub Project board
