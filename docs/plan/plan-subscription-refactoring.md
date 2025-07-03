# Subscription Architecture Refactoring Implementation Plan

## Overview
Refactor the subscription architecture to eliminate redundant world loading, clarify separation between lightweight world configs and full runtime worlds, and streamline the subscription pattern across CLI and WebSocket clients.

## Current Issues
- `getWorld()` loads full world with agents and events (heavy operation)
- CLI/WS call `getWorld()` then `subscribeWorld()` (redundant loading)
- Web client gets heavy world objects when it only needs basic data
- Unsubscribe doesn't use the world object from subscribe
- Mixed concerns between world config and runtime state

## Target Architecture
- `getWorld()` → Returns lightweight world config only (no agents, no events)
- `subscribeWorld()` → Returns full world object with agents and events setup
- CLI and WS use world object from `subscribeWorld()` for all operations
- Web client gets world with agents from subscription response, events managed by WebSocket
- Single subscription call provides all needed data, eliminates getWorld/subscribe dual calls

## Implementation Plan

### Phase 1: Core Subscription Layer Changes
- [x] **Update getWorld in world-manager.ts to return lightweight config only**
  - Removed agent loading from getWorld
  - Removed EventEmitter setup from getWorld
  - Return only world configuration data
  - Updated function documentation

- [x] **Create getWorldConfig function for explicit lightweight access**
  - getWorldConfig() already existed and returns just config.json data
  - Updated getWorld() to be lightweight and marked as deprecated
  - Updated internal calls to use getFullWorld for subscription layer

- [x] **Update subscribeWorld to handle full world loading**
  - Updated subscribeWorld to use getFullWorld for complete world setup
  - Ensured subscribeWorld loads full world with agents
  - Ensured subscribeWorld sets up EventEmitter
  - Updated return type to include full world object

- [x] **Update WorldSubscription interface**
  - Interface already contained full runtime world
  - Unsubscribe uses the world object from subscription
  - Refresh properly reloads and reconnects events

### Phase 2: CLI Layer Updates
- [x] **Remove dual getWorld/subscribe pattern from CLI**
  - CLI already uses only subscribeWorld() in interactive mode
  - Pipeline mode still uses getWorld for command validation (acceptable for different use case)
  - Interactive mode uses world object from subscription for all operations

- [x] **Update CLI world management**
  - CLI already stores world object from subscription
  - Uses stored world object for commands and operations
  - Unsubscribe already uses subscription.unsubscribe()

- [x] **Update CLI error handling**
  - CLI already handles subscription failures properly
  - Provides clear error messages for world loading failures
  - Ensures proper cleanup on subscription errors

### Phase 3: WebSocket Server Updates
- [x] **Update WebSocket subscription handlers**
  - WebSocket server already uses only subscribeWorld()
  - Removed unused getWorld import from server
  - Stores full subscription object for each client

- [x] **Update client world mapping**
  - WebSocket server already stores WorldSubscription objects in ws.subscription
  - Uses world object from subscription for all operations
  - Unsubscribe already uses subscription.unsubscribe()

- [x] **Update WebSocket command processing**
  - Updated to use world object from stored subscription
  - Removed redundant world loading in command handlers
  - Ensured consistent world state across all operations

### Phase 4: Web Client API Updates
- [x] **Update getWorlds to return lightweight data**
  - Updated listWorlds to count agents properly but return lightweight WorldInfo
  - Includes basic world info: id, name, description, agentCount
  - Removed full agent objects from world list response

- [x] **Update subscribeToWorld to return world with agents**
  - Updated WebSocket server to return full world object with agents in subscription response
  - Updated web client ws-api.js to extract and return world data from subscription
  - Eliminated need for separate getAgents call from web client

- [x] **Remove redundant getAgents calls**
  - Updated select-world.js to use agents from subscription response
  - Updated init-state.js to use agents from subscription result
  - Simplified data flow by leveraging already-loaded agent data

### Phase 5: Web Client Frontend Updates
- [x] **Update world selection to use lightweight data**
  - Updated world tabs to work with lightweight world data from getWorlds
  - Keep agent counting logic but use data from subscription response
  - Ensured UI performance with optimized data flow

- [x] **Update init-state.js subscription pattern**
  - Updated to use agents data from subscribeToWorld response
  - Removed redundant logic for combining world.agents with subscription result
  - Let WebSocket manage events and provide complete world data

- [x] **Update select-world.js for new pattern**
  - Updated to use agents from subscribeToWorld response instead of separate call
  - Removed getAgents call since agents come with subscription
  - Maintained UI responsiveness with single subscription call

### Phase 6: Testing and Validation
- [ ] **Update unit tests for core changes**
  - Test getWorld returns lightweight config only
  - Test subscribeWorld returns full world with agents
  - Test subscription lifecycle management

- [ ] **Update integration tests**
  - Test CLI subscription pattern works correctly
  - Test WebSocket subscription pattern works correctly
  - Test web client gets appropriate data

- [ ] **Performance testing**
  - Verify web client loads faster with lightweight data
  - Verify CLI/WS performance maintained or improved
  - Test memory usage with new subscription pattern

### Phase 7: Documentation and Cleanup
- [ ] **Update API documentation**
  - Document new getWorld behavior (lightweight)
  - Document subscribeWorld as primary subscription method
  - Update examples for CLI and WebSocket usage

- [ ] **Update architecture documentation**
  - Document separation between config and runtime world objects
  - Update sequence diagrams for new subscription flow
  - Document performance benefits and use cases

- [ ] **Clean up deprecated patterns**
  - Remove or deprecate old getWorld/subscribe dual calls
  - Update all examples and documentation
  - Add migration guide for external users

## Success Criteria
- CLI uses only subscribeWorld() for world access
- WebSocket uses only subscribeWorld() for world access  
- Web client gets world with agents from single subscription call
- No redundant world loading or agent fetching across the system
- Clear separation between world config and runtime world objects
- All tests pass with new architecture
- Documentation reflects new patterns

## Risk Mitigation
- **Breaking Changes**: Implement with backward compatibility where possible
- **Performance**: Monitor performance impacts during rollout
- **Testing**: Comprehensive test coverage for all changes
- **Documentation**: Clear migration guides for any breaking changes
- **Rollback**: Ability to revert changes if issues discovered

## Dependencies
- Core world-manager.ts must be stable
- Subscription system must be reliable
- WebSocket infrastructure must support changes
- CLI command system must support new patterns
