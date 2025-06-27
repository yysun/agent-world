# Implementation Plan: Per-World Event Bus Architecture

## Overview
Transform the current global event bus architecture into per-world isolated event buses.

## Steps

### 1. Create World Event Bus Manager
- [x] Create `src/world-event-bus.ts` module
- [x] Implement `WorldEventBusManager` class to manage event buses per world
- [x] Add methods: `createEventBus(worldName)`, `getEventBus(worldName)`, `destroyEventBus(worldName)`
- [x] Store event bus instances in Map<worldName, EventBusProvider>

### 2. Update Event Bus Module
- [x] Modify `src/event-bus.ts` to support world-scoped operations
- [x] Add world parameter to key functions: `publishMessageEvent`, `subscribeToMessages`, etc.
- [x] Maintain backward compatibility with optional world parameters
- [x] Update internal functions to route to correct world event bus

### 3. Update World State Management
- [x] Modify `src/world-state.ts` to track per-world event buses
- [x] Update agent subscription logic to use world-specific event bus
- [x] Clean up event bus when world is deleted

### 4. Update World Manager
- [x] Modify `src/world-manager.ts` to create event bus when world is created
- [x] Update `deleteWorld` to properly clean up event bus resources
- [x] Remove global event bus initialization calls

### 5. Update World Integration Layer
- [x] Modify `src/world.ts` to use world-specific event buses
- [x] Update `broadcastMessage`, `sendMessage` to target specific world
- [x] Update subscription methods to work with world context
- [x] Remove global event bus initialization

### 6. Update Types and Interfaces
- [x] Add world context to relevant type definitions
- [x] Update event filter interfaces if needed
- [x] Ensure type safety across world boundaries

### 7. Testing and Validation
- [x] Update existing tests to work with per-world event buses
- [x] Add tests for event isolation between worlds
- [x] Verify no cross-world event leakage
- [x] Test proper cleanup when worlds are deleted

## Dependencies
- Step 1 must be completed before any other steps
- Steps 2-5 can be done in parallel after step 1
- Step 6 can be done alongside steps 2-5
- Step 7 must be done last

## Risk Mitigation
- Maintain backward compatibility where possible
- Implement defensive coding for missing world contexts
- Add proper error handling for invalid world references

## Status: COMPLETED ✅

All steps have been successfully implemented and tested. The system now provides complete event isolation between worlds with:

- ✅ Per-world event bus instances managed by WorldEventBusManager
- ✅ World-scoped event publishing and subscription
- ✅ Automatic event bus lifecycle management (create/destroy with worlds)
- ✅ Complete event isolation preventing cross-world pollution
- ✅ Backward compatibility for existing code
- ✅ Comprehensive test coverage including isolation verification
- ✅ All existing tests continue to pass

## Test Results
- ✅ World tests: 48/48 passed
- ✅ Event bus tests: 15/15 passed  
- ✅ Per-world isolation tests: 5/5 passed
- ✅ Turn limit tests: 5/5 passed (non-skipped)

The implementation successfully achieves complete event bus isolation between worlds while maintaining full backward compatibility and system functionality.
