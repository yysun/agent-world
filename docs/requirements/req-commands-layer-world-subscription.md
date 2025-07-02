# Requirements: Commands Layer World Subscription Refactoring

## Overview
Refactor world subscription and client connection logic from transport layers (CLI and WebSocket) into the commands layer to achieve better separation of concerns and code reuse.

## Current Architecture Issues

### Problem Statement
Currently, both CLI (`cli/index.ts`) and WebSocket server (`server/ws.ts`) independently implement:
- World loading via `getWorld()` from core
- Event listener setup and cleanup
- World subscription lifecycle management
- Client connection patterns

This creates code duplication and makes it harder to maintain consistent behavior across transports.

### Current Implementation Patterns

#### CLI Implementation
- Direct calls to `getWorld()` from core/world-manager
- Manual event listener setup with `setupWorldEventListeners()`
- Custom `ClientConnection` pattern for console output
- World refresh handling after commands

#### WebSocket Implementation  
- Direct calls to `getWorld()` from core/world-manager
- Manual event listener setup with `setupWorldEventListeners()`
- Custom `ClientConnection` pattern for WebSocket output
- World refresh handling after commands

## Requirements

### R1: Commands Layer World Subscription
- **Create new `subscribeWorld(id/name, clientConnection)` function in commands layer**
- Accept world identifier and client connection interface
- Handle world loading, event listener setup, and subscription lifecycle
- Return world subscription object with cleanup methods

### R2: Enhanced Client Connection Interface
- **Extend existing `ClientConnection` interface** in commands/events.ts
- Support both WebSocket and console-based implementations
- Include connection state management methods
- Provide transport-agnostic message sending capabilities

### R3: Unified World Management
- **Move world subscription logic from transport layers to commands**
- Centralize world loading, event subscription, and cleanup
- Provide consistent API for both CLI and WebSocket transports
- Handle world refresh scenarios uniformly

### R4: Transport-Specific Client Implementations
- **CLI implements `ClientConnection` for console output**
- Handle color formatting, streaming display, and terminal interaction
- Maintain existing user experience and functionality

- **WebSocket implements `ClientConnection` for WebSocket transport**
- Handle JSON message formatting and WebSocket sending
- Maintain existing protocol compatibility

### R5: Backward Compatibility
- **Maintain existing command interfaces and functionality**
- Preserve all current CLI and WebSocket behaviors
- Ensure no breaking changes to external APIs
- Keep existing message schemas and protocols

## Functional Requirements

### FR1: Commands Layer API
```typescript
// New functions in commands layer
interface WorldSubscription {
  world: World;
  unsubscribe: () => Promise<void>;
  refresh: () => Promise<void>;
}

function subscribeWorld(
  worldIdentifier: string, 
  rootPath: string,
  client: ClientConnection
): Promise<WorldSubscription>;

function getWorld(
  worldIdentifier: string,
  rootPath: string
): Promise<World | null>;

// Enhanced ClientConnection interface
interface ClientConnection {
  send: (data: string) => void;
  isOpen: boolean;
  // New methods for subscription management
  onWorldEvent?: (eventType: string, eventData: any) => void;
  onError?: (error: string) => void;
}
```

### FR2: CLI Client Implementation
- Implement `ClientConnection` interface for console interaction
- Handle terminal-specific formatting and display
- Manage streaming responses and real-time updates
- Provide color coding and visual feedback

### FR3: WebSocket Client Implementation  
- Implement `ClientConnection` interface for WebSocket communication
- Handle JSON serialization and WebSocket message sending
- Maintain existing protocol compatibility
- Support all current message types and schemas

### FR4: World Subscription Lifecycle
- **Subscribe**: Load world, setup event listeners, return subscription object
- **Event Handling**: Forward world events to client connection
- **Cleanup**: Remove event listeners, cleanup resources
- **Refresh**: Reload world state after modifications

## Technical Requirements

### TR1: Commands Layer Integration
- Leverage existing `processInput()` and command system
- Use existing `ClientConnection` interface as foundation
- Integrate with current world loading and event systems
- Maintain stateless command execution model

### TR2: Error Handling
- Comprehensive error handling for world loading failures
- Graceful degradation when worlds don't exist
- Proper cleanup on connection errors or disconnection
- Meaningful error messages for all failure scenarios

### TR3: Memory Management
- Proper cleanup of event listeners on unsubscribe
- Prevent memory leaks from world subscriptions
- Efficient resource management for multiple connections
- Automatic cleanup on connection termination

### TR4: Performance
- Minimal overhead for world subscription management
- Efficient event forwarding without performance impact
- Optimized world loading and caching where appropriate
- Scalable design for multiple concurrent subscriptions

## Implementation Strategy

### Phase 1: Commands Layer Enhancement
1. Extend `ClientConnection` interface in commands/events.ts
2. Create `subscribeWorld()` function in commands layer
3. Create `getWorld()` wrapper function in commands layer
4. Add world subscription management utilities

### Phase 2: CLI Refactoring
1. Implement CLI-specific `ClientConnection` for console
2. Replace direct core calls with commands layer calls
3. Update world loading and subscription logic
4. Test CLI functionality for compatibility

### Phase 3: WebSocket Refactoring
1. Implement WebSocket-specific `ClientConnection`
2. Replace direct core calls with commands layer calls
3. Update WebSocket subscription handling
4. Test WebSocket functionality for compatibility

### Phase 4: Integration Testing
1. Verify feature parity between old and new implementations
2. Test world subscription lifecycle across both transports
3. Validate error handling and edge cases
4. Performance testing for regression detection

## Success Criteria

### SC1: Code Reuse
- ✅ World subscription logic centralized in commands layer
- ✅ No duplication between CLI and WebSocket implementations
- ✅ Consistent behavior across all transport methods

### SC2: Functionality Preservation
- ✅ All existing CLI commands work identically
- ✅ All existing WebSocket functionality preserved
- ✅ No breaking changes to external APIs
- ✅ Maintain existing user experience

### SC3: Architecture Improvement
- ✅ Clean separation between transport and business logic
- ✅ Centralized world management in commands layer
- ✅ Extensible design for future transport additions
- ✅ Reduced maintenance burden

### SC4: Error Handling
- ✅ Comprehensive error handling across all scenarios
- ✅ Graceful failure modes with meaningful messages
- ✅ Proper resource cleanup in all cases
- ✅ No memory leaks or resource exhaustion

## Dependencies
- Existing commands layer infrastructure
- Current core world management system
- CLI and WebSocket transport implementations
- World event system and EventEmitter integration

## Risks and Mitigation
- **Risk**: Breaking existing functionality during refactoring
- **Mitigation**: Comprehensive testing and gradual migration approach

- **Risk**: Performance regression from additional abstraction
- **Mitigation**: Benchmark testing and optimization where needed

- **Risk**: Complexity increase in commands layer
- **Mitigation**: Clear interface design and comprehensive documentation
