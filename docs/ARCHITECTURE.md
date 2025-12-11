# Architecture Documentation

## System Overview

Codeoba is a voice-driven AI programming assistant that enables natural language code generation through a sophisticated pipeline of modern technologies.

## Component Architecture

### 1. WebRTC Audio Layer

**Purpose**: Capture and stream microphone audio in real-time.

**Components**:
- `WebRTCService`: Manages WebRTC media streams
- `AudioProcessor`: Processes raw PCM audio data

**Flow**:
1. Request microphone permissions
2. Initialize WebRTC with 24kHz mono audio
3. Capture audio chunks
4. Process and buffer audio data
5. Stream to Realtime API

**Key Features**:
- Echo cancellation
- Noise suppression
- Auto gain control
- Configurable sample rate

### 2. Realtime API Layer

**Purpose**: Interface with OpenAI's Realtime API for voice understanding and AI responses.

**Components**:
- `RealtimeAPIClient`: WebSocket client for Realtime API
- `RealtimeResponseHandler`: Processes incoming messages

**Flow**:
1. Establish WebSocket connection
2. Configure session with tools and instructions
3. Stream audio data
4. Receive transcriptions and responses
5. Handle function calls
6. Stream audio responses back

**Message Types**:
- Session management
- Audio streaming
- Transcription events
- Response generation
- Function calling
- Error handling

### 3. MCP Protocol Layer

**Purpose**: Execute code operations through Model Context Protocol.

**Components**:
- `MCPClient`: JSON-RPC client for MCP servers
- `MCPToolExecutor`: Executes code-related tools

**Supported Operations**:
- `create_file`: Create new files
- `edit_file`: Modify existing files
- `delete_file`: Remove files
- `read_file`: Read file contents
- `list_files`: List directory contents

**Protocol**:
- JSON-RPC 2.0
- Transport-agnostic (HTTP/stdio/SSE)
- Tool discovery and execution
- Resource management

### 4. GitHub Integration Layer

**Purpose**: Interface with GitHub for repository management and code generation.

**Components**:
- `GitHubCopilotService`: GitHub API client
- `CodeGenerator`: Code generation utilities

**Capabilities**:
- Repository selection
- File CRUD operations
- Branch management
- Commit creation
- Code suggestions

### 5. UI Layer

**Purpose**: Provide user interface for controlling the application.

**Components**:
- `AppStateManager`: Central state management
- `MainScreen`: Main application interface
- Specialized widgets for each feature

**State Management**:
- Provider pattern for reactive updates
- Centralized state in `AppStateManager`
- Stream-based event handling

**UI Components**:
- Connection panel (API key input)
- Status indicator (connection state)
- Microphone button (voice toggle)
- Log viewer (activity logs)
- Repository selector
- Transcription/response display

## Data Flow

### Complete Voice-to-Code Flow

```
┌─────────────┐
│   User      │
│   Speaks    │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────┐
│  WebRTC Microphone Capture  │
│  - 24kHz PCM Audio          │
│  - Noise suppression        │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  Audio Processor            │
│  - Buffer management        │
│  - Chunk creation           │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  Realtime API Client        │
│  - WebSocket streaming      │
│  - Audio transcription      │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  AI Processing              │
│  - Intent understanding     │
│  - Function call generation │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  Response Handler           │
│  - Parse AI responses       │
│  - Extract tool calls       │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  MCP Tool Executor          │
│  - Execute code actions     │
│  - File operations          │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  GitHub Integration         │
│  - Generate code            │
│  - Commit changes           │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  Repository Updated         │
└─────────────────────────────┘
```

## State Management

### AppStateManager

Central state coordinator that:
- Manages all service lifecycles
- Coordinates inter-service communication
- Provides reactive UI updates
- Handles error propagation
- Maintains application logs

### State Flow

1. **Disconnected**: Initial state
2. **Connecting**: Services initializing
3. **Connected**: Ready for voice input
4. **Error**: Connection/operation failure

### Event Streams

- **Connection State**: `Stream<RealtimeConnectionState>`
- **Messages**: `Stream<Map<String, dynamic>>`
- **MCP Events**: `Stream<Map<String, dynamic>>`
- **UI Updates**: ChangeNotifier pattern

## Security Architecture

### API Key Management

- Keys stored in memory only
- Never persisted to disk
- User input required each session
- Cleared on disconnect

### Audio Privacy

- Audio sent to OpenAI servers
- No local recording/storage
- Real-time streaming only
- User control via microphone toggle

### GitHub Token Security

- Personal access token required
- Limited scope permissions
- Stored in memory only
- No token logging

## Error Handling

### Levels

1. **Service Level**: Try-catch in each service
2. **Manager Level**: Centralized error handling
3. **UI Level**: User-friendly error messages

### Recovery Strategies

- Automatic reconnection for network errors
- User notification for authentication errors
- Graceful degradation for feature failures
- Detailed logging for debugging

## Performance Considerations

### Audio Streaming

- Chunk size: 100ms (configurable)
- Buffer management to prevent memory leaks
- Efficient PCM encoding

### Network Optimization

- WebSocket for low latency
- Compression where supported
- Connection pooling

### UI Responsiveness

- Async operations for all I/O
- Stream-based updates for real-time data
- Efficient list rendering for logs

## Testing Strategy

### Unit Tests

- Individual service functionality
- State transitions
- Error conditions

### Integration Tests

- Service communication
- End-to-end workflows
- Error propagation

### Platform Tests

- WebRTC on different platforms
- Audio capture verification
- UI rendering consistency

## Deployment Architecture

### Cross-Platform Support

- Single codebase for all platforms
- Platform channels for native features
- Responsive UI for different screen sizes

### Build Configurations

- Development: Debug mode with logging
- Staging: Release mode with analytics
- Production: Optimized, minimal logging

## Future Architecture Considerations

### Scalability

- Plugin system for custom MCP servers
- Multiple AI provider support
- Distributed MCP server architecture

### Extensibility

- Custom tool definitions
- Configurable prompts
- User-defined workflows

### Performance

- Local AI models for offline mode
- Caching for common operations
- Background processing for large files
