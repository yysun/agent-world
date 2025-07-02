# Requirements: Direct Commands CLI Client

## Overview
Create a command-line interface that directly integrates with the Agent World commands and events system, bypassing WebSocket transport for local world and agent interaction using Ink for rich terminal UI.

## Core Requirements

### Direct System Integration
- Direct integration with existing commands and events modules
- Local world management without server dependency
- User-configurable root path for world data storage
- Direct event listener registration on world EventEmitter instances
- Transport-agnostic command execution and response handling

### World Selection and Management
- User-driven world selection from available worlds in root path
- **Automatic World Selection Logic**:
  - If no `--world` argument provided on startup:
    - Get all available worlds from root path
    - If no worlds exist: automatically create 'default-world'
    - If exactly one world found: auto-load it for immediate use
    - If multiple worlds found: present interactive world selection menu
- Real-time world loading and agent discovery
- Local world state management and persistence
- **World Refresh Handling**: Automatic world refresh after commands that modify world state
- Support for world creation and configuration through commands

### Event Display and Interaction
- Real-time event streaming from world EventEmitter instances
- Rich terminal UI using Ink for interactive components
- Display world events, agent responses, and system messages
- Support for streaming LLM responses with live updates
- Event filtering and formatting for optimal terminal display

### Command Processing
- Accept user commands and route to existing command system
- Support all existing commands (/clear, /getWorlds, etc.) locally
- Direct command execution without WebSocket transport layer
- Display command results with proper formatting
- Handle both data responses and traditional command responses

### User Input Handling
- Interactive command-line interface using Ink components
- Accept user commands and messages for direct processing
- Support all existing command syntax and parameters
- Enable direct message publishing to world events
- Provide rich terminal interactions with real-time feedback

### Streaming Support
- Real-time LLM response streaming through direct event subscription
- Live terminal updates using Ink's reactive components
- Support for SSE events from world EventEmitter
- Chunked response display with proper formatting
- Streaming progress indicators and completion status

### World Interaction
- Direct world loading and selection from user-specified root path
- **Smart World Discovery**: Automatic world selection based on availability
- **Default World Creation**: Auto-create 'default-world' when no worlds exist
- **Interactive World Selection**: User menu when multiple worlds available
- Local world management without server dependency
- Real-time event subscription to world EventEmitter instances
- **Automatic World Refresh**: Reload world state after modifying commands
- Direct message publishing to world event system
- Local agent management and interaction

## Functional Requirements

### CLI Commands
- `setroot <path>` - Set root path for world data storage
- `worlds` - List available worlds from root path
- `select <world-name>` - Select and load a world locally
- `agents` - Show current world agents
- `clear [agent-name]` - Clear agent memory
- `help` - Show available commands
- `exit` - Exit CLI application
- Support for all existing commands with direct execution (no WebSocket routing)

### Message Sending
- Direct command execution through existing command system
- Local message publishing to world events (e.g., "Hello, world!")
- Support for all existing commands without WebSocket transport
- Command result display with proper formatting

### Display Features
- Rich terminal UI using Ink for interactive components
- Real-time event streaming display with live updates
- Structured output for command responses
- Color-coded message types (success, error, events)
- Timestamp display for events
- Streaming response display with progress indicators

## Technical Requirements

### Architecture
- Direct integration with existing commands and events modules
- Transport-agnostic command execution without WebSocket layer
- Local world management and event subscription
- Separation between CLI interface and core business logic
- Follow existing project patterns with direct imports

### Dependencies
- Ink - Rich terminal UI framework for React-like components
- Chalk - Terminal color formatting (if not provided by Ink)
- Existing core modules - Direct imports from core/, not server/
- Node.js readline - For input handling (may be replaced by Ink)

### Event System Integration
- Direct subscription to world.eventEmitter instances
- Local event handling without WebSocket transport
- Support for all EventType enum values (MESSAGE, WORLD, SSE, SYSTEM)
- Real-time streaming through direct event listeners

### Error Handling
- Connection error recovery
- Invalid command feedback
- Server error message display
- Graceful degradation when disconnected

### Configuration
- Default server URL configuration
- Environment variable support
- Connection timeout settings
- Logging level configuration

## User Experience Requirements

### Interactive Mode
- Real-time command prompt
- Command auto-completion
- Command history navigation
- Clear visual feedback for all operations

### Output Formatting
- Structured display for world and agent data
- Real-time event streaming with timestamps
- Color-coded message types
- Progress indicators for long operations

### Session Management
- Maintain connection state across commands
- Remember last subscribed world
- Persistent command history
- Session recovery on reconnection

## Integration Requirements

### Server Compatibility
- Compatible with existing WebSocket server implementation
- Use existing message schemas and command formats
- Support all current WebSocket message types
- Handle server-side command validation and responses

### Data Handling
- Parse and display world information
- Format agent data and status
- Handle event forwarding from world subscriptions
- Process command results and data responses

### Message Schema Compatibility
- Compatible with existing server WebSocket message schemas
- Support for subscription lifecycle messages (subscribe/unsubscribe)
- Handle command messages (system/world types with '/' prefix)
- Process regular messages (message type for agent interaction)
- Parse server response formats (success/error with data fields)
- Support event forwarding with eventType field structure

### Echo Prevention and Filtering
- Filter out user's own messages to prevent echo
- Handle server-side sender normalization (user -> HUMAN)
- Distinguish between user messages and agent responses
- Implement proper message attribution and display logic

## Non-Functional Requirements

### Performance
- Responsive user interface
- Efficient message processing
- Minimal memory usage
- Fast command execution

### Reliability
- Robust error handling
- Connection recovery mechanisms
- Graceful shutdown procedures
- Data consistency during reconnection

### Usability
- Intuitive command syntax
- Clear help documentation
- Consistent behavior across commands
- User-friendly error messages

## Success Criteria

### Basic Functionality
- Successfully connect to WebSocket server
- Execute all existing server commands through CLI
- Subscribe to worlds and receive real-time events
- Send messages and interact with agents

### User Experience
- Smooth, responsive command-line interface
- Clear visual feedback for all operations
- Intuitive command syntax and help system
- Reliable connection management

### Integration
- Seamless compatibility with existing server
- Proper handling of all message types
- Consistent behavior with web client
- Support for all current server features

## Future Considerations

### Enhancement Opportunities
- Configuration file support
- Script execution capabilities
- Batch command processing
- Advanced terminal features (split panes, tabs)

### Extensibility
- Plugin system for custom commands
- Configurable display formats
- Custom event handlers
- Integration with external tools
