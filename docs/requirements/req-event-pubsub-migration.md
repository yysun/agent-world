# New Event System for Managers - Requirements

## Overview
Create a completely new event system for the `src/managers` architecture using World-Level EventEmitter. This is a from-scratch implementation that will not modify existing code, ensuring zero compatibility issues.

## New Event System Architecture

### World-Level EventEmitter Design
- **Per-world event isolation** using `World.eventEmitter` from types.ts
- **Natural event scoping** - Each World instance has its own EventEmitter
- **Simple event types**: `'message'` for all messaging (flat naming)
- **Direct EventEmitter usage** - No abstraction layers or providers
- **Zero cross-world pollution** - Events are naturally isolated per World

### New Event Functions to Create
- `publishMessage()` - Publish messages using World.eventEmitter
- `subscribeToMessages()` - Subscribe to World.eventEmitter messages
- `broadcastToWorld()` - Send message to all agents in world
- `publishSSE()` - Streaming events using World.eventEmitter (new protocol)

### Agent Processing Approach
- **Automatic processing** - Agents automatically process all world messages
- **Event-driven responses** - Agents respond via World.eventEmitter events
- **Built-in filtering** - Agents filter relevant messages internally
- **Memory auto-sync** - Configurable flag to enable/disable automatic memory persistence

### New Files to Create

#### Core Event Management
- `src/managers/world-events.ts` - World EventEmitter event functions
- `src/managers/agent-events.ts` - Agent message processing and subscriptions
- `src/managers/message-manager.ts` - Message broadcasting and routing
- `src/managers/llm-manager.ts` - LLM integration with new SSE events

#### Enhanced Managers
- Enhanced `src/managers/world-manager.ts` - Integrate event management
- Enhanced `src/managers/agent-manager.ts` - Automatic agent subscriptions

## Implementation Requirements

### What Will Be Created (New Code Only)
1. **Complete event system** using World.eventEmitter - built from scratch
2. **Agent message processing logic** - reimplemented without dependencies
3. **LLM streaming integration** - new SSE events keeping message protocol
4. **Memory management** - configurable auto-sync to file system
5. **Message broadcasting** - world-scoped message distribution

### What Will NOT Be Changed (Zero Breaking Changes)
1. **Existing event system** (`src/event-bus.ts`, `src/world-event-bus.ts`) - unchanged
2. **Legacy modules** (`src/agent.ts`, `src/llm.ts`, `src/world.ts`) - unchanged
3. **Web server/API** - continues using existing event system
4. **CLI applications** - continues using existing event system
5. **All existing imports** - continue working unchanged

### New Manager Features

#### World Manager Enhancements
- World creation automatically sets up World.eventEmitter
- World deletion automatically cleans up all event subscriptions
- World loading restores agents and their event subscriptions
- No external event bus dependencies

#### Agent Manager Enhancements  
- Agent creation automatically subscribes to world messages
- Agent removal automatically unsubscribes and cleans up
- Agents automatically process all world messages (no manual triggers)
- Memory auto-sync flag controls automatic persistence

#### Message Processing Logic
- **Automatic message filtering** - agents decide which messages to process
- **LLM integration** - direct calls to new llm-manager for responses
- **Memory management** - automatic conversation history updates
- **Turn limit handling** - built-in LLM call management

### Configuration Options

#### Memory Auto-Sync Flag
```typescript
interface AgentConfig {
  // ...existing fields...
  autoSyncMemory?: boolean; // Default: true - auto-save memory to disk
}
```

#### Event Configuration
```typescript
interface WorldConfig {
  // ...existing fields...
  autoProcessMessages?: boolean; // Default: true - agents auto-process messages
}
```

### Dependencies for New Managers
- ✅ **Allowed Dependencies**:
  - `src/types.ts` - Core type definitions and World interface
  - `src/utils.ts` - Utility functions (kebab-case, etc.)
  - `src/managers/world-storage.ts` - World persistence operations
  - `src/managers/agent-storage.ts` - Agent persistence operations
  
- ❌ **Forbidden Dependencies**:
  - `src/event-bus.ts` - Old event system
  - `src/world-event-bus.ts` - Old world event management
  - `src/world-state.ts` - Legacy state management
  - `src/agent.ts` - Legacy agent processing
  - `src/llm.ts` - Legacy LLM integration

## New Event System Implementation

### Event Protocol Design

#### Message Events (using 'message' event name)
```typescript
// Event emission
world.eventEmitter.emit('message', {
  content: string,
  sender: string,
  timestamp: Date,
  messageId: string
});

// Event subscription
world.eventEmitter.on('message', (data) => {
  // Agents automatically process all messages
  // Internal filtering decides which to respond to
});
```

#### SSE Events (new protocol, same message structure)
```typescript
// Streaming events using World.eventEmitter
world.eventEmitter.emit('sse', {
  agentName: string,
  type: 'start' | 'chunk' | 'end' | 'error',
  content?: string,
  error?: string,
  messageId: string,
  usage?: TokenUsage
});
```

### Agent Processing Workflow

#### Automatic Message Processing
1. **Agent creation** → Automatic subscription to world messages
2. **Message received** → Agent evaluates if it should respond  
3. **LLM processing** → Call new llm-manager for response
4. **Response publishing** → Emit response via World.eventEmitter
5. **Memory update** → Auto-sync to file (if enabled)

#### Message Filtering Logic
```typescript
// Agents automatically filter messages internally
function shouldAgentRespond(agent: Agent, message: MessageEvent): boolean {
  // Check for direct mentions (@agentName)
  // Check for direct messages (sender targeting)
  // Agent-specific filtering logic
}
```

### Memory Management

#### Auto-Sync Configuration
```typescript
interface AgentConfig {
  // ...existing fields...
  autoSyncMemory?: boolean; // Default: true
}

// When enabled:
// - Automatic save to disk after each message processing
// - Configurable per agent
// - Async operation to prevent blocking
```

#### Memory Operations
- **Automatic updates** - Agent responses added to memory
- **Conversation history** - Full message thread tracking
- **Persistence timing** - Immediate vs batched saves
- **Error handling** - Rollback on save failures

### LLM Integration

#### New LLM Manager Features
```typescript
// src/managers/llm-manager.ts
export async function streamAgentResponse(
  world: World,
  agent: Agent, 
  messages: AgentMessage[],
  options?: LLMOptions
): Promise<string>

// Features:
// - Direct World.eventEmitter SSE events
// - Token usage tracking
// - Timeout handling
// - Memory integration
// - Turn limit management
```

#### SSE Event Flow
1. **LLM start** → Emit SSE 'start' event
2. **Token streaming** → Emit SSE 'chunk' events  
3. **Completion** → Emit SSE 'end' event with usage
4. **Error handling** → Emit SSE 'error' event

## Success Criteria

### Functional Requirements
- ✅ **World event isolation** - Each World.eventEmitter is independent
- ✅ **Automatic agent processing** - All world messages processed automatically
- ✅ **Memory auto-sync** - Configurable file persistence
- ✅ **LLM streaming** - New SSE events using World.eventEmitter
- ✅ **Zero dependencies** - No existing event system imports

### Architectural Requirements
- ✅ **Clean separation** - Managers are completely independent
- ✅ **No circular dependencies** - Clear dependency tree
- ✅ **Event cleanup** - Automatic subscription management
- ✅ **Error handling** - Proper rollback and error recovery
- ✅ **Performance** - Efficient event processing without abstractions

### Compatibility Requirements
- ✅ **Zero breaking changes** - Existing code continues working
- ✅ **Parallel operation** - New and old systems can coexist
- ✅ **Message protocol** - SSE events maintain same structure for clients
- ✅ **Gradual adoption** - Can switch consumers one by one
- ✅ **Testing isolation** - New system can be tested independently

## Implementation Phases

### Phase 1: Core Event Infrastructure
1. Create `world-events.ts` - World.eventEmitter message functions
2. Create `agent-events.ts` - Agent subscription management
3. Enhance `world-manager.ts` - Event-enabled world operations
4. Basic message emission and subscription testing

### Phase 2: Agent Processing System  
1. Enhance `agent-manager.ts` - Automatic agent subscriptions
2. Create `message-manager.ts` - Message broadcasting and routing
3. Implement agent message processing logic
4. Add message filtering and response logic

### Phase 3: LLM Integration
1. Create `llm-manager.ts` - New LLM system with World.eventEmitter
2. Implement streaming responses with SSE events
3. Add memory integration and auto-sync functionality
4. Turn limit management and timeout handling

### Phase 4: Advanced Features
1. Memory auto-sync configuration and optimization
2. Error handling and rollback mechanisms
3. Performance optimization and testing
4. Documentation and examples

## Out of Scope
- ❌ **Existing system changes** - No modifications to legacy event system
- ❌ **Migration tools** - No automatic migration utilities
- ❌ **Client changes** - Existing web/CLI clients continue using old system
- ❌ **Performance comparisons** - Focus on functionality, not optimization
- ❌ **Provider patterns** - Simple EventEmitter only, no Dapr integration
