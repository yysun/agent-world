# Event System Documentation

## Overview

The Agent World system uses a comprehensive event-driven architecture to manage communication between agents, the CLI, and system components. This document outlines all event-related functions and their purposes.

## Event Types

The system uses four main event types defined in `EventType` enum:

- **MESSAGE**: User/agent communication messages
- **WORLD**: World management and lifecycle events  
- **SSE**: Server-sent events for real-time streaming
- **SYSTEM**: Debug and logging information

## Event Publishing Functions (Event Producers)

### `publishMessageEvent`
**Purpose**: Publishes user/agent messages to the MESSAGE topic

**Used in**:
- `broadcastMessage()` - When humans send messages to all agents
- `sendMessage()` - When sending direct messages to specific agents  
- `processAgentMessage()` - When agents publish their responses
- Turn limit and pass command handling

**Payload**: `MessageEventPayload { content: string, sender: string }`

### `publishWorldEvent` 
**Purpose**: Publishes world management events to the WORLD topic

**Used in**:
- `createWorld()` - When a new world is created
- World lifecycle events

**Payload**: `SystemEventPayload { action: string, worldName?: string, ... }`

### `publishSSE`
**Purpose**: Publishes server-sent events for real-time streaming

**Used in**:
- `processAgentMessage()` - For LLM streaming responses (start, chunk, end, error)
- Error handling and timeout scenarios

**Payload**: `SSEEventPayload { agentName: string, type: 'start'|'chunk'|'end'|'error', content?: string, error?: string }`

### `publishDebugEvent`
**Purpose**: Publishes debug/logging information to the SYSTEM topic  

**Used for**:
- Turn counter changes (`incrementTurnCounter`, `resetTurnCounter`)
- Centralized turn counter resets in broadcast/send functions
- Mention detection results (`extractMentions`)
- Message routing decisions (`shouldRespondToMessage`)
- Auto-mention logic
- Pass command detection
- Turn limit blocking
- LLM timeout handling

**Payload**: `SystemEventPayload { action: 'debug', content: string, timestamp?: string, ... }`

## Event Subscription Functions (Event Consumers)

### Core Agent Processing

#### `subscribeAgentToMessages` (Internal)
**Purpose**: Core agent message processing subscription

**What it does**:
- **Message filtering**: Only processes MESSAGE events from other agents/users
- **Agent activation**: Calls `processAgentMessage()` for each relevant message
- **Turn counting**: Increments turn counter after agent responses
- **Duplicate prevention**: Prevents multiple subscriptions per agent
- **Self-filtering**: Agents don't process their own messages

**Flow**:
```
MESSAGE event → Filter by sender ≠ agent.name → processAgentMessage → incrementTurnCounter
```

### Public API Functions

#### `subscribeToMessageEvents`
**Purpose**: General message subscription wrapper
**Implementation**: Simple wrapper around `subscribeToMessages` from event-bus

#### `subscribeToWorldEvents`
**Purpose**: World management event subscription
**Implementation**: Wrapper around `subscribeToWorld` from event-bus

#### `subscribeToSSEEvents`
**Purpose**: Real-time streaming event subscription  

**What it does**: 
- **CLI streaming display**: Used by CLI to show agent responses in real-time
- **Progress indicators**: Handles start/chunk/end/error streaming states

**Used by**: CLI to display agent responses with flashing emoji indicators

#### `subscribeToSystemEvents`
**Purpose**: Debug/system event subscription

**What it does**:
- **Debug display**: Used by CLI to show debug messages in gray
- **System monitoring**: Tracks turn counters, mention detection, routing decisions

**Used by**: CLI to display debug information in gray color

#### `subscribeToAgentMessages`
**Purpose**: Agent-specific message filtering

**What it does**: 
- **Targeted listening**: Only receives messages for specific agents
- **Direct messaging**: Filters by recipient/targetName

**Note**: Currently filters by worldName + recipient, but may not be fully utilized

## Agent Message Processing Functions

### `shouldRespondToMessage`
**Purpose**: Message routing and filtering logic

**What it does**:
- **Mention detection**: Calls `extractMentions()` to find @mentions
- **Routing decisions**: Determines if agent should respond based on:
  - Public messages (no mentions) → all agents respond
  - Private messages (@mentions) → only mentioned agents respond  
  - Agent-to-agent messages → only mentioned agents respond
  - System messages → all agents respond
- **Debug logging**: Publishes routing decisions via `publishDebugEvent`

**Logic Flow**:
```
Message → Extract mentions → Route based on:
- No mentions + HUMAN sender → Public (all respond)
- Has mentions + HUMAN sender → Private (only mentioned respond)
- Agent sender → Only mentioned respond
- System sender → All respond
```

### `extractMentions`
**Purpose**: Parse @mentions from message content

**What it does**:
- **Regex parsing**: Finds @agentName patterns in messages
- **Mention extraction**: Returns array of mentioned agent names
- **Debug logging**: Publishes found mentions via `publishDebugEvent`

**Regex**: `/(?<!@)@([a-zA-Z]\w*(?:[-_]\w*)*)/g`

## Turn Management Functions

### `incrementTurnCounter`
**Purpose**: Track consecutive agent messages
- Publishes debug events when turn count increases
- Called after successful agent message processing
- Only increments for non-HUMAN, non-system messages

### `resetTurnCounter`
**Purpose**: Reset turn counter to prevent infinite agent loops
- Publishes debug events when turn count resets
- **Centralized**: Called in `broadcastMessage`/`sendMessage` for HUMAN/system messages
- **Fixed**: Previously was called by each agent (causing duplication)

### `isTurnLimitReached`
**Purpose**: Check if turn limit (5) is reached
- Used to block agent responses when limit reached
- Triggers @human redirect message

## Event Flow Architecture

### Complete Message Flow
```
1. Human Input → CLI
2. CLI → broadcastMessage() → publishMessageEvent()
3. Event Bus → All subscribed agents via subscribeAgentToMessages()
4. Each Agent → shouldRespondToMessage() → extractMentions()
5. Responding Agents → processAgentMessage() → LLM → publishSSE() (streaming)
6. Agent Response → publishMessageEvent() (agent's response)
7. CLI → subscribeToSSEEvents() (displays streaming)
8. CLI → subscribeToSystemEvents() (displays debug in gray)
```

### Turn Counter Flow (Fixed)
```
1. Human message → broadcastMessage() → publishDebugEvent("[Centralized Reset]") → resetTurnCounter()
2. Agent processes → processAgentMessage() → publishMessageEvent()
3. Other agents see agent message → incrementTurnCounter()
4. After 5 turns → isTurnLimitReached() → block responses → @human redirect
```

## Event Topics

- **messages**: MESSAGE events (user/agent communication)
- **world**: WORLD events (world management) 
- **sse**: SSE events (real-time streaming)
- **system**: SYSTEM events (debug information)

## Key Architectural Fixes

### Duplication Prevention
- **Problem**: Each agent was calling `resetTurnCounter()` causing duplicate resets
- **Solution**: Centralized turn counter reset in `broadcastMessage`/`sendMessage`
- **Result**: Turn counter reset happens once per message, not once per agent

### Debug Event System
- **Problem**: Console.log statements scattered throughout code
- **Solution**: Replaced with `publishDebugEvent()` + CLI subscription to SYSTEM events
- **Result**: Clean event-driven debug system with structured data

### Subscription Management
- **Problem**: Potential duplicate agent subscriptions
- **Solution**: Subscription tracking with `agentSubscriptions` Map
- **Result**: Each agent subscribes exactly once to messages

## Error Handling

- **LLM Timeouts**: Graceful handling with `publishSSE({ type: 'error' })`
- **Turn Limits**: Automatic @human redirect when 5 consecutive agent messages reached
- **Pass Commands**: Agent can use `<world>pass</world>` to transfer control to human
- **Memory Management**: Automatic archiving and cleanup of agent memory

## Usage Examples

### Subscribe to all messages
```typescript
subscribeToMessageEvents(worldName, (event) => {
  console.log('New message:', event.payload.content);
});
```

### Subscribe to debug events
```typescript
subscribeToSystemEvents(worldName, (event) => {
  if (event.payload.action === 'debug') {
    console.log(colors.gray(event.payload.content));
  }
});
```

### Subscribe to streaming responses
```typescript
subscribeToSSEEvents(worldName, (event) => {
  switch (event.payload.type) {
    case 'start': startStreaming(event.payload.agentName); break;
    case 'chunk': addContent(event.payload.content); break;
    case 'end': endStreaming(); break;
  }
});
```

This event system provides a clean, extensible architecture for managing all communication and coordination in the Agent World system.

## Function Consolidation Improvements (June 2025)

### High Priority: Eliminated Wrapper Functions ✅
- **Removed**: 4 unnecessary wrapper functions from `world.ts`:
  - `subscribeToMessageEvents()` → Use `subscribeToMessages()` from `event-bus.ts` 
  - `subscribeToWorldEvents()` → Use `subscribeToWorld()` from `event-bus.ts`
  - `subscribeToSSEEvents()` → Use `subscribeToSSE()` from `event-bus.ts`
  - `subscribeToSystemEvents()` → Use `subscribeToSystem()` from `event-bus.ts`
- **Benefits**: Simplified API, direct event-bus usage, eliminated redundant code
- **Backward Compatibility**: Functions re-exported from `world.ts` for compatibility

### Medium Priority: Turn Management Consolidation ✅
- **Created**: `TurnManager` object with organized turn counter operations:
  ```typescript
  TurnManager.getCount(worldName)     // Get current turn count
  TurnManager.increment(worldName)    // Increment turn counter
  TurnManager.reset(worldName)        // Reset turn counter
  TurnManager.isLimitReached(worldName) // Check if limit reached
  ```
- **Legacy Support**: Original functions still exported for backward compatibility
- **Benefits**: Better organization, cleaner API, centralized turn management

### Event Publishing Functions (Maintained) ✅
- **Kept Separate**: `publishMessageEvent()`, `publishWorldEvent()`, `publishSSE()`, `publishDebugEvent()`
- **Rationale**: Provide valuable type safety and semantic clarity
- **Benefits**: Clear API boundaries, proper payload typing, distinct responsibilities

### Updated Import Patterns
**Before:**
```typescript
import { subscribeToSSEEvents, subscribeToSystemEvents } from '../src/world';
```

**After:**
```typescript
import { subscribeToSSE, subscribeToSystem } from '../src/event-bus';
```

### Impact Summary
- **Functions Eliminated**: 4 wrapper functions
- **API Simplified**: Direct event-bus usage throughout codebase
- **Tests**: All 129 tests pass with new consolidated structure
- **Backward Compatibility**: Maintained through re-exports
- **Code Quality**: Improved separation of concerns
