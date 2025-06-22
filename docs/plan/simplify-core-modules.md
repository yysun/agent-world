# Simplify Core Modules Plan

## Overview
Review and simplify world.ts, agent.ts, and storage.ts by removing complexity, consolidating duplicate logic, and streamlining functionality without performance optimizations.

## Analysis Summary

### Current Issues
- **world.ts (600+ lines)**: Complex path management, duplicate storage logic, over-engineered world loading
- **agent.ts (300+ lines)**: Complex mention filtering, unused memory features, verbose message building  
- **storage.ts (300+ lines)**: File locking overkill, duplicate directory functions, event/message overlap

### Goals
- Reduce code complexity and line count by 30-40%
- Consolidate duplicate functionality
- Simplify path management and storage operations
- Streamline agent message processing
- Remove over-engineered features

## Implementation Steps

### Step 1: Preserve Name-Based Path Management in world.ts
- [x] Keep kebab-case directory conversion logic (required per user spec)
- [x] Maintain name-based folders: `data/worlds/{kebab-case-name}/`
- [x] Keep `getWorldDir()`, `findWorldDir()`, and `toKebabCase()` functions
- [x] Preserve world directory scanning logic for name-based lookup
- [x] Clean up redundant path validation but keep core functionality

### Step 2: Consolidate Storage Operations
- [x] Remove file locking mechanism (overkill for single-user scenario)
- [x] Merge `saveEventData()`, `saveMessage()`, `saveEvent()` into single function
- [x] Merge `loadEventData()`, `loadMessages()`, `loadEvents()` into single function
- [x] Remove separate `StorageType` enum - treat all as events
- [x] Consolidate multiple `ensureDirectory()` functions

### Step 3: Simplify World State Management
- [x] Remove dual in-memory + disk state tracking
- [x] Use direct file operations instead of complex sync logic
- [x] Remove `agentSubscriptions` Map tracking
- [x] Simplify world loading to single path (no multi-world selection)
- [x] Remove world metadata and creation timestamps

### Step 4: Streamline Agent Message Processing
- [x] Simplify mention detection to basic @name matching
- [ ] **RESTORE: Agent memory/history for LLM context** (required per user spec)
- [x] Merge `buildSystemPrompt()` and `buildUserPrompt()` into single function
- [ ] **UPDATE: buildPrompt() to use system-prompt.md file** (required per user spec)
- [x] Simplify response message publishing

### Step 5: Consolidate Event System
- [x] Remove distinction between events and messages
- [x] Use single event publishing function
- [x] Remove complex subscription filtering
- [x] Simplify to broadcast-only messaging
- [x] Remove `publishWorld()` event wrapper

### Step 6: Remove Unused Features (Preserving Required Functionality)
- [x] Remove agent memory facts system (unused)
- [x] Keep agent status tracking in storage (required for CLI /use and /stop commands)
- [x] **RESTORE: System prompt file separation** (required per user spec)
- [x] Remove world metadata and creation tracking
- [x] Remove complex agent directory scanning logic (but keep name-based lookup)

### Step 7: Code Organization Cleanup
- [x] Move all path utilities to single location
- [x] Combine similar helper functions
- [x] Remove redundant type checking and validation
- [x] Consolidate error handling patterns
- [x] Remove verbose logging and debug statements

### Step 8: Restore Required Features (Post-Simplification)
- [x] **IMPLEMENT: System prompt file separation**
  - Store agent system prompts as individual `system-prompt.md` files
  - File structure: `data/worlds/{world-name}/agents/{agent-name}/system-prompt.md`
  - Update agent creation/loading to handle system prompt files
  - Update `buildPrompt()` in agent.ts to load from system-prompt.md

- [x] **IMPLEMENT: Agent memory/history for LLM context**
  - Add memory storage and retrieval functions to world.ts
  - Include conversation history when calling LLM in agent.ts
  - Store and load recent messages for agent context
  - Maintain in-memory cache for performance
  - **SAVE: Agent memory to separate memory.json file** (required per user spec)
  - File structure: `data/worlds/{world-name}/agents/{agent-name}/memory.json`

- [x] **VERIFY: Event-driven message flow**
  - Ensure user input → MESSAGE event → agent handling → LLM → SSE → CLI flow
  - Confirm agents properly handle MESSAGE events with worldId filtering
  - Validate SSE streaming responses work correctly
  - Test CLI displays streaming responses properly

### Step 9: Implement Complete Message Processing Flow
- [x] **USER INPUT BROADCASTING**
  - Verify CLI publishes user input as MESSAGE events
  - Ensure events contain worldId for proper routing
  - Test message broadcasting to all agents in world

- [x] **AGENT EVENT HANDLING**
  - Confirm agents subscribe to MESSAGE events for their world
  - Validate message filtering by mention logic and broadcast rules
  - Test worldId-based event filtering works correctly

- [x] **LLM PROCESSING WITH CONTEXT**
  - Implement conversation history retrieval for agent context
  - Include recent messages/memory when calling LLM
  - Store conversation history per agent for context continuity
  - Test LLM receives proper context with each message

- [x] **STREAMING RESPONSE HANDLING**
  - Verify agents process SSE data from LLM correctly
  - Ensure SSE events are published with streaming content
  - Test real-time streaming response propagation

- [x] **CLI DISPLAY INTEGRATION**
  - Confirm CLI subscribes to and displays SSE events
  - Test character-by-character streaming display
  - Validate real-time response rendering in CLIorage.ts by removing complexity, consolidating duplicate logic, and streamlining functionality without performance optimizations.

## Analysis Summary

### Current Issues
- **world.ts (600+ lines)**: Complex path management, duplicate storage logic, over-engineered world loading
- **agent.ts (300+ lines)**: Complex mention filtering, unused memory features, verbose message building  
- **storage.ts (300+ lines)**: File locking overkill, duplicate directory functions, event/message overlap

### Goals
- Reduce code complexity and line count by 30-40%
- Consolidate duplicate functionality
- Simplify path management and storage operations
- Streamline agent message processing
- Remove over-engineered features

## Implementation Steps

### Step 1: Preserve Name-Based Path Management in world.ts
- [x] Keep kebab-case directory conversion logic (required per user spec)
- [x] Maintain name-based folders: `data/worlds/{kebab-case-name}/`
- [x] Keep `getWorldDir()`, `findWorldDir()`, and `toKebabCase()` functions
- [x] Preserve world directory scanning logic for name-based lookup
- [x] Clean up redundant path validation but keep core functionality

### Step 2: Consolidate Storage Operations
- [x] Remove file locking mechanism (overkill for single-user scenario)
- [x] Merge `saveEventData()`, `saveMessage()`, `saveEvent()` into single function
- [x] Merge `loadEventData()`, `loadMessages()`, `loadEvents()` into single function
- [x] Remove separate `StorageType` enum - treat all as events
- [x] Consolidate multiple `ensureDirectory()` functions

### Step 3: Simplify World State Management
- [x] Remove dual in-memory + disk state tracking
- [x] Use direct file operations instead of complex sync logic
- [x] Remove `agentSubscriptions` Map tracking
- [x] Simplify world loading to single path (no multi-world selection)
- [x] Remove world metadata and creation timestamps

### Step 4: Streamline Agent Message Processing
- [x] Simplify mention detection to basic @name matching
- [ ] **RESTORE: Agent memory/history for LLM context** (required per user spec)
- [x] Merge `buildSystemPrompt()` and `buildUserPrompt()` into single function
- [ ] **UPDATE: buildPrompt() to use system-prompt.md file** (required per user spec)
- [x] Simplify response message publishing

### Step 5: Consolidate Event System
- [x] Remove distinction between events and messages
- [x] Use single event publishing function
- [x] Remove complex subscription filtering
- [x] Simplify to broadcast-only messaging
- [x] Remove `publishWorld()` event wrapper

### Step 6: Remove Unused Features (Preserving Required Functionality)
- [x] Remove agent memory facts system (unused)
- [x] Keep agent status tracking in storage (required for CLI /use and /stop commands)
- [ ] **RESTORE: System prompt file separation** (required per user spec)
- [x] Remove world metadata and creation tracking
- [x] Remove complex agent directory scanning logic (but keep name-based lookup)

### Step 7: Code Organization Cleanup
- [x] Move all path utilities to single location
- [x] Combine similar helper functions
- [x] Remove redundant type checking and validation
- [x] Consolidate error handling patterns
- [x] Remove verbose logging and debug statements

### Step 8: Restore Required Features (Post-Simplification)
- [x] **IMPLEMENT: System prompt file separation**
  - Store agent system prompts as individual `system-prompt.md` files
  - File structure: `data/worlds/{world-name}/agents/{agent-name}/system-prompt.md`
  - Update agent creation/loading to handle system prompt files
  - Update `buildPrompt()` in agent.ts to load from system-prompt.md

- [ ] **IMPLEMENT: Agent memory/history for LLM context**
  - Add memory storage and retrieval functions to world.ts
  - Include conversation history when calling LLM in agent.ts
  - Store and load recent messages for agent context
  - Maintain in-memory cache for performance

- [ ] **VERIFY: Event-driven message flow**
  - Ensure user input → MESSAGE event → agent handling → LLM → SSE → CLI flow
  - Confirm agents properly handle MESSAGE events with worldId filtering
  - Validate SSE streaming responses work correctly
  - Test CLI displays streaming responses properly

## Expected Outcomes

### Reduced Complexity
- **world.ts**: ~450 lines (from 600+) - Keep name-based paths, remove dual state management
- **agent.ts**: ~200 lines (from 300+) - Simplify message processing, remove unused memory
- **storage.ts**: ~200 lines (from 300+) - Remove file locking, consolidate operations

### Consolidated Functions
- Streamlined path management functions (keep core kebab-case logic)
- Single storage save/load function instead of 6+ variants  
- Single event publishing function instead of multiple wrappers
- Single directory creation function instead of multiple versions
- Preserved agent status tracking for CLI integration

### Simplified Architecture
- Direct file operations instead of in-memory + disk sync
- Name-based (kebab-case) paths for human-readable folder structure
- Basic @mention detection instead of complex parsing
- Broadcast messaging instead of targeted subscriptions
- Preserved agent status tracking for CLI functionality

## Validation Steps
- [x] Run existing tests to ensure functionality preserved
- [ ] Test world creation and agent management
- [ ] Verify message processing still works
- [ ] Confirm file storage operations work correctly
- [ ] Check CLI integration remains functional
- [x] **VALIDATE: System prompt files are created and loaded correctly**
- [x] **VALIDATE: Agent memory/history is maintained and used by LLM**
- [x] **VALIDATE: Agent memory files (memory.json) are created and loaded correctly**
- [x] **VALIDATE: Event-driven message flow works end-to-end**
- [x] **VALIDATE: User input → MESSAGE event broadcasting**
- [x] **VALIDATE: Agent MESSAGE event subscription and filtering**
- [x] **VALIDATE: LLM processing with conversation history/context**
- [x] **VALIDATE: SSE streaming response handling**
- [x] **VALIDATE: CLI real-time streaming display**

## Dependencies
- No external dependencies added/removed
- Maintains compatibility with existing type definitions
- Preserves public API surface for CLI and tests
- No breaking changes to core functionality

### Implementation Priorities for Message Processing Flow

#### Priority 1: Agent Memory/History System
- Add conversation history storage per agent
- Implement memory retrieval for LLM context
- Test memory persistence across agent restarts
- **IMPLEMENT: Memory file separation** - Save memory to separate memory.json files

#### Priority 2: Event Flow Validation
- Trace complete message flow: CLI → MESSAGE → Agent → LLM → SSE → CLI
- Verify worldId filtering at each stage
- Test mention-based message targeting

#### Priority 3: Streaming Integration
- Confirm SSE events propagate correctly from LLM
- Validate CLI streaming display functionality
- Test real-time character-by-character output

#### Priority 4: End-to-End Testing
- Test complete user interaction scenarios
- Validate context preservation across message exchanges
- Confirm agent responses include proper conversation history
