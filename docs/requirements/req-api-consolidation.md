# API Consolidation Requirements

## Overview
Consolidate the Agent World API to reduce redundancy, improve discoverability, and create a more object-oriented design while maintaining all existing functionality and compatibility.

## Problem Analysis

### Current Issues
1. **Scattered Functionality**: World-related operations split across `core/utils`, `core/events`, and `core/managers`
2. **Redundant Interfaces**: Multiple interfaces (`WorldData`, `WorldConfig`, `MessageData`, `AgentMessage`) with overlapping purposes
3. **Inconsistent Patterns**: Some operations use object methods, others use standalone functions
4. **Poor Discoverability**: Related functions scattered across different modules
5. **Import Complexity**: Need multiple imports for related functionality

### Root Causes
- Historical growth without consolidation
- Utility functions created before object-oriented design
- Separation of concerns taken too far
- No clear API design principles

## Requirements

### R1: World Interface Enhancement

#### R1.1 Integrate Utility Functions
**WHAT**: Move world-related utility functions from `core/utils` to World interface methods
**WHY**: Functions operating on World instances should be discoverable as methods
**ACCEPTANCE CRITERIA**:
- `getWorldTurnLimit(world)` → `world.getTurnLimit()`
- Add `world.getCurrentTurnCount()` method
- Add `world.hasReachedTurnLimit()` method
- Add `world.resetTurnCount()` method
- All functions maintain current behavior
- Backward compatibility maintained through deprecated wrappers

#### R1.2 Integrate Event Operations
**WHAT**: Move event functions from `core/events` to World interface methods
**WHY**: Events are core World operations and should be easily accessible
**ACCEPTANCE CRITERIA**:
- `publishMessage(world, content, sender)` → `world.publishMessage(content, sender)`
- `subscribeToMessages(world, handler)` → `world.subscribeToMessages(handler)`
- `broadcastToWorld(world, message, sender)` → `world.broadcastMessage(message, sender)`
- `publishSSE(world, data)` → `world.publishSSE(data)`
- `subscribeToSSE(world, handler)` → `world.subscribeToSSE(handler)`
- Return cleanup functions for subscriptions
- Maintain event isolation per World instance

#### R1.3 Add Agent Subscription Management
**WHAT**: Add agent subscription methods to World interface
**WHY**: Agent subscription is fundamental World functionality
**ACCEPTANCE CRITERIA**:
- `subscribeAgentToMessages(world, agent)` → `world.subscribeAgent(agent)`
- Add `world.unsubscribeAgent(agentId)` method
- Add `world.getSubscribedAgents()` method
- Add `world.isAgentSubscribed(agentId)` method
- Maintain subscription registry for cleanup
- Prevent duplicate subscriptions

### R2: Agent Interface Enhancement

#### R2.1 Integrate LLM Operations
**WHAT**: Move LLM functions from `core/llm-manager` to Agent interface methods
**WHY**: LLM operations are agent-specific and should be discoverable
**ACCEPTANCE CRITERIA**:
- `generateAgentResponse(world, agent, messages)` → `agent.generateResponse(messages)`
- `streamAgentResponse(world, agent, messages)` → `agent.streamResponse(messages)`
- Methods must have access to World context
- Maintain LLM queue functionality
- Preserve SSE streaming capabilities

#### R2.2 Enhanced Memory Management
**WHAT**: Add comprehensive memory management methods to Agent interface
**WHY**: Memory operations are core Agent functionality
**ACCEPTANCE CRITERIA**:
- Add `agent.addToMemory(message)` method
- Add `agent.getMemorySize()` method
- Add `agent.archiveMemory()` method
- Add `agent.getMemorySlice(start, end)` method
- Add `agent.searchMemory(query)` method
- Maintain existing memory persistence behavior
- Support memory limits and compression

#### R2.3 Message Processing Integration
**WHAT**: Add message processing methods to Agent interface
**WHY**: Message processing is core Agent functionality
**ACCEPTANCE CRITERIA**:
- Add `agent.shouldRespond(messageEvent)` method
- Add `agent.processMessage(messageEvent)` method
- Add `agent.extractMentions(content)` method
- Add `agent.isMentioned(content)` method
- Maintain current filtering logic
- Preserve auto-mention functionality

### R3: Unified Storage Interface

#### R3.1 Create StorageManager Interface
**WHAT**: Consolidate storage operations from `core/world-storage` and `core/agent-storage`
**WHY**: Unified storage interface improves maintainability
**ACCEPTANCE CRITERIA**:
- Create `StorageManager` interface with world and agent operations
- Support batch operations for performance
- Include integrity checking and repair methods
- Maintain all existing storage functionality
- Support both synchronous and asynchronous operations

#### R3.2 Integrate Storage into World
**WHAT**: Add StorageManager instance to World interface
**WHY**: Centralized storage access through World
**ACCEPTANCE CRITERIA**:
- Add `world.storage: StorageManager` property
- Ensure all storage operations go through this interface
- Maintain backward compatibility with existing manager functions
- Support storage operation debugging

### R4: Message Processing Consolidation

#### R4.1 Create MessageProcessor Interface
**WHAT**: Consolidate message utilities from `core/utils` and `core/events`
**WHY**: Group related message processing functions
**ACCEPTANCE CRITERIA**:
- `extractMentions(content)` method
- `extractParagraphBeginningMentions(content)` method
- `determineSenderType(sender)` method
- `shouldAutoMention(response, sender, agentId)` method
- `addAutoMention(response, sender)` method
- `removeSelfMentions(response, agentId)` method
- Maintain all current logic and behavior
- Support case-insensitive matching

#### R4.2 Integrate MessageProcessor into World
**WHAT**: Add MessageProcessor instance to World interface
**WHY**: Centralized message processing access
**ACCEPTANCE CRITERIA**:
- Add `world.messageProcessor: MessageProcessor` property
- Ensure consistent message processing across system
- Support debugging and tracing

### R5: Interface Cleanup

#### R5.1 Remove Redundant Interfaces
**WHAT**: Eliminate overlapping interfaces
**WHY**: Reduce API complexity and confusion
**ACCEPTANCE CRITERIA**:
- Remove deprecated `WorldConfig` interface
- Consolidate `MessageData` and `AgentMessage` interfaces
- Merge `AgentInfo` properties into `Agent` interface with optional flags
- Remove redundant event payload interfaces
- Maintain type safety throughout

#### R5.2 Simplify Manager Functions
**WHAT**: Reduce manager functions to essential operations only
**WHY**: Avoid duplication with World/Agent methods
**ACCEPTANCE CRITERIA**:
- Keep `createWorld()`, `createAgent()` as factory functions
- Keep batch operations like `createAgentsBatch()`
- Keep cross-world operations like `listWorlds()`
- Remove functions that duplicate World/Agent methods
- Maintain all existing functionality through World/Agent methods

### R6: Event System Consolidation

#### R6.1 Unified Event Interface
**WHAT**: Create single comprehensive event type
**WHY**: Simplify event handling and reduce complexity
**ACCEPTANCE CRITERIA**:
- Create unified `WorldEvent` interface
- Support all event types: message, sse, system, agent
- Include all necessary fields with optional properties
- Maintain type safety with discriminated unions
- Preserve existing event functionality

#### R6.2 Streamline Event Functions
**WHAT**: Move event functions to World interface methods
**WHY**: Events are World-specific operations
**ACCEPTANCE CRITERIA**:
- All event publishing/subscribing through World methods
- Remove standalone event functions from public API
- Keep event functions as internal implementation details
- Maintain event isolation per World instance

### R7: Configuration Enhancement

#### R7.1 Create Fluent Configuration Interfaces
**WHAT**: Add builder pattern for configuration
**WHY**: Improve developer experience
**ACCEPTANCE CRITERIA**:
- `Agent.configure()` returns `AgentConfigBuilder`
- `World.configure()` returns `WorldConfigBuilder`
- Fluent methods for all configuration options
- Type-safe configuration with compile-time validation
- Integration with LLM provider configuration

### R8: Backward Compatibility

#### R8.1 Deprecation Strategy
**WHAT**: Provide deprecated wrappers for existing functions
**WHY**: Maintain compatibility during transition
**ACCEPTANCE CRITERIA**:
- Mark old functions as deprecated with clear migration path
- Provide wrapper functions that delegate to new methods
- Include JSDoc deprecation notices
- Maintain all existing functionality

#### R8.2 Migration Path
**WHAT**: Provide clear migration documentation
**WHY**: Help developers transition to new API
**ACCEPTANCE CRITERIA**:
- Document all API changes with before/after examples
- Provide automated migration tools where possible
- Include comprehensive migration guide
- Support gradual migration approach

## Implementation Strategy

### Phase 1: Foundation (World Interface Enhancement)
- Extend World interface with utility and event methods
- Implement methods while maintaining existing functions
- Add comprehensive tests for new methods
- Update documentation

### Phase 2: Agent Enhancement
- Extend Agent interface with LLM and memory methods
- Implement message processing methods
- Ensure World context access for Agent methods
- Add tests and documentation

### Phase 3: Storage and Message Processing
- Create unified StorageManager interface
- Create MessageProcessor interface
- Integrate into World interface
- Add tests and documentation

### Phase 4: Interface Cleanup
- Remove redundant interfaces
- Simplify manager functions
- Consolidate event system
- Update all references

### Phase 5: Configuration Enhancement
- Add fluent configuration interfaces
- Update creation and update patterns
- Add comprehensive examples
- Update documentation

### Phase 6: Backward Compatibility
- Add deprecation warnings
- Create migration tools
- Update documentation
- Provide migration examples

## Success Criteria

### Primary Metrics
- **API Surface Reduction**: Reduce exported functions by 40%
- **Import Simplification**: Reduce average imports per usage by 60%
- **Type Safety**: Maintain 100% TypeScript type coverage
- **Test Coverage**: Maintain 95% test coverage
- **Performance**: No performance degradation in core operations

### Secondary Metrics
- **Developer Experience**: Improve IDE IntelliSense suggestions
- **Documentation Quality**: Comprehensive API documentation
- **Migration Success**: Smooth transition for existing users
- **Maintainability**: Reduced code duplication
- **Discoverability**: Related functions grouped together

## Risks and Mitigation

### Risk 1: Breaking Changes
**Mitigation**: Extensive deprecation period, comprehensive backward compatibility

### Risk 2: Performance Impact
**Mitigation**: Thorough performance testing, optimization where needed

### Risk 3: Complexity Increase
**Mitigation**: Clear documentation, comprehensive examples, gradual rollout

### Risk 4: Migration Difficulty
**Mitigation**: Automated migration tools, detailed migration guides

## Testing Requirements

### Unit Tests
- All new methods must have comprehensive unit tests
- Existing tests must continue to pass
- Mock objects for complex dependencies

### Integration Tests
- World/Agent method integration tests
- Storage and message processing integration
- Event system integration tests

### Performance Tests
- Benchmark consolidated operations
- Compare against current performance
- Identify and fix bottlenecks

### Migration Tests
- Test backward compatibility wrappers
- Validate migration tools
- Test gradual migration scenarios

## Documentation Requirements

### API Documentation
- Complete JSDoc for all new methods
- Usage examples for common patterns
- Migration guide with before/after examples

### Architecture Documentation
- Updated system architecture diagrams
- Design decision rationale
- Integration patterns and best practices

### Migration Documentation
- Step-by-step migration guide
- Common pitfalls and solutions
- Automated migration tool usage

## Validation Criteria

### Technical Validation
- [ ] All existing tests pass
- [ ] New functionality has comprehensive tests
- [ ] Performance benchmarks meet requirements
- [ ] TypeScript compilation succeeds with strict mode

### User Experience Validation
- [ ] API is more discoverable through IDE
- [ ] Common use cases require fewer imports
- [ ] Error messages are clear and helpful
- [ ] Documentation is comprehensive and accurate

### Compatibility Validation
- [ ] Backward compatibility maintained
- [ ] Migration tools work correctly
- [ ] Gradual migration is possible
- [ ] Existing integrations continue to work