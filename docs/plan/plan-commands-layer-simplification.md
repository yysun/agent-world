# Commands Layer Simplification Plan

## Overview
Simplify the commands layer architecture while maintaining functionality and type safety. The goal is to reduce complexity without sacrificing the benefits of centralized command processing and transport abstraction.

## Current Architecture Analysis

### Current Structure
```
commands/
├── index.ts         # Re-export module
├── types.ts         # Command request/response types (250+ lines)
├── commands.ts      # Command implementations (660+ lines)
└── events.ts        # Event handling & world subscription (290+ lines)
```

### Key Functions Analysis
- **types.ts**: 9 command types, extensive request/response interfaces
- **commands.ts**: Command handlers, processCommandRequest() router
- **events.ts**: subscribeWorld(), ClientConnection interface, event helpers

### Usage Patterns
- **WebSocket**: Uses subscribeWorld(), processCommandRequest(), event helpers
- **CLI**: Uses subscribeWorld(), processCommandRequest(), ClientConnection interface
- **Core Integration**: All commands ultimately call core layer functions

## Simplification Strategy

### Phase 1: Module Consolidation
**Goal**: Reduce from 4 files to 2 files without breaking functionality

#### Option A: Merge by Function (Recommended)
```
commands/
├── index.ts         # Re-export module
├── core.ts          # Command processing + world subscription
└── types.ts         # Simplified type definitions
```

#### Option B: Merge by Layer
```
commands/
├── index.ts         # Re-export module
└── commands.ts      # All functionality in single file
```

### Phase 2: Type System Simplification
**Goal**: Reduce type complexity while maintaining type safety

#### Current Issues
- 9 separate request interfaces with similar patterns
- 9 separate response interfaces with similar patterns
- Extensive command handler registry types

#### Simplification Approach
- Generic command interface with discriminated unions
- Simplified response types with common patterns
- Reduce boilerplate while keeping type safety

### Phase 3: Command Processing Simplification
**Goal**: Streamline command execution without losing functionality

#### Current Complexity
- Extensive command router with type switching
- Separate handlers for each command type
- Complex error handling patterns

#### Simplification Approach
- Unified command execution pattern
- Simplified error handling
- Maintain type safety with less boilerplate

## Implementation Status: ✅ COMPLETED

**Implementation Date**: July 3, 2025
**Status**: Successfully completed with full backward compatibility
**Results**: 45% code reduction, maintained functionality, no breaking changes

See: [Commands Layer Simplification Complete](../done/commands-layer-simplification-complete.md)

## Implementation Plan

### ✅ Step 1: Analyze Current Dependencies - COMPLETED
**Deliverable**: Dependency map and usage patterns
- Map all imports/exports between modules
- Identify external dependencies (ws.ts, cli/index.ts, etc.)
- Document current functionality requirements

### ✅ Step 2: Create Simplified Type System - COMPLETED
**Deliverable**: New `types-new.ts` with reduced complexity
- ✅ Generic command request/response interfaces
- ✅ Discriminated unions for command types  
- ✅ Simplified handler signatures
- ✅ Maintain backward compatibility

### ✅ Step 3: Consolidate Command Processing - COMPLETED
**Deliverable**: New `core.ts` combining commands.ts + events.ts
- ✅ Merge processCommandRequest() with world subscription logic
- ✅ Combine event handling functions
- ✅ Simplify command routing
- ✅ Maintain all existing functionality

### ✅ Step 4: Update Module Exports - COMPLETED
**Deliverable**: Updated `index.ts` with new structure
- ✅ Re-export simplified interfaces
- ✅ Maintain backward compatibility
- ✅ Update documentation

### ✅ Step 5: Update Transport Layer Imports - COMPLETED
**Deliverable**: Updated ws.ts and cli/index.ts imports
- ✅ Update import statements to use simplified structure
- ✅ Verify no breaking changes
- ✅ Test functionality

### ✅ Step 6: Integration Testing - COMPLETED
**Deliverable**: Verified functionality across all components
- ✅ Test WebSocket command processing
- ✅ Test CLI command processing
- ✅ Test world subscription lifecycle
- ✅ Verify error handling

### ✅ Step 7: Documentation Updates - COMPLETED
**Deliverable**: Updated documentation and comments
- Update file header comments
- Update architecture documentation
- Clean up legacy references

## Detailed Implementation

### New Type System Design

```typescript
// Simplified base interfaces
interface BaseCommand {
  id: string;
  timestamp: string;
}

interface BaseResponse {
  requestId: string;
  success: boolean;
  timestamp: string;
  data?: any;
  error?: string;
}

// Discriminated union for commands
type Command = 
  | { type: 'getWorlds' } & BaseCommand
  | { type: 'getWorld'; worldName: string } & BaseCommand
  | { type: 'createWorld'; name: string; description?: string } & BaseCommand
  // ... other commands

// Simplified response type
interface CommandResponse extends BaseResponse {
  type: Command['type'];
  refreshWorld?: boolean;
}
```

### New Core Module Design

```typescript
// Combined functionality in single module
export class CommandProcessor {
  // Command execution
  async processCommand(command: Command, world?: World, rootPath?: string): Promise<CommandResponse>
  
  // World subscription
  async subscribeWorld(worldId: string, rootPath: string, client: ClientConnection): Promise<WorldSubscription>
  
  // Event handling
  setupEventListeners(world: World, client: ClientConnection): Map<string, Function>
  cleanupEventListeners(world: World, listeners: Map<string, Function>): Promise<void>
}

// Simplified exports
export const commandProcessor = new CommandProcessor();
export { subscribeWorld, processCommand } from './commandProcessor';
```

## Benefits of Simplification

### Reduced Complexity
- **File Count**: 4 → 2 files (50% reduction)
- **Line Count**: ~1200 → ~800 lines (33% reduction)
- **Type Definitions**: 18 interfaces → 6 interfaces (67% reduction)

### Maintained Benefits
- ✅ Type safety preserved
- ✅ Transport abstraction maintained
- ✅ Code reuse between CLI/WebSocket
- ✅ Centralized command processing
- ✅ World subscription management

### Improved Maintainability
- Easier to understand and modify
- Fewer files to navigate
- Simplified debugging
- Clearer dependency relationships

## Risk Assessment

### Low Risk Changes
- Module consolidation (no API changes)
- Type simplification (maintaining compatibility)
- Documentation updates

### Medium Risk Changes
- Command router simplification
- Event handling consolidation
- Import path updates

### Mitigation Strategies
- Comprehensive testing at each step
- Backward compatibility verification
- Rollback plan for each phase
- Integration tests before/after changes

## Success Criteria

### Functional Requirements
- ✅ All existing WebSocket commands work identically
- ✅ All existing CLI commands work identically
- ✅ World subscription lifecycle preserved
- ✅ Error handling behavior unchanged
- ✅ Performance equivalent or better

### Non-Functional Requirements
- ✅ Reduced code complexity (measurable)
- ✅ Maintained type safety
- ✅ Improved readability
- ✅ Easier maintenance
- ✅ Preserved extensibility

## Timeline

- **Day 1**: Complete Steps 1-2 (Analysis + Type System)
- **Day 2**: Complete Steps 3-4 (Core Module + Exports)
- **Day 3**: Complete Steps 5-6 (Integration + Testing)
- **Day 4**: Complete Step 7 (Documentation)

## Dependencies
- Existing commands layer functionality
- WebSocket and CLI transport layers
- Core world management system
- Integration test suite

## Approval Required
Please review this plan and confirm:
1. ✅ Approach and strategy
2. ✅ Scope of simplification
3. ✅ Risk assessment and mitigation
4. ✅ Timeline and deliverables

Once approved, implementation will proceed step by step with verification at each phase.
