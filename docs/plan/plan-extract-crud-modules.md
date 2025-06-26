# Extract World and Agent CRUD Functions into Modules - Implementation Plan

## Overview
Extract world and agent CRUD functions from the monolithic `world.ts` file into separate, focused modules to improve code organization and maintainability.

## Current Structure Analysis
The `world.ts` file currently contains:
- World CRUD operations
- Agent CRUD operations  
- Memory management functions
- Event system integration
- Message broadcasting
- Internal subscription management

## Proposed Module Structure

### 1. `src/world-manager.ts` - World CRUD Operations
Extract all world-level CRUD functions:
- `createWorld(options: WorldOptions): Promise<string>`
- `deleteWorld(worldName: string): Promise<boolean>`
- `getWorldInfo(worldName: string): WorldInfo | null`
- `listWorlds(): string[]`
- `saveWorld(worldName: string): Promise<boolean>`
- `loadWorld(worldName: string): Promise<void>`
- `loadWorldFromDisk(worldName: string): Promise<void>`
- Internal: `saveWorldToDisk(worldName: string): Promise<void>`

### 2. `src/agent-manager.ts` - Agent CRUD Operations
Extract all agent-level CRUD functions:
- `createAgent(worldName: string, config: AgentConfig): Promise<Agent | null>`
- `removeAgent(worldName: string, agentName: string): Promise<boolean>`
- `updateAgent(worldName: string, agentName: string, updates: Partial<Agent>): Promise<Agent | null>`
- `getAgent(worldName: string, agentName: string): Agent | null`
- `getAgents(worldName: string): Agent[]`

### 3. `src/agent-memory.ts` - Agent Memory Management
Extract memory-related functions:
- `addToAgentMemory(worldName: string, agentName: string, message: ChatMessage): Promise<void>`
- `getAgentConversationHistory(worldName: string, agentName: string, limit?: number): Promise<ChatMessage[]>`
- `clearAgentMemory(worldName: string, agentName: string): Promise<boolean>`

### 4. Updated `src/world.ts` - Integration Layer
Keep high-level integration functions:
- Initialization functions (`ensureDefaultWorld`, `loadWorlds`, etc.)
- Event system integration (`broadcastMessage`, `sendMessage`)
- Agent subscription management (internal functions)
- Re-export all CRUD functions for backward compatibility

## Implementation Steps

### Step 1: Create World Manager Module
- [ ] Create `src/world-manager.ts`
- [ ] Extract world CRUD functions with proper imports
- [ ] Add file comment block describing world management features
- [ ] Update imports from persistence module
- [ ] Handle shared state (worlds Map) access

### Step 2: Create Agent Manager Module  
- [ ] Create `src/agent-manager.ts`
- [ ] Extract agent CRUD functions with proper imports
- [ ] Add file comment block describing agent management features
- [ ] Handle world state access and agent subscription management
- [ ] Update persistence function calls

### Step 3: Create Agent Memory Module
- [ ] Create `src/agent-memory.ts` 
- [ ] Extract memory management functions
- [ ] Add file comment block describing memory management features
- [ ] Handle agent lookup and persistence operations

### Step 4: Update Main World Module
- [ ] Remove extracted functions from `src/world.ts`
- [ ] Import and re-export functions for backward compatibility
- [ ] Update file comment block to reflect new responsibilities
- [ ] Keep event system integration and subscription management
- [ ] Update imports in world.ts

### Step 5: Update Imports Across Codebase
- [ ] Update `server.ts` imports
- [ ] Update CLI command imports (`cli/commands/*.ts`)
- [ ] Update test imports (`tests/*.test.ts`)
- [ ] Verify all import paths are correct

### Step 6: Test and Validate
- [ ] Run all tests to ensure functionality preserved
- [ ] Test CLI commands work correctly
- [ ] Test web server endpoints work correctly
- [ ] Verify no breaking changes in public API

## Shared State Management
The modules will need access to the shared `worlds` Map. Options:
1. **Shared State Module**: Create `src/world-state.ts` to export the worlds Map
2. **Dependency Injection**: Pass world state as parameter to functions
3. **Module Re-exports**: Keep state in main world.ts and import from modules

**Chosen Approach**: Option 1 - Create shared state module for clean separation.

## Backward Compatibility
All existing imports should continue to work:
```typescript
// These should still work after refactoring
import { createWorld, createAgent, getAgents } from './src/world';
```

## Benefits
- **Separation of Concerns**: Each module has a single responsibility
- **Easier Testing**: Smaller, focused modules are easier to test
- **Better Maintainability**: Changes to one area don't affect others
- **Cleaner Code Structure**: Logical grouping of related functions
- **Function-based Architecture**: Maintains current architectural approach

## Notes
- Maintain function-based approach (no classes)
- Preserve all existing function signatures
- Keep comprehensive error handling
- Update file comment blocks in all new modules
- All modules should export individual functions, not default exports
