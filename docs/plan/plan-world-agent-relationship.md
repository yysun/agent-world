# World-Agent Relationship Implementation Plan

## Overview
Ensure agents of a world are created and loaded correctly in the one-to-many relationship between World and Agents. This plan focuses on functionality and logic, not optimizations.

**SCOPE**: This implementation focuses exclusively on the `core/` folder (new manager modules) and will not modify the legacy `src/` system.

## Current State Analysis

### Existing Implementation (Core System Only)
- **World Management**: `core/world-manager.ts` handles world CRUD operations
- **Agent Management**: `core/agent-manager.ts` handles agent CRUD operations  
- **Storage**: `core/world-storage.ts` and `core/agent-storage.ts` for file persistence
- **Event Systems**: `core/agent-events.ts` for agent event handling
- **Types**: `core/types.ts` defines Agent, World, and related interfaces

### Key Issues Identified (Core System)
1. **Agent-World Loading**: Agents need proper loading into world.agents Map
2. **Event Subscription**: Agents may not be properly subscribed to world events
3. **Memory Management**: Agent memory structure needs validation and consistency
4. **Data Integrity**: No validation of world-agent relationships in core system
5. **Runtime State**: EventEmitter and agents Map reconstruction needs verification

## Implementation Checklist

### Phase 1: Data Structure Validation and Consistency ✅

#### 1.1 Validate World-Agent Directory Structure (Core System) ✅
- [x] **Audit existing world directories**: Check all worlds in core system have proper agent subdirectories
- [x] **Validate agent config files**: Ensure all agent config.json files exist and are valid in core format
- [x] **Check system prompt files**: Verify system-prompt.md files exist for all agents in core system
- [x] **Validate memory files**: Ensure memory.json files exist and have proper AgentMessage[] structure
- [x] **Create repair function**: Build utility to fix missing or corrupted files in core system

#### 1.2 Standardize Agent Identification (Core System) ✅
- [x] **Ensure ID consistency**: Verify agent.id matches directory name (kebab-case) in core system
- [x] **Validate name mapping**: Ensure agent.config.name maps correctly to agent.id
- [x] **Fix duplicate handling**: Prevent agents with duplicate IDs in same world
- [x] **Create ID validation**: Build function to validate agent ID format and uniqueness for core system

#### 1.3 World Configuration Validation (Core System) ✅
- [x] **Validate world config**: Ensure all worlds have valid config.json in core format
- [x] **Check EventEmitter reconstruction**: Verify world.eventEmitter is properly created
- [x] **Validate turn limits**: Ensure turn limits are properly set and consistent
- [x] **Create world repair**: Build utility to fix world configuration issues in core system

### Phase 2: Agent Loading and Creation Process

#### 2.1 Improve Agent Loading Process (Core System)
- [ ] **Standardize loadAllAgentsFromDisk**: Ensure consistent loading in core/agent-storage.ts
- [ ] **Add error handling**: Graceful handling of corrupted agent files in core system
- [ ] **Implement retry logic**: Retry loading with fallback to defaults in core system
- [ ] **Add loading validation**: Validate loaded agents have required fields for core types
- [ ] **Create loading metrics**: Track successful/failed agent loads in core system

#### 2.2 Enhance Agent Creation Process (Core System)
- [ ] **Pre-creation validation**: Validate agent config before creation in core/agent-manager.ts
- [ ] **Atomic creation**: Ensure all agent files are created or none in core system
- [ ] **Post-creation verification**: Verify agent was created correctly in core system
- [ ] **Add rollback mechanism**: Clean up on creation failure in core system
- [ ] **World capacity check**: Validate world can accept new agents in core system

#### 2.3 Runtime Agent Registration (Core System)
- [ ] **Ensure Map population**: Verify world.agents Map is properly populated in core/world-manager.ts
- [ ] **Validate agent subscription**: Ensure agents are subscribed to world events via core/agent-events.ts
- [ ] **Check memory loading**: Verify agent memory is loaded correctly in core system
- [ ] **Runtime state sync**: Ensure runtime state matches disk state in core system
- [ ] **Add state validation**: Function to validate runtime vs. disk consistency in core system

### Phase 3: Event System Integration

#### 3.1 Agent Message Subscription (Core System)
- [ ] **Standardize subscription**: Use consistent subscription mechanism in core/agent-events.ts
- [ ] **Prevent double subscription**: Avoid duplicate event subscriptions in core system
- [ ] **Track subscriptions**: Maintain subscription registry for cleanup in core system
- [ ] **Validate event flow**: Ensure messages reach intended agents in core system
- [ ] **Add subscription health check**: Monitor subscription status in core system

#### 3.2 World-Specific Event Isolation (Core System)
- [ ] **Ensure event bus isolation**: Agents only receive events from their world in core system
- [ ] **Validate event routing**: Messages don't leak between worlds in core system
- [ ] **Check subscription cleanup**: Proper cleanup when agents/worlds are deleted in core system
- [ ] **Test cross-world isolation**: Verify no cross-contamination in core system
- [ ] **Add event debugging**: Tools to trace event flow in core system

#### 3.3 Agent Lifecycle Events (Core System)
- [ ] **Agent creation events**: Publish events when agents are created in core/agent-manager.ts
- [ ] **Agent status events**: Publish events when agent status changes in core system
- [ ] **Agent deletion events**: Publish events when agents are removed in core system
- [ ] **Memory events**: Publish events when agent memory is updated in core system
- [ ] **Error events**: Publish events when agent operations fail in core system

### Phase 4: Memory and State Management

#### 4.1 Agent Memory Consistency (Core System)
- [ ] **Standardize memory format**: Use consistent AgentMessage[] structure in core/types.ts
- [ ] **Validate memory loading**: Ensure memory loads correctly with Date objects in core/agent-storage.ts
- [ ] **Implement memory limits**: Prevent memory from growing unbounded in core system
- [ ] **Add memory compression**: Compress old memories when needed in core system
- [ ] **Create memory validation**: Validate memory structure integrity in core system

#### 4.2 Agent State Synchronization (Core System)
- [ ] **Runtime-disk sync**: Keep runtime state synchronized with disk in core system
- [ ] **Lazy loading**: Load agent memory only when needed in core system
- [ ] **Auto-save triggers**: Save state on important changes in core system
- [ ] **Conflict resolution**: Handle concurrent modifications in core system
- [ ] **Add state monitoring**: Monitor state drift between runtime and disk in core system

#### 4.3 Performance Optimization for Loading (Core System)
- [ ] **Parallel agent loading**: Load multiple agents concurrently in core/agent-storage.ts
- [ ] **Memory streaming**: Stream large memories instead of loading all at once in core system
- [ ] **Caching strategy**: Cache frequently accessed agent data in core system
- [ ] **Lazy subscription**: Subscribe agents to events only when active in core system
- [ ] **Background cleanup**: Clean up inactive agents from memory in core system

### Phase 5: Testing and Validation ✅

#### 5.1 Create Unit Test Infrastructure (Core System) ✅
- [x] **Setup test environment**: Create tests/core/ directory structure for core system tests
- [x] **Configure Jest for core**: Update Jest configuration to handle core module testing
- [x] **Create test utilities**: Build helper functions for creating test worlds and agents
- [x] **Setup mock data**: Create consistent test data for world-agent scenarios
- [x] **Add test cleanup**: Ensure tests clean up after themselves without affecting other tests

#### 5.2 Unit Tests for Loading (Core System) ✅
- [x] **Test agent loading**: Comprehensive tests for core/agent-storage.ts loadAllAgentsFromDisk
- [x] **Test agent creation**: Comprehensive tests for core/agent-manager.ts createAgent
- [x] **Test error handling**: Tests for corrupted files and missing data in core system
- [x] **Test rollback**: Tests for creation failure scenarios in core system
- [x] **Test validation**: Tests for data validation functions in core system

#### 5.3 Unit Tests for World Management (Core System) ✅
- [x] **Test world creation**: Comprehensive tests for core/world-manager.ts createWorld
- [x] **Test world loading**: Tests for core/world-manager.ts getWorld with agent population
- [x] **Test world deletion**: Tests for proper cleanup in core/world-manager.ts deleteWorld
- [x] **Test EventEmitter setup**: Tests for proper EventEmitter reconstruction
- [x] **Test world-agent relationship**: Tests for proper agent Map population

#### 5.4 Unit Tests for Event System (Core System) 🚧
- [ ] **Test agent subscription**: Tests for core/agent-events.ts subscribeAgentToMessages
- [ ] **Test event isolation**: Tests ensuring agents only receive events from their world
- [ ] **Test subscription cleanup**: Tests for proper unsubscription when agents/worlds deleted
- [ ] **Test event flow**: Tests verifying messages reach intended agents
- [ ] **Test double subscription prevention**: Tests ensuring no duplicate subscriptions

#### 5.5 Integration Tests (Core System) 🚧
- [ ] **World-agent integration**: Tests for complete world loading with agents in core system
- [ ] **Event system integration**: Tests for agent event subscription in core/agent-events.ts
- [ ] **Memory integration**: Tests for agent memory loading and persistence in core system
- [ ] **Core system consistency**: Tests for core/ module integration
- [ ] **Performance tests**: Tests for loading large numbers of agents in core system

#### 5.6 End-to-End Tests (Core System)
- [ ] **Full lifecycle test**: Create world, add agents, load, delete using core system only
- [ ] **Message flow test**: Send messages and verify agent processing in core system
- [ ] **Persistence test**: Verify data survives restart in core system
- [ ] **Error recovery test**: Test recovery from various failure scenarios in core system
- [ ] **Concurrent access test**: Test multiple operations on same world in core system

### Phase 6: Documentation and Monitoring

#### 6.1 Create Documentation (Core System)
- [ ] **Loading process documentation**: Document how agents are loaded in core system
- [ ] **Creation process documentation**: Document agent creation flow in core/agent-manager.ts
- [ ] **Troubleshooting guide**: Guide for fixing loading issues in core system
- [ ] **API documentation**: Document all functions for world-agent operations in core modules
- [ ] **Architecture documentation**: Document the relationship structure in core system

#### 6.2 Add Monitoring and Debugging (Core System)
- [ ] **Loading metrics**: Metrics for agent loading success/failure rates in core system
- [ ] **Performance metrics**: Metrics for loading times and memory usage in core system
- [ ] **Health checks**: Functions to validate world-agent relationship health in core system
- [ ] **Debug logging**: Detailed logging for troubleshooting in core system
- [ ] **Visual tools**: Tools to visualize world-agent relationships in core system

## Success Criteria

### Functional Requirements
1. **Complete Agent Loading**: All agents in a world load successfully with proper configuration
2. **Consistent Event Subscription**: All agents are properly subscribed to their world's events
3. **Memory Integrity**: Agent memory loads correctly with proper Date object restoration
4. **Error Recovery**: Graceful handling of corrupted or missing agent files
5. **Runtime Consistency**: Runtime state matches disk state at all times

### Non-Functional Requirements
1. **Performance**: Loading 100 agents should complete within 2 seconds
2. **Reliability**: 99.9% success rate for agent loading operations
3. **Consistency**: No data loss during creation or loading operations
4. **Isolation**: Complete event isolation between different worlds
5. **Monitoring**: Comprehensive logging and metrics for all operations

## Dependencies

### Internal Dependencies (Core System)
- World storage system (`core/world-storage.ts`) must be stable
- Event system (`core/agent-events.ts`) must be operational
- File system utilities must be reliable
- Agent storage system (`core/agent-storage.ts`) must be consistent

### External Dependencies
- File system must be accessible and writable
- JSON parsing must be reliable for configuration files
- Markdown files must be readable for system prompts
- Date serialization must be consistent

## Risk Mitigation

### High Risk Items (Core System)
1. **Data corruption during loading**: Implement validation and repair utilities in core system
2. **Memory leaks from subscriptions**: Implement proper subscription cleanup in core/agent-events.ts
3. **Race conditions in concurrent loading**: Use proper synchronization in core system
4. **Event system failures**: Implement fallback mechanisms in core system
5. **File system errors**: Implement robust error handling and retry logic in core system

### Mitigation Strategies
1. **Comprehensive testing**: Unit, integration, and end-to-end tests
2. **Gradual rollout**: Test with small datasets before full deployment
3. **Backup strategies**: Maintain backups during migration
4. **Monitoring**: Extensive logging and alerting
5. **Rollback plan**: Ability to revert to previous implementation
