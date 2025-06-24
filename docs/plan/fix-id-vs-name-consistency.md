# Complete Removal of ID-Based Access Implementation Plan

## Problem Analysis
The goal is to completely remove all ID-based access for worlds and agents, simplifying the codebase to use only name-based access. This will:
1. Eliminate the complex dual ID/name system
2. Simplify all function signatures and remove ambiguity
3. Make the system more user-friendly (names are human-readable)
4. Reduce code complexity and maintenance burden
5. Align with the kebab-case directory structure already in use

## Current Areas Requiring Changes
1. **Core World Functions**: All functions that currently accept `worldId` or `agentId` parameters
2. **CLI Interface**: All CLI commands and UI components that reference IDs
3. **Event System**: SSE events and message routing that use agent IDs
4. **Unit Tests**: All test files that use ID-based lookups
5. **Type Definitions**: Remove ID fields from interfaces where appropriate
6. **File Storage**: Ensure all file operations use names consistently

## Implementation Steps (RESET)

### Step 1: Update Type Definitions
- [x] Remove `id` field from `AgentConfig` interface
- [x] Remove `id` field from `Agent` interface  
- [x] Remove `id` field from `WorldState` interface
- [x] Update `SSEEventPayload` to use agent names instead of IDs
- [x] Update `MessageData` to use agent names instead of IDs
- [x] Remove any ID-related helper types

### Step 2: Update World Core Functions  
- [x] Replace `createWorld(options)` to use `name` as primary identifier
- [x] Replace `deleteWorld(worldId)` with `deleteWorld(worldName)`
- [x] Replace `getWorldInfo(worldId)` with `getWorldInfo(worldName)`
- [x] Replace `loadWorld(worldId)` with `loadWorld(worldName)`
- [x] Replace `saveWorld(worldId)` with `saveWorld(worldName)`
- [x] Update `listWorlds()` to return world names instead of IDs
- [x] Update `subscribeToWorldEvents(worldId, callback)` to use world names
- [x] Update internal directory structure to use world names for folder paths

### Step 3: Update Agent Core Functions
- [x] Replace `createAgent(worldId, config)` with `createAgent(worldName, config)`
- [x] Replace `removeAgent(worldId, agentId)` with `removeAgent(worldName, agentName)`
- [x] Replace `updateAgent(worldId, agentId, updates)` with `updateAgent(worldName, agentName, updates)`
- [x] Replace `getAgent(worldId, agentId)` with `getAgent(worldName, agentName)`
- [x] Replace `getAgents(worldId)` with `getAgents(worldName)`
- [x] Remove `getAgentByName()` and `findAgent()` helper functions (no longer needed)
- [x] Update `broadcastMessage(worldId, message, sender)` to use world names
- [x] Update `sendMessage(worldId, targetId, message, sender)` to use names

### Step 4: Update Memory and Storage Functions
- [x] Replace `addToAgentMemory(worldId, agentIdOrName, message)` with `addToAgentMemory(worldName, agentName, message)`
- [x] Replace `getAgentConversationHistory(worldId, agentIdOrName, limit)` with `getAgentConversationHistory(worldName, agentName, limit)`
- [x] Replace `clearAgentMemory(worldId, agentIdOrName)` with `clearAgentMemory(worldName, agentName)`
- [x] Update all internal storage path functions to use names consistently
- [x] Update `saveAgentToDisk()` and `loadAgentFromDisk()` functions
- [x] Update `loadWorldFromDisk()` and `saveWorldToDisk()` functions

### Step 5: Update Event System
- [x] Update `subscribeAgentToMessages()` to use agent names
- [x] Update `unsubscribeAgentFromMessages()` to use agent names  
- [x] Update `subscribeToAgentMessages(worldId, agentId, callback)` to use names
- [x] Update SSE event publishing to use agent names
- [x] Update message event routing to use names for filtering
- [x] Update event payloads to use names instead of IDs

### Step 6: Update CLI Commands  
- [ ] Update `add.ts` command to not generate or display IDs
- [ ] Update `list.ts` command to not display IDs 
- [ ] Update `show.ts` command to use agent names for lookup
- [ ] Update `use.ts` command to use agent names for lookup
- [ ] Update `clear.ts` command to use agent names for lookup
- [ ] Update `stop.ts` command to use agent names for lookup

### Step 7: Update CLI Main Files
- [ ] Update `index.ts` to use world names instead of world IDs
- [ ] Update `index-tui.ts` to use world names instead of world IDs
- [ ] Update streaming manager to use agent names instead of IDs
- [ ] Update agent loading and display logic to use names
- [ ] Update command routing to pass world names instead of IDs
- [ ] Update SSE event handling to use agent names

### Step 8: Update Unit Tests
- [ ] Update `world.test.ts` to use name-based function calls
- [ ] Update `agent.test.ts` to use name-based function calls
- [ ] Update `agent-lifecycle.test.ts` to use name-based function calls  
- [ ] Update `agent-message-process.test.ts` to use name-based function calls
- [ ] Update `clear-memory.test.ts` to use name-based function calls
- [ ] Update `event-bus.test.ts` to use name-based identifiers
- [ ] Update `storage-initialization.test.ts` to use name-based paths
- [ ] Remove all ID-based test assertions and expectations

### Step 9: Update Documentation
- [ ] Update all function comments to reflect name-based parameters
- [ ] Update README.md examples to use names instead of IDs
- [ ] Update API documentation to show name-based usage
- [ ] Update inline code comments and JSDoc comments
- [ ] Update error messages to reference names instead of IDs

### Step 10: Integration Testing and Validation
- [ ] Run full test suite to ensure no broken functionality
- [ ] Test CLI functionality end-to-end with name-based access
- [ ] Verify world loading/saving works with name-based directories
- [ ] Verify agent memory operations work with name-based access
- [ ] Test concurrent operations with name-based lookups
- [ ] Validate that no ID-based code remains in the codebase

## Key Design Decisions

### World Identification Strategy
- **Primary Identifier**: World name (human-readable)
- **Directory Structure**: Use kebab-case world names for folders
- **Function Signatures**: All functions accept `worldName: string` parameter
- **No Backward Compatibility**: Complete removal of `worldId` parameters

### Agent Identification Strategy  
- **Primary Identifier**: Agent name (human-readable)
- **Directory Structure**: Use kebab-case agent names for folders (already implemented)
- **Function Signatures**: All functions accept `agentName: string` parameter
- **No Backward Compatibility**: Complete removal of `agentId` parameters

### Event System Changes
- **SSE Events**: Use agent names in event payloads
- **Message Routing**: Filter by agent names instead of IDs
- **Subscriptions**: Key subscriptions by world name + agent name

### Benefits of This Approach
1. **Simplified API**: Single identifier type eliminates complexity
2. **User-Friendly**: Names are human-readable and memorable
3. **Consistent**: Aligns with existing kebab-case directory structure
4. **Maintainable**: Less code to maintain and test
5. **Clear Intent**: Function signatures clearly indicate expected parameters

## Status: Ready for Implementation ⏳

This plan represents a complete architectural change to eliminate ID-based access throughout the entire codebase. The implementation should be done systematically, testing each step to ensure functionality is preserved while transitioning to the simplified name-based approach.

**Important**: This is a breaking change that will require updating all existing code that relies on ID-based access. The implementation should be done in a single comprehensive update to avoid inconsistent states.
