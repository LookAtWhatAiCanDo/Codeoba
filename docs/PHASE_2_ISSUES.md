# Phase 2 GitHub Issues

This document contains the **GitHub Issue content for Phase 2 tasks**.

> **Historical Note:** This document was originally created as "Phase 1.5" but has been renumbered to Phase 2 as part of adopting a **whole integer phase numbering convention** (Phase 1, 2, 3, etc.). Future phases will use labels like `phase-3`, `phase-4`, etc., and unstarted phases may be renumbered. See AGENTS.md for the complete phase numbering convention.

## Purpose

While GitHub Copilot can create issues directly, this document serves as:

1. **Review & Approval** - Provides the issue content for human review before creation
2. **Version Control** - Tracks issue definitions in git history alongside code changes
3. **Batch Reference** - Allows reviewing all Phase 2 issues together for planning
4. **Reusability** - Can be used as templates for similar issues in future phases
5. **Documentation** - Permanent record of what Phase 2 entails, even after issues are closed

## Usage

**Option 1: Manual Creation**
- Copy issue content from this document
- Create issues via GitHub web UI or CLI
- Apply labels and assignees as specified

**Option 2: Copilot Creation** (Preferred)
- Ask GitHub Copilot to create these issues
- Reference this document for content
- Example: "@copilot create the 6 issues defined in docs/PHASE_2_ISSUES.md"

---

## Parent Issue #1: Implement Android Audio Streaming Integration

**Labels:** `feature`, `phase-2`, `android`, `priority-high`

**Assignee:** @copilot

### Summary
Integrate audio capture with the Realtime API client on Android to enable real-time voice streaming to OpenAI.

### Context
This feature is part of **Phase 2: Android Audio Streaming & Playback** and is needed to enable actual voice input in the Android app.

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

**Task:** Connect audio capture to Realtime client for Android

**Files to modify:**
- app-android/src/main/kotlin/llc/lookatwhataicando/codeoba/android/MainActivity.kt
- core/src/androidMain/kotlin/llc/lookatwhataicando/codeoba/core/data/RealtimeClientImpl.kt

**Implementation steps:**
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
   - Update Phase 2 completion percentage

**Reference:**
- Existing AudioCaptureService: core/src/androidMain/kotlin/llc/lookatwhataicando/codeoba/core/platform/AndroidAudioCaptureService.kt
- Existing RealtimeClient: core/src/androidMain/kotlin/llc/lookatwhataicando/codeoba/core/data/RealtimeClientImpl.kt

### Testing Plan
1. Run app on Android device
2. Press "Connect" button → verify WebRTC connection established
3. Press and hold PTT button → speak into microphone
4. Check logcat for audio frame capture and transmission
5. Release PTT button → verify audio stops
6. Verify OpenAI receives audio (check for response events)

### Related Documentation
- IMPLEMENTATION_STATUS.md: [Phase 2 section](../IMPLEMENTATION_STATUS.md#phase-15-complete-phase-1-features-next)
- ARCHITECTURE.md: [Audio Capture Service](../ARCHITECTURE.md#audio-capture-abstraction)

---

## Parent Issue #2: Implement Android Audio Playback

**Labels:** `feature`, `phase-2`, `android`, `priority-high`

**Assignee:** @copilot

### Summary
Implement audio playback on Android to play voice responses received from OpenAI Realtime API.

### Context
This feature is part of **Phase 2: Complete Phase 1 Features** and is needed to enable users to hear AI responses.

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

**Task:** Implement audio playback for received audio frames on Android

**Files to modify:**
- core/src/androidMain/kotlin/llc/lookatwhataicando/codeoba/core/data/RealtimeClientImpl.kt
- app-android/src/main/kotlin/llc/lookatwhataicando/codeoba/android/MainActivity.kt (if needed)

**Implementation steps:**
1. In RealtimeClientImpl or separate playback service:
   - Import android.media.AudioTrack, AudioFormat, AudioAttributes
   - Create AudioTrack instance with these settings:
     - AudioAttributes: USAGE_MEDIA, CONTENT_TYPE_SPEECH
     - AudioFormat: ENCODING_PCM_16BIT, 16000 Hz sample rate, CHANNEL_OUT_MONO
     - Transfer mode: MODE_STREAM
   
2. Collect audioFrames flow and write to AudioTrack:
   - Use audioTrack.write(frameBytes, 0, frameBytes.size)
   - Start playback if not already playing
   
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
   - Update Phase 2 completion percentage

**Reference:**
- Android AudioTrack documentation: https://developer.android.com/reference/android/media/AudioTrack
- Existing audio route manager for device selection

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
- IMPLEMENTATION_STATUS.md: [Phase 2 section](../IMPLEMENTATION_STATUS.md#phase-15-complete-phase-1-features-next)

---

## Parent Issue #3: Implement Android PTT & Text Input

**Labels:** `feature`, `phase-2`, `android`, `priority-medium`

**Assignee:** @copilot

### Summary
Wire up Push-to-Talk (PTT) button and text input field to enable user interaction with the Realtime API.

### Context
This feature is part of **Phase 2: Complete Phase 1 Features** and completes the user interface for voice and text interaction.

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

**Task:** Implement PTT button and text input functionality for Android

**Files to modify:**
- core/src/commonMain/kotlin/llc/lookatwhataicando/codeoba/core/ui/CodeobaUI.kt
- app-android/src/main/kotlin/llc/lookatwhataicando/codeoba/android/MainActivity.kt

**Implementation steps:**
1. PTT Button (in CodeobaUI.kt or MainActivity):
   - Add onPTTPressed callback that:
     - Launches coroutine to start audioCaptureService
     - Updates UI state to show recording
   - Add onPTTReleased callback that:
     - Launches coroutine to stop audioCaptureService
     - Updates UI state to show not recording
   
2. Visual feedback for PTT:
   - Use state flow to track isRecording: Boolean
   - Change button color: blue (idle) → red (recording)
   - Optional: add recording indicator animation
   
3. Text input (in CodeobaUI.kt or MainActivity):
   - Add onTextSubmit callback that:
     - Launches coroutine to send text via realtimeClient.sendTextMessage(text)
     - Clears input field after sending
   
4. Implement sendTextMessage in RealtimeClient:
   - Format as JSON event for data channel (type: "conversation.item.create")
   - Include message with role: "user", content type: "input_text"
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
   - Update Phase 2 completion percentage

**Reference:**
- Existing UI: core/src/commonMain/kotlin/llc/lookatwhataicando/codeoba/core/ui/CodeobaUI.kt
- OpenAI Realtime API events: https://platform.openai.com/docs/guides/realtime

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
- IMPLEMENTATION_STATUS.md: [Phase 2 section](../IMPLEMENTATION_STATUS.md#phase-15-complete-phase-1-features-next)
- OpenAI Realtime API: https://platform.openai.com/docs/guides/realtime

---

## Parent Issue #4: Implement Desktop WebSocket Realtime Client
## Parent Issue #4: Phase 2 Integration Testing

**Labels:** `feature`, `phase-2`, `testing`, `priority-high`

**Assignee:** @copilot

### Summary
Comprehensive end-to-end testing of Phase 2 features to ensure all components work together correctly.

### Context
This feature is part of **Phase 2: Android Audio Streaming & Playback** and validates that all Phase 2 Android features are production-ready.

**Dependencies:**
- Depends on all other Phase 2 issues being complete

### Acceptance Criteria
- [ ] End-to-end voice flow works on Android
- [ ] End-to-end voice flow works on Android
- [ ] Text input works on Android
- [ ] Connection resilience tested (reconnection, errors)
- [ ] Error recovery validated (mic permission, network failures)
- [ ] Audio quality is acceptable on Android
- [ ] Documentation updated with test results
- [ ] Phase 2 marked as ✅ Complete in IMPLEMENTATION_STATUS.md

### Testing Checklist

#### Android Testing
- [ ] Connect to OpenAI Realtime API
- [ ] Voice input via PTT: question → response
- [ ] Text input: question → response
- [ ] Test all audio routes: speaker, Bluetooth, wired
- [ ] Test error cases: no mic permission, no network
- [ ] Test reconnection after network interruption
- [ ] Performance: no lag, no audio stuttering

- [ ] Consistent behavior between Android and Desktop
- [ ] Consistent UI/UX
- [ ] Consistent error messages
- [ ] Event logs show same information

### AI Implementation Prompt

**Task:** Perform comprehensive integration testing for Phase 2

**Testing approach:**
1. Review all Phase 2 issues are closed and merged
2. Pull latest main branch
3. Build both Android and Desktop apps
4. Execute test scenarios on both platforms
5. Document results in test report
6. Fix any critical issues discovered
7. Update IMPLEMENTATION_STATUS.md

**Test scenarios:**
- Happy path: connect → voice input → hear response
- Text alternative: connect → text input → hear response
- Error paths: no permission, no network, etc.
- Reconnection: simulate network interruption
- Audio quality: verify clarity on various devices
- Performance: monitor CPU/memory usage

**Deliverables:**
1. Test report documenting:
   - Test environment (devices, OS versions)
   - Test results (pass/fail for each scenario)
   - Issues found and resolution
   - Performance metrics
2. Updated IMPLEMENTATION_STATUS.md:
   - Phase 1: ✅ Complete (with completion date)
   - Phase 2: ✅ Complete (with completion date)
   - Updated completion percentages
3. Recommendations for Phase 3

**Reference:**
- IMPLEMENTATION_STATUS.md for all Phase 2 features

### Related Documentation
- IMPLEMENTATION_STATUS.md: [Phase 2 section](../IMPLEMENTATION_STATUS.md#phase-15-complete-phase-1-features-next)

---

## Summary

**Total Parent Issues:** 4 (Android-focused)
- 3 Android features (high priority)
- 1 Integration testing (high priority)

**Note:** Desktop features moved to Phase 5 for mobile-first approach

**Recommended Order:**
1. Issue #1: Android Audio Streaming (blocks other Android features)
2. Issue #2: Android Audio Playback (depends on #1)
3. Issue #3: Android PTT & Text Input (depends on #1)
4. Issue #4: Integration Testing (depends on all above)

**Estimated Timeline:** 5-6 days for Android-only Phase 2 completion

**Next Steps:**
1. Create these 4 issues in GitHub
2. Label with `phase-2`
3. Assign to @copilot
4. Start with Issue #1
5. Track progress in GitHub Project board
