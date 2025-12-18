# Android Audio Playback Testing Guide

This document provides instructions for testing the Android audio playback implementation.

## Prerequisites

- Android device (physical device recommended for accurate audio testing)
- Android 10 (API 30) or higher
- Valid OpenAI API key configured in `local.properties`
- Bluetooth headset (optional, for Bluetooth routing tests)
- Wired headset (optional, for wired routing tests)

## Setup

1. **Build and Install the App:**
   ```bash
   ./gradlew :app-android:assembleDebug
   adb install app-android/build/outputs/apk/debug/app-android-debug.apk
   ```

2. **Configure API Key:**
   - Add to `local.properties`:
     ```
     DANGEROUS_OPENAI_API_KEY=sk-your-api-key-here
     ```

3. **Grant Permissions:**
   - RECORD_AUDIO (microphone)
   - BLUETOOTH_CONNECT (for Bluetooth routing on Android 12+)

## Test Scenarios

### 1. Basic Audio Playback (Speaker)

**Steps:**
1. Launch the app
2. Press "Connect" button
3. Wait for connection to establish (status shows "Connected")
4. Press and hold PTT (Push-to-Talk) button
5. Speak a question (e.g., "What is the capital of France?")
6. Release PTT button
7. Listen for AI response

**Expected Result:**
- ✅ Audio response plays through device speaker
- ✅ Audio is clear and understandable
- ✅ No distortion or stuttering

**Logs to Check:**
```
adb logcat | grep -E "RealtimeClient|AudioSwitch"
```
- Look for: "onAddTrack: Remote audio track received"
- Look for: "Applied volume X.X to remote audio track"
- Look for: "AudioSwitch devices changed"

### 2. Bluetooth Headset Routing

**Prerequisites:**
- Pair Bluetooth headset with device

**Steps:**
1. Connect Bluetooth headset
2. Launch app and connect to API
3. Send voice input via PTT
4. Listen for response

**Expected Result:**
- ✅ Response plays through Bluetooth headset (not device speaker)
- ✅ AudioSwitch automatically selects Bluetooth device
- ✅ Audio quality is good

**Logs to Check:**
```
adb logcat | grep AudioSwitch
```
- Look for: "selected=BluetoothHeadset"

### 3. Wired Headset Routing

**Steps:**
1. Connect wired headset to device
2. Launch app and connect to API
3. Send voice input via PTT
4. Listen for response

**Expected Result:**
- ✅ Response plays through wired headset
- ✅ AudioSwitch automatically selects wired device
- ✅ Audio quality is good

**Logs to Check:**
```
adb logcat | grep AudioSwitch
```
- Look for: "selected=WiredHeadset"

### 4. Volume Control

**Steps:**
1. Connect to API
2. Send voice input to get a response
3. While response is playing, adjust device volume
4. Send another voice input
5. Verify volume change

**Expected Result:**
- ✅ Volume adjusts in real-time
- ✅ Volume persists across multiple responses

**Note:** Volume control via app API not yet exposed in UI. For programmatic testing:
```kotlin
realtimeClient.setVolume(0.5f) // 50% volume
```

### 5. Device Switching During Playback

**Steps:**
1. Connect to API via device speaker
2. Send voice input
3. While response is playing, connect Bluetooth headset
4. Verify audio switches to Bluetooth

**Expected Result:**
- ✅ Audio smoothly transitions to new device
- ✅ No audio interruption or glitches

### 6. Error Handling

**Test 6.1: No Audio Output Device**
- Not applicable (all Android devices have speaker)

**Test 6.2: AudioSwitch Initialization Failure**
- Simulate by disconnecting all audio devices (difficult to test)
- Expected: App continues with WebRTC default routing

**Test 6.3: Network Interruption During Playback**
1. Connect to API
2. Send voice input
3. Disable Wi-Fi/cellular during response playback
4. Observe behavior

**Expected Result:**
- ✅ Connection error event emitted
- ✅ Playback stops gracefully
- ✅ App remains responsive

## Verification Checklist

Audio Quality:
- [ ] No distortion or crackling
- [ ] No stuttering or buffering issues
- [ ] Voice is clear and natural-sounding
- [ ] Volume level is appropriate

Device Routing:
- [ ] Speaker playback works
- [ ] Bluetooth headset playback works
- [ ] Wired headset playback works
- [ ] Automatic device switching works
- [ ] Device priority is correct (Bluetooth > Wired > Speaker)

Integration:
- [ ] Playback starts immediately after AI response begins
- [ ] Playback stops when response ends
- [ ] No audio overlap with microphone input
- [ ] Volume control works

Error Handling:
- [ ] Connection errors handled gracefully
- [ ] AudioSwitch initialization errors handled
- [ ] App doesn't crash on audio device disconnect

## Troubleshooting

### No Audio Output

1. **Check Volume:**
   - Device volume is not muted
   - Media volume is set appropriately

2. **Check Logs:**
   ```bash
   adb logcat | grep -E "RealtimeClient|AudioSwitch|WebRTC"
   ```
   - Look for "onAddTrack" messages
   - Look for AudioSwitch device selection

3. **Check Permissions:**
   - RECORD_AUDIO granted
   - BLUETOOTH_CONNECT granted (Android 12+)

4. **Check Connection:**
   - App shows "Connected" status
   - Data channel is open

### Audio Plays on Wrong Device

1. **Check AudioSwitch Selection:**
   ```bash
   adb logcat | grep AudioSwitch
   ```
   - Verify correct device is selected

2. **Manually Select Device:**
   - Use AudioSwitch API to force device selection
   ```kotlin
   realtimeClient.selectAudioDevice(desiredDevice)
   ```

### Distorted or Choppy Audio

1. **Check Network:**
   - Ensure stable internet connection
   - Check latency/bandwidth

2. **Check CPU Usage:**
   - Monitor device performance
   - Close background apps

3. **Check Audio Settings:**
   - Disable audio processing if enabled
   - Check device audio settings

## API Documentation

### Volume Control

```kotlin
// Set volume (0.0 = mute, 1.0 = full)
realtimeClient.setVolume(0.8f)

// Get current volume
val volume = realtimeClient.getVolume()
```

### Device Management

```kotlin
// Get available audio devices
val devices: List<AudioDevice> = realtimeClient.getAvailableAudioDevices()

// Get currently selected device
val selected: AudioDevice? = realtimeClient.getSelectedAudioDevice()

// Select specific device
realtimeClient.selectAudioDevice(device)
```

## Known Limitations

1. **Manual Device Testing Required:**
   - Physical Android device needed for accurate testing
   - Emulator may not accurately simulate audio devices

2. **Volume UI Not Implemented:**
   - Volume control API exists but no UI yet
   - Device hardware buttons control volume

3. **No Custom AudioTrack:**
   - Using WebRTC's built-in playback
   - Cannot extract raw PCM data for visualization

## Next Steps

After successful testing:

1. Update `IMPLEMENTATION_STATUS.md`:
   - Mark manual testing as complete
   - Document any issues found

2. Create GitHub issue for any bugs:
   - Include logs and reproduction steps
   - Tag with `bug` and `audio` labels

3. Consider UI Enhancements:
   - Add volume slider to UI
   - Add audio device selector dropdown
   - Add audio visualizer for playback

## References

- [AudioSwitch Library Documentation](https://github.com/twilio/audioswitch)
- [WebRTC Android Documentation](https://webrtc.github.io/webrtc-org/native-code/android/)
- [OpenAI Realtime API](https://platform.openai.com/docs/guides/realtime)
