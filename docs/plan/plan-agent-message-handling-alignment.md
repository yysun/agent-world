# Agent Message Handling Alignment Plan

## Overview

Analyze and align agent message handling logic between `src` and `core` folders to ensure consistent behavior.

## Current Analysis

### `src` Folder Implementation (Reference Implementation)

#### Core Message Processing (`src/agent.ts`)
1. **`processAgentMessage`** - Main processing function with:
   - Always saves incoming messages to memory regardless of response decision
   - Checks `shouldRespondToMessage` for response decision
   - Loads conversation history for context
   - Increments LLM call count before making call
   - Handles pass commands with `<world>pass</world>` detection
   - Auto-mentions for agent-to-agent replies
   - Publishes final response via event system

2. **`shouldRespondToMessage`** - Comprehensive filtering logic:
   - Never responds to own messages
   - Ignores turn limit messages to prevent loops
   - Checks LLM call count against world turn limits
   - Resets LLM call count on human/system messages
   - Always responds to system messages
   - Handles @mention extraction with first-mention-only logic
   - Public messages (no mentions) from humans reach all agents
   - Private messages (with mentions) only trigger first mentioned agent
   - Agent messages only trigger response if agent is first mentioned

3. **`extractMentions`** - First-mention-only logic:
   - Extracts all @mentions from content
   - Returns only the first valid mention
   - Prevents multiple agent responses to same message

4. **Additional Features**:
   - Turn limit checking with world-specific limits
   - Memory persistence with auto-save
   - Pass command handling
   - Auto-mention replies to agents
   - Debug event publishing
   - Error handling with timeout support

### `core` Folder Implementation (Simplified Version)

#### Current Implementation (`core/agent-events.ts`)
1. **`processAgentMessage`** - Basic implementation:
   - Adds message to agent memory
   - Calls LLM for response
   - Adds response to memory
   - Auto-syncs memory to disk
   - Publishes response

2. **`shouldAgentRespond`** - Minimal filtering:
   - Only checks for direct mentions (`@agentName`)
   - Returns false by default

#### Missing Features in `core`:
- Turn limit logic and LLM call count tracking **with world-specific limits**
- First-mention-only logic
- Pass command handling
- Auto-mention for agent-to-agent replies
- Human vs system message differentiation
- Public message handling (no mentions)
- Conversation history loading
- Memory persistence for incoming messages
- Debug event publishing
- Error handling and timeout management
- **World-specific event emitter usage** (agents must use their world's eventEmitter)
- **World context awareness** (agents must know their world for turn limits and events)

## Implementation Progress

### ✅ Step 1: Enhanced `shouldAgentRespond` Function - COMPLETE
**File**: `core/agent-events.ts`

**Changes Made**:
- ✅ Implemented full `shouldRespondToMessage` logic from `src`
- ✅ Added turn limit checking with LLM call count using world-specific turn limits
- ✅ Added first-mention-only logic
- ✅ Added public message handling for humans
- ✅ Added human/system message type detection
- ✅ Added turn limit reset logic
- ✅ Ensured world context is passed and used for turn limit checks

### ✅ Step 2: Enhanced `processAgentMessage` Function - COMPLETE
**File**: `core/agent-events.ts`

**Changes Made**:
- ✅ Always save incoming messages to memory first
- ✅ Load conversation history for context
- ✅ Increment LLM call count before LLM call
- ✅ Added pass command detection and handling
- ✅ Added auto-mention logic for agent-to-agent replies
- ✅ Added proper error handling with timeouts
- ✅ Use world's eventEmitter for all event publishing
- ✅ Pass world context to all functions that need turn limit checks

### ✅ Step 3: Added Missing Utility Functions - COMPLETE
**File**: `core/utils.ts`

**Functions Added**:
- ✅ `extractMentions` - First-mention-only logic
- ✅ `determineSenderType` - HUMAN/AGENT/WORLD classification
- ✅ `getWorldTurnLimit` - World-specific turn limit retrieval from world configuration
- ✅ `saveIncomingMessageToMemory` - Memory persistence (implemented in agent-events.ts)
- ✅ `prepareMessagesForLLM` - Message formatting
- ✅ Enhanced `shouldAgentRespond` - Takes world parameter
- ✅ Helper functions for world-aware operations

### ✅ Step 4: Updated LLM Manager Integration - COMPLETE
**File**: `core/llm-manager.ts`

**Changes Made**:
- ✅ Added conversation history support
- ✅ Added timeout handling
- ✅ Added proper error event publishing via world's eventEmitter
- ✅ Ensured LLM call count tracking matches `src`
- ✅ Pass world context for SSE event publishing
- ✅ Use world-specific event emitter for all streaming events

### ✅ Step 5: Added Missing Types and Utilities - COMPLETE
**Files**: `core/types.ts`, `core/utils.ts`

**Added**:
- ✅ Types already existed (MessageData, SenderType, ChatMessage)
- ✅ World turn limit functions that read from world configuration
- ✅ World-aware utility functions
- ✅ Turn limit configuration already in World type

### ✅ Step 6: Test and Validation - COMPLETE
**Files**: `core/test-world-eventEmitter.ts`, `core/test-behavior-alignment.ts`

**Validation Results**:
- ✅ Created comprehensive tests comparing behavior
- ✅ Validated turn limit logic matches (world-specific limits working)
- ✅ Verified mention extraction logic (first-mention-only working)
- ✅ Tested pass command handling (case-insensitive regex working)
- ✅ Validated memory persistence (auto-sync working)
- ✅ Confirmed world eventEmitter isolation
- ✅ Verified sender type detection matches src
- ✅ Tested auto-mention logic for agent-to-agent replies

## Implementation Complete ✅

**Summary**: All agent message handling logic has been successfully aligned between `src` and `core` folders. The `core` implementation now has full feature parity with `src` including:

1. **✅ World-Aware Operations**: All agents use their world's eventEmitter and turn limits
2. **✅ Enhanced Message Filtering**: First-mention-only logic prevents multiple responses
3. **✅ Turn Limit Management**: World-specific turn limits with LLM call tracking
4. **✅ Pass Command Support**: Agents can hand control back to humans
5. **✅ Auto-Mention Logic**: Agent-to-agent replies automatically include mentions
6. **✅ Memory Persistence**: All messages saved to memory with auto-sync
7. **✅ Error Handling**: Proper timeout and error handling with SSE events
8. **✅ Event Isolation**: Events properly scoped to world instances

## Next Steps

### Step 1: Enhance `shouldAgentRespond` Function
**File**: `core/agent-events.ts`

**Changes**:
- Implement full `shouldRespondToMessage` logic from `src`
- Add turn limit checking with LLM call count **using world-specific turn limits**
- Add first-mention-only logic
- Add public message handling for humans
- Add human/system message type detection
- Add turn limit reset logic
- **Ensure world context is passed and used for turn limit checks**

### Step 2: Enhance `processAgentMessage` Function
**File**: `core/agent-events.ts`

**Changes**:
- Always save incoming messages to memory first
- Load conversation history for context
- Increment LLM call count before LLM call
- Add pass command detection and handling
- Add auto-mention logic for agent-to-agent replies
- Add proper error handling with timeouts
- Add debug event publishing
- **Use world's eventEmitter for all event publishing**
- **Pass world context to all functions that need turn limit checks**

### Step 3: Add Missing Utility Functions
**File**: `core/agent-events.ts`

**Functions to add**:
- `extractMentions` - First-mention-only logic
- `determineSenderType` - HUMAN/AGENT/WORLD classification
- `getWorldTurnLimit` - World-specific turn limit retrieval **from world configuration**
- `saveIncomingMessageToMemory` - Memory persistence
- `prepareMessagesForLLM` - Message formatting
- **`shouldAgentRespond` - Enhanced version that takes world parameter**
- **Helper functions for world-aware operations**

### Step 4: Update LLM Manager Integration
**File**: `core/llm-manager.ts`

**Changes**:
- Add conversation history support
- Add timeout handling
- Add proper error event publishing **via world's eventEmitter**
- Ensure LLM call count tracking matches `src`
- **Pass world context for SSE event publishing**
- **Use world-specific event emitter for all streaming events**

### Step 5: Add Missing Types and Utilities
**Files**: `core/types.ts`, `core/utils.ts`

**Add**:
- `MessageData` interface if missing
- `SenderType` enum
- `ChatMessage` interface
- World turn limit functions **that read from world configuration**
- Debug event publishing functions **that use world's eventEmitter**
- **World-aware utility functions**
- **Turn limit configuration in World type if missing**

### Step 6: Test and Validation
**Changes**:
- Create comprehensive tests comparing behavior
- Validate turn limit logic matches
- Verify mention extraction logic
- Test pass command handling
- Validate memory persistence

## Dependencies

- `core/types.ts` - Type definitions
- `core/utils.ts` - Utility functions  
- `core/world-events.ts` - Event publishing
- `core/agent-storage.ts` - Memory persistence
- `core/llm-manager.ts` - LLM integration

## Success Criteria

1. **Identical Message Filtering**: Both folders handle @mentions identically
2. **Turn Limit Consistency**: Same turn limit logic and LLM call tracking **using world-specific limits**
3. **Memory Handling**: Same memory persistence behavior
4. **Pass Commands**: Both handle `<world>pass</world>` commands
5. **Auto-Mentions**: Same auto-mention logic for agent replies
6. **Error Handling**: Same timeout and error handling behavior
7. **Event Publishing**: Same debug and SSE event patterns **using world's eventEmitter**
8. **World Context Awareness**: Agents always use their world's configuration and events
9. **Turn Limit Source**: Turn limits come from world configuration, not global defaults

## Risk Mitigation

- Implement changes incrementally
- Test each step thoroughly
- Maintain backward compatibility
- Document all behavior changes
- Keep `src` implementation as reference

## Timeline

- **Step 1-2**: Core logic alignment (2-3 hours)
- **Step 3-4**: Utility functions and LLM integration (2 hours)
- **Step 5**: Type and utility additions (1 hour)
- **Step 6**: Testing and validation (2 hours)

**Total Estimated Time**: 7-8 hours
