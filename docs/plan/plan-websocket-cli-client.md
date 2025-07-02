# Implementation Plan: Shared Command Core CLI (cli-ink)

## Overview
Build a command-line interface that leverages the relocated shared commands system, supporting both pipeline mode (process arguments and exit) and interactive mode (Ink-based terminal UI) while sharing command core with WebSocket server.

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

### Phase 1: Commands Relocation
- [ ] Move `server/commands/` to root-level `commands/` directory
- [ ] Update all import paths in `server/ws.ts` and related files
- [ ] Ensure commands remain transport-agnostic with `ClientConnection` interface
- [ ] Update TypeScript module resolution for new command location
- [ ] Verify existing WebSocket functionality after relocation

### Phase 2: CLI Core Infrastructure  
- [ ] Set up CLI project structure under `cli-ink/`
- [ ] Install required dependencies (ink, @types/react, commander for arg parsing)
- [ ] Create argument parser for pipeline vs interactive mode detection
- [ ] Import relocated commands and events modules directly
- [ ] Add configuration management for root path and settings

### Phase 3: Pipeline Mode Implementation
- [ ] Implement argument parsing using commander.js or yargs
- [ ] Create pipeline input processing (stdin handling)
- [ ] Add command execution with direct output (no Ink UI)
- [ ] Implement exit-after-execution for pipeline mode
- [ ] Support chained command execution from arguments

### Phase 4: CLI Transport Layer (Interactive Mode)
- [ ] Implement `CLIClientConnection` class for Ink-based display
- [ ] Create mode detection (pipeline vs interactive)
- [ ] Handle JSON response parsing for CLI display formatting
- [ ] Add CLI-specific error handling and user feedback
- [ ] Implement terminal-optimized response formatting

### Phase 5: World Management Integration
- [ ] Use existing `getWorld()`, `listWorlds()` from core/world-manager directly
- [ ] Implement world selection using existing world loading functions
- [ ] Handle world context in both pipeline and interactive modes
- [ ] Add world discovery and selection for interactive mode
- [ ] Support world specification via command line arguments

### Phase 6: Event System Integration (Interactive Mode Only)
- [ ] Subscribe directly to `world.eventEmitter` instances for interactive mode
- [ ] Create Ink components for real-time event display
- [ ] Handle all EventType enum values using existing event structure
- [ ] Use existing `handleMessagePublish()` for message sending
- [ ] Skip event subscription in pipeline mode for performance

### Phase 7: Ink UI Implementation (Interactive Mode)
- [ ] Create main App component with shared command system integration
- [ ] Implement CommandInput component that calls existing `handleCommand()`
- [ ] Add EventDisplay component for real-time world events
- [ ] Create WorldSelector using existing world discovery functions
- [ ] Add StreamingResponse component for LLM output display
- [ ] Implement mode switching and context preservation

### Phase 8: Command System Integration
- [ ] Use relocated `handleCommand()` function directly with CLI ClientConnection
- [ ] Implement all existing commands without modification (reuse shared commands)
- [ ] Handle command results using existing `sendCommandResult()` with appropriate display
- [ ] Support both global and world-specific commands using existing routing
- [ ] Add CLI-specific command shortcuts and aliases as UI layer only

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
- **WorldSelector.tsx**: Uses existing `listWorlds()` and `getWorld()`
- **ResponseDisplay.tsx**: Formats command results from existing system

### Shared System Integration
- **Command Execution**: Direct use of `handleCommand()` from events.ts
- **World Management**: Direct use of core/world-manager functions
- **Event Publishing**: Direct use of `handleMessagePublish()` and world events

## Integration Points
- **Shared Command Core**: Use existing `server/commands` and `core` modules unchanged
- **Transport Layer Only**: CLI implements `ClientConnection` interface for terminal
- **Event System Reuse**: Direct subscription to existing world EventEmitter system
- **Configuration Layer**: CLI manages rootPath and preferences, passes to existing system
- **Command Parity**: 100% command compatibility with WebSocket interface

## Success Metrics
- [ ] All existing commands work identically in CLI and WebSocket
- [ ] Real-time world event streaming functional with Ink UI
- [ ] Zero command logic duplication between CLI and WebSocket
- [ ] Smooth user experience with rich terminal interface  
- [ ] Command response time parity or better than WebSocket interface

## Risk Mitigation
- **Minimal Changes**: Reuse existing command system reduces implementation risk
- **Transport Isolation**: CLI transport layer isolated from business logic
- **Proven Architecture**: Command system already proven with WebSocket transport
- **Incremental Development**: Start with basic commands, add features incrementally
- **Compatibility Testing**: Ensure CLI and WebSocket produce identical results
