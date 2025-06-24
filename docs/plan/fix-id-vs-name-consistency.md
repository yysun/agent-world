# Fix ID vs Name Consistency Implementation Plan

## Problem Analysis
The codebase currently has inconsistent usage of agent IDs vs agent names for:
1. Agent lookup and access functions
2. World directory structure (uses kebab-case names)
3. Agent directory structure (uses kebab-case names) 
4. Function parameters that sometimes expect ID, sometimes name
5. Memory and system prompt file access

## Current Issues Identified
- `addToAgentMemory()` uses name-based logic but parameter suggests ID
- `getAgentConversationHistory()` has mixed ID/name logic
- `clearAgentMemory()` has mixed ID/name logic
- Directory structure uses kebab-case names, not IDs
- Agent lookup functions mix ID and name approaches

## Implementation Steps

### Step 1: Analyze Current Function Signatures and Usage
- [x] Review all world.ts functions that take agent identifiers
- [x] Review all CLI commands that reference agents
- [x] Review all test files for agent access patterns
- [x] Document current behavior vs intended behavior

### Step 2: Define Consistent Strategy
- [x] Decide on primary identifier strategy:
  - Option A: Use IDs as primary, names as secondary lookup
  - Option B: Use names as primary, IDs as internal only
  - **Option C: Support both with clear function naming** ✅ SELECTED
- [x] Define directory structure strategy (ID-based vs name-based)
- [x] Define function naming conventions

### Step 3: Update Core World Functions
- [x] Fix `addToAgentMemory()` - make ID vs name handling consistent
- [x] Fix `getAgentConversationHistory()` - standardize lookup logic
- [x] Fix `clearAgentMemory()` - standardize lookup logic
- [x] Update `getAgent()` vs `getAgentByName()` distinction
- [x] Update agent creation/removal logic for consistency

### Step 4: Update Directory Structure Logic
- [x] Decide: Keep name-based directories or switch to ID-based ✅ KEPT NAME-BASED
- [x] Update `getAgentPath()` function accordingly
- [x] Update agent loading logic in `loadWorldFromDisk()`
- [x] Update agent saving logic in `saveAgentToDisk()`

### Step 5: Update Helper Functions
- [x] Create `findAgentByIdOrName()` helper if needed ✅ IMPLEMENTED AS `findAgent()`
- [x] Update `subscribeAgentToMessages()` logic
- [x] Update `unsubscribeAgentFromMessages()` logic
- [x] Ensure all agent lookups are consistent

### Step 6: Update CLI Commands
- [x] Review `cli/commands/add.ts` - agent creation
- [x] Review `cli/commands/list.ts` - agent listing
- [x] Review `cli/commands/show.ts` - agent display ✅ UPDATED
- [x] Review `cli/commands/use.ts` - agent selection
- [x] Review `cli/commands/clear.ts` - memory clearing
- [x] Update any agent reference logic

### Step 7: Update Unit Tests
- [x] Fix `tests/agent.test.ts` ✅ PASSING
- [x] Fix `tests/agent-lifecycle.test.ts` ✅ PASSING
- [x] Fix `tests/agent-message-process.test.ts` ✅ PASSING
- [x] Fix `tests/clear-memory.test.ts` ✅ PASSING
- [x] Fix `tests/world.test.ts` ✅ PASSING
- [x] Update any test utilities or helpers

### Step 8: Update Type Definitions
- [x] Review `src/types.ts` for any ID/name related types ✅ NO CHANGES NEEDED
- [x] Add clear documentation for function parameters
- [x] Ensure type safety for ID vs name usage

### Step 9: Documentation Updates
- [x] Update function comments in world.ts ✅ COMPLETED
- [x] Update README.md if needed ✅ NO CHANGES NEEDED
- [x] Update any API documentation

### Step 10: Integration Testing
- [x] Run full test suite ✅ ALL 131 TESTS PASSING
- [x] Test CLI functionality end-to-end
- [x] Verify world loading/saving works correctly
- [x] Verify agent memory operations work correctly

## Implementation Complete ✅

**Status**: All implementation steps completed successfully

### Summary of Changes Implemented:

#### Core Function Updates:
- ✅ Added `getAgent()`, `getAgentByName()`, and `findAgent()` helper functions
- ✅ Updated `addToAgentMemory()` to use `findAgent()` for consistent lookup
- ✅ Updated `getAgentConversationHistory()` to use `findAgent()` for consistent lookup  
- ✅ Updated `clearAgentMemory()` to use `findAgent()` for consistent lookup
- ✅ Fixed `getAgentPath()` function to use agent name instead of ID

#### UI/CLI Updates:
- ✅ Removed agent ID display from CLI `add` command output
- ✅ Removed agent ID display from CLI `use` command output
- ✅ Updated CLI `show` command to use `findAgent()` lookup
- ✅ Updated CLI `use` command to use name-only lookup instead of ID lookup
- ✅ Updated TUI agent listings to not display IDs
- ✅ Updated TUI interfaces to not require agent ID field

#### Strategy Implemented:
- **Function Naming Convention**: 
  - `getAgent(worldId, agentId)` - lookup by ID only
  - `getAgentByName(worldId, agentName)` - lookup by name only  
  - `findAgent(worldId, idOrName)` - smart lookup helper
- **Directory Strategy**: Kept name-based directories (kebab-case names)
- **UI Strategy**: Hide IDs from user, use names for all interactions

#### Test Results:
- ✅ All 131 tests passing
- ✅ No breaking changes to functionality
- ✅ Clean user interface without technical IDs

#### Git Commit:
- ✅ Changes committed with comprehensive commit message
- ✅ All files updated and documented
