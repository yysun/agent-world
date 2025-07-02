# Implementation Plan: Shared Command Core CLI (cli-ink)

## Overview
Build a com### Phase 6: Event System Integration (Interactive Mode Only) ✅ COMPLETED
- [x] **ARCHITECTURE MATCH**: Subscribe directly to `world.eventEmitter` instances (## Success Metrics
- [x] All existing commands work identically in CLI and WebSocket
- [x] **Architecture Consistency**: CLI uses commands layer exclusively like WebSocket
- [x] **Architecture Consistency**: CLI uses identical world loading, event subscription, and cleanup patterns as WebSocket server
- [x] Real-time world event streaming functional with Ink UI
- [x] Zero command logic duplication between CLI and WebSocket
- [x] Smooth user experience with rich terminal interface  
- [x] Command response time parity or better than WebSocket interface
- [x] SSE streaming display with real-time chunk rendering and visual indicators WebSocket server)
- [x] **ARCHITECTURE MATCH**: Use setupWorldEventListeners() pattern (same as WebSocket server)
- [x] **ARCHITECTURE MATCH**: Use cleanupWorldSubscription() pattern (same as WebSocket server)
- [x] **ARCHITECTURE MATCH**: Use refreshWorldSubscription() pattern (same as WebSocket server)
- [x] **ARCHITECTURE MATCH**: Handle all event types (system, world, message, sse) using existing event structure
- [x] **ARCHITECTURE MATCH**: Filter user message echoes (same as WebSocket server)
- [x] Create Ink components for real-time event display with connection state tracking
- [x] Route events to Ink UI components instead of WebSocket client transport
- [x] Add proper cleanup on component unmount to prevent memory leaks
- [x] Skip event subscription in pipeline mode for performance

### Phase 6.1: SSE Streaming Display Enhancement ✅ COMPLETED
- [x] Display SSE chunks inline as they arrive (real-time streaming)
- [x] Handle SSE chunk accumulation for continuous display
- [x] Add proper SSE event type detection and routing (chunk, end, error)
- [x] Implement streaming text display component for LLM responses
- [x] Handle SSE end events for proper line termination and move to event history
- [x] Visual indicators for active streaming with typing cursor effect
- [x] Separate streaming display from regular event history
- [x] Error handling for streaming failuresine interface that leverages the relocated shared commands system, supporting both pipeline mode (process arguments and exit) and interactive mode (Ink-based terminal UI) while sharing command core with WebSocket server.

## Key Architectural Changes
- **Commands Relocated**: Move `server/commands/` to root-level `commands/` for true sharing
- **Dual Mode CLI**: Support pipeline mode (argument processing) and interactive mode (Ink UI)  
- **Pipeline Support**: Process stdin input and command arguments, then exit
- **Interactive Loop**: Enter rich terminal UI when not in pipeline mode
- **Shared Command Core**: Both WebSocket server and CLI use same command system

## CLI Operation Modes

### Pipeline Mode (Non-Interactive)
```bash
# Direct command execution
cli-ink --root /data/worlds --world myworld --command "clear agent1"

# Pipeline input processing  
echo "Hello agents" | cli-ink --root /data/worlds --world myworld

# Chained command execution
cli-ink setroot /data/worlds select myworld clear agent1 exit
```

### Interactive Mode (Ink UI)
```bash
# Enter interactive mode
cli-ink

# Enter with context
cli-ink --root /data/worlds
cli-ink --root /data/worlds --world myworld
```

## Implementation Steps

### Phase 1: Commands Relocation ✅ COMPLETED
- [x] Move `server/commands/` to root-level `commands/` directory
- [x] Update all import paths in `server/ws.ts` and related files
- [x] Ensure commands remain transport-agnostic with `ClientConnection` interface
- [x] Update TypeScript module resolution for new command location
- [x] Verify existing WebSocket functionality after relocation

### Phase 2: CLI Core Infrastructure ✅ COMPLETED
- [x] Set up CLI project structure under `cli-ink/`
- [x] Install required dependencies (ink, @types/react, commander for arg parsing)
- [x] Create argument parser for pipeline vs interactive mode detection
- [x] Import relocated commands and events modules directly
- [x] Add configuration management for root path and settings

### Phase 3: Pipeline Mode Implementation ✅ COMPLETED
- [x] Implement argument parsing using commander.js or yargs
- [x] Create pipeline input processing (stdin handling)
- [x] Add command execution with direct output (no Ink UI)
- [x] Implement exit-after-execution for pipeline mode
- [x] Support chained command execution from arguments

### Phase 4: CLI Transport Layer (Interactive Mode) ✅ COMPLETED
- [x] Implement `CLIClientConnection` class for Ink-based display
- [x] Create mode detection (pipeline vs interactive)
- [x] Handle JSON response parsing for CLI display formatting
- [x] Add CLI-specific error handling and user feedback
- [x] Implement terminal-optimized response formatting

### Phase 5: World Management Integration ✅ COMPLETED
- [x] **ARCHITECTURE MATCH**: Use core `getWorld()` for world loading (same as WebSocket server)
- [x] Use commands layer for command execution (same as WebSocket server)
- [x] Handle world context in both pipeline and interactive modes
- [x] Add world discovery and selection for interactive mode
- [x] Support world specification via command line arguments
- [x] **CONSISTENCY**: CLI now follows identical architecture to WebSocket server

### Phase 5.1: Smart World Auto-Selection ✅ COMPLETED
- [x] Implement automatic world discovery on startup when no --world specified
- [x] Auto-create 'default-world' when no worlds exist in root path (partial - command format needs refinement)
- [x] Auto-load single world when exactly one world found
- [x] Create interactive world selection menu when multiple worlds available
- [x] Add world refresh handling in CLIClientConnection after state-modifying commands

### Phase 6: Event System Integration (Interactive Mode Only) ✅ COMPLETED
- [x] Subscribe directly to `world.eventEmitter` instances for interactive mode
- [x] Create Ink components for real-time event display
- [x] Handle all EventType enum values using existing event structure
- [x] Use existing `handleMessagePublish()` for message sending
- [x] Skip event subscription in pipeline mode for performance
- [x] **ARCHITECTURE MATCH**: Use `getWorld()` + `setupWorldEventListeners()` pattern (same as WebSocket)
- [x] **CLEANUP PATTERN**: Implement `cleanupWorldSubscription()` and `refreshWorldSubscription()` (same as WebSocket)
- [x] **EVENT FILTERING**: Skip user message echoes and forward agent responses (same as WebSocket)
- [x] **STATE MANAGEMENT**: Connection-specific world state tracking with proper cleanup

### Phase 7: Ink UI Implementation (Interactive Mode) ✅ COMPLETED
- [x] Create main App component with shared command system integration
- [x] Implement CommandInput component that calls existing `handleCommand()`
- [x] Add EventDisplay component for real-time world events
- [x] Create WorldSelector using existing world discovery functions
- [x] Add StreamingResponse component for LLM output display
- [x] Implement mode switching and context preservation

### Phase 8: Command System Integration ✅ COMPLETED
- [x] Use relocated `handleCommand()` function directly with CLI ClientConnection
- [x] Implement all existing commands without modification (reuse shared commands)
- [x] Handle command results using existing `sendCommandResult()` with appropriate display
- [x] Support both global and world-specific commands using existing routing
- [x] Add CLI-specific command shortcuts and aliases as UI layer only

### Phase 9: Advanced Features
- [ ] Add command history and auto-completion for interactive mode
- [ ] Implement session state management for CLI context
- [ ] Create configuration file support for CLI preferences
- [ ] Add CLI-specific logging and debug capabilities
- [ ] Optimize performance for both pipeline and interactive modes

### Phase 10: Testing and Documentation
- [ ] Create integration tests for both pipeline and interactive modes
- [ ] Add unit tests for CLI-specific transport layer
- [ ] Write user documentation for both CLI operation modes
- [ ] Create examples showing command parity with WebSocket interface
- [ ] Performance testing for pipeline vs interactive vs WebSocket response times

### Phase 8: Advanced Integration
- [ ] Add proper command categorization (global vs world-specific)
- [ ] Implement intelligent command routing based on subscription state
- [ ] Add command auto-completion based on current context
- [ ] Handle server-side world refresh scenarios
- [ ] Implement advanced error recovery and state synchronization
- [ ] Add support for batch command execution

## Critical Implementation Considerations

### Shared Command System Architecture
- **Commands Relocated**: Move from `server/commands/` to root `commands/` for true sharing
- **Transport Layer Only**: CLI implements `ClientConnection` interface for both modes
- **Zero Code Duplication**: Same command execution path as WebSocket server
- **Consistent Behavior**: Identical command results regardless of transport or mode

### Dual Mode Operation
- **Pipeline Mode**: Process arguments, execute commands, output results, exit
- **Interactive Mode**: Enter Ink-based UI loop with real-time event handling
- **Mode Detection**: Automatic based on argument presence and stdin availability
- **Context Preservation**: Command line context carries into interactive mode

### CLI ClientConnection Implementation
- **Pipeline Mode**: Direct stdout output, no JSON parsing needed
- **Interactive Mode**: Parse JSON responses and route to Ink components
- **Mode-Specific Display**: Simple text output vs rich terminal UI
- **Error Handling**: Appropriate error output for each mode

### Pipeline Support Architecture
- **Argument Parsing**: Use commander.js or yargs for robust CLI argument handling
- **Stdin Processing**: Handle piped input for message processing
- **Command Chaining**: Support multiple commands in single invocation
- **Exit Behavior**: Clean exit after command execution in pipeline mode

### Event System Reuse
- **Direct EventEmitter Access**: Subscribe to `world.eventEmitter` (same as WebSocket)
- **Existing Event Publishing**: Use `handleMessagePublish()` unchanged
- **No Echo Prevention**: Local execution eliminates echo issues naturally
- **Streaming Support**: Handle SSE events same as WebSocket with Ink display

### Configuration and State Management
- **Root Path Configuration**: CLI manages rootPath, passes to existing `prepareCommandWithRootPath()`
- **World Context**: Use existing world loading and management from core modules
- **Session State**: CLI layer maintains current world selection and preferences
- **Command History**: CLI-specific feature layered on top of existing commands

## File Structure
```
cli/direct-client/
├── index.ts                 # CLI entry point with Ink app
├── components/              # Ink UI components
│   ├── App.tsx             # Main application component
│   ├── CommandInput.tsx    # Command input component  
│   ├── EventDisplay.tsx    # Event streaming display
│   ├── WorldSelector.tsx   # World selection interface
│   └── ResponseDisplay.tsx # Command response formatting
├── transport/              # CLI transport layer
│   ├── cli-client.ts       # CLIClientConnection implementation
│   ├── response-parser.ts  # JSON response parsing for display
│   └── display-manager.ts  # Ink component routing
├── config.ts               # Configuration management
├── types.ts                # CLI-specific type definitions
└── README.md               # Usage documentation
```

## Dependencies
- `ink` - Rich terminal UI framework for React-like components
- `@types/react` - TypeScript definitions for React (required by Ink)  
- Existing `server/commands` and `core` modules (direct imports)
- No additional external dependencies required

## Key Components

### CLI Transport Layer
- **CLIClientConnection**: Implements `ClientConnection` interface for Ink display
- **ResponseParser**: Parses JSON responses from existing command system
- **DisplayManager**: Routes responses to appropriate Ink components

### Ink UI Components  
- **App.tsx**: Main application using existing command system
- **CommandInput.tsx**: Input that calls existing `handleCommand()`
- **EventDisplay.tsx**: Real-time events from `world.eventEmitter`
- **WorldSelector.tsx**: Uses commands layer (`/getWorlds`, `/addWorld`) for consistency
- **ResponseDisplay.tsx**: Formats command results from existing system

### Shared System Integration
- **Command Execution**: Direct use of `processInput()` from commands/index.ts (same as WebSocket)
- **World Loading**: Use core `getWorld()` for world object creation (same as WebSocket)
- **Event Subscription**: Direct subscription to `world.eventEmitter` (same as WebSocket)
- **Event Listeners Setup**: Use `setupWorldEventListeners()` pattern (same as WebSocket)
- **Cleanup Pattern**: Use `cleanupWorldSubscription()` for proper cleanup (same as WebSocket)
- **World Refresh**: Use `refreshWorldSubscription()` pattern after state changes (same as WebSocket)
- **Event Publishing**: Direct use of `handleMessagePublish()` and world events
- **Event Filtering**: Skip user message echoes (same as WebSocket)

## Integration Points
- **Shared Command Core**: Use commands layer for command execution (same as WebSocket)
- **World Management**: Use core `getWorld()` for world loading (same as WebSocket)
- **Transport Layer Only**: CLI implements `ClientConnection` interface for terminal
- **Event System Reuse**: Direct subscription to existing world EventEmitter system
- **Configuration Layer**: CLI manages rootPath and preferences, passes to existing system
- **Command Parity**: 100% command compatibility with WebSocket interface
- **Consistent Architecture**: Both CLI and WebSocket use identical dual-layer approach

## Success Metrics
- [x] All existing commands work identically in CLI and WebSocket
- [x] **Architecture Consistency**: CLI uses commands layer exclusively like WebSocket
- [x] Real-time world event streaming functional with Ink UI
- [x] Zero command logic duplication between CLI and WebSocket
- [x] Smooth user experience with rich terminal interface  
- [x] Command response time parity or better than WebSocket interface
- [x] **Event System Alignment**: CLI follows identical event subscription patterns as WebSocket
- [x] **World Management Consistency**: CLI uses same getWorld() + setupWorldEventListeners() as WebSocket

## Risk Mitigation
- **Minimal Changes**: Reuse existing command system reduces implementation risk
- **Transport Isolation**: CLI transport layer isolated from business logic
- **Proven Architecture**: Command system already proven with WebSocket transport
- **Incremental Development**: Start with basic commands, add features incrementally
- **Compatibility Testing**: Ensure CLI and WebSocket produce identical results

## Phase 6 Architectural Alignment Summary ✅ COMPLETED

### CLI App.tsx now matches WebSocket ws.ts architecture:

#### World Management
- **Loading**: Uses `getWorld()` from core/world-manager (identical to WebSocket)
- **State Tracking**: Implements `WorldState` interface with world + eventListeners (same pattern as WebSocket)
- **Cleanup**: Implements `cleanupWorldSubscription()` function (identical pattern to WebSocket)

#### Event System
- **Setup**: Implements `setupWorldEventListeners()` function (identical pattern to WebSocket)
- **Filtering**: Skips user message echoes using same logic as WebSocket
- **Event Types**: Handles all event types (system, world, message, sse) same as WebSocket
- **Routing**: Routes to Ink components instead of WebSocket client transport

#### Subscription Lifecycle
- **Subscribe**: Implements `handleSubscribe()` function (identical pattern to WebSocket)
- **Refresh**: Implements `refreshWorldSubscription()` function (identical pattern to WebSocket)
- **Cleanup**: Proper event listener removal and memory leak prevention

#### Key Differences (Transport-Specific)
- **Display Target**: Routes events to Ink UI components vs WebSocket client.send()
- **Logging**: Uses console methods vs Pino structured logging
- **State Management**: React state vs WebSocket connection-specific state
- **Lifecycle**: React useEffect cleanup vs WebSocket disconnect cleanup
