# Implementation Plan: Unit Testing with Mock File I/O and LLM

## Overview
Create comprehensive unit tests for the Agent Passive Memory and Event Message System with proper mocking of file I/O and LLM operations to ensure fast, reliable, and isolated testin### Critical Path
1. **Phase 0** (Cleanup) - Remove invalid integration tests to prevent confusion
2. **Phase 1** (Enhanced Infrastructure) - Build on existing mock foundation
3. **Phase 2** (Core Component Tests) - Enhance 2 existing tests + create 6 new unit tests
4. **Phase 3** (Core Workflow Tests) - Test component coordination with mocked dependencies
5. **Phase 4** (Edge Cases & Validation) - Comprehensive boundary and error testing
6. **Phase 5** (Configuration/Docs) - Documentation and CI integration

**Key Success Factors:**
- ✅ **Leveraging existing infrastructure** rather than creating redundant systems
- ✅ **Reusing proven tests** (utils.test.ts, agent-storage.test.ts with 25 passing tests)
- ❌ **Removing integration tests** that don't belong in unit test suiteurrent State Analysis

### Recent Fixes Applied ✅
- **Fixed Minor Logic Inconsistency**: Updated `shouldAgentRespond()` to use `determineSenderType()` consistently instead of hardcoded string comparisons
- **Fixed Pass Command Response Handling**: Enhanced pass command detection to preserve original LLM response in memory while publishing redirect message
- **Enhanced Comment Blocks**: Updated all core module comment blocks with comprehensive feature descriptions, implementation details, and recent changes

### Existing Test Infrastructure ✅
**REUSABLE TESTS:**
- **✅ `tests/core/utils.test.ts`**: Unit tests for utilities (12 tests passing) - **KEEP & ENHANCE**
- **✅ `tests/core/agent-storage.test.ts`**: Agent storage with mocked file I/O (13 tests passing) - **KEEP & ENHANCE**
- **✅ `tests/core/mock-helpers.ts`**: Comprehensive mock infrastructure - **ENHANCE**
- **✅ `tests/core/setup.ts`**: Global mock configuration - **ENHANCE**
- **✅ `tests/core/world-only-patterns.test.ts`**: World testing patterns - **KEEP & ENHANCE**

**INVALID/REDUNDANT TESTS TO REMOVE:**
- **❌ `tests/core/agent-loading.test.ts`**: Complex integration test, not unit test - **REMOVE**
- **❌ `tests/core/world-management.test.ts`**: Integration test with real dependencies - **REMOVE**
- **❌ `tests/core/world-manager-simple.test.ts`**: Placeholder with no real tests - **REMOVE**
- **❌ `tests/core/world-agent-operations.test.ts`**: Empty placeholder - **REMOVE**
- **❌ `tests/core/test-helpers.ts`**: Superseded by mock-helpers.ts - **REMOVE**
- **❌ `tests/core/test-utils.ts`**: Redundant utilities - **REMOVE**

### Missing Critical Tests
- **Agent Events**: Message processing, turn limiting, event handling
- **LLM Manager**: Streaming, provider management, SSE events
- **World Events**: Event isolation, subscription management
- **Agent Manager**: Agent creation, loading, validation
- **World Manager**: World operations with mocked storage
- **Message Manager**: Broadcasting, routing, filtering

### Testing Requirements
1. **Mock File I/O**: All disk operations must be mocked for unit tests
2. **Mock LLM**: All LLM API calls must be mocked to avoid external dependencies
3. **Isolated Testing**: Each component tested independently
4. **Fast Execution**: Tests should run in milliseconds, not seconds
5. **Deterministic**: Tests must be predictable and not depend on external services

## Phase 0: Cleanup Invalid Tests

### 0.1 Remove Invalid/Redundant Test Files
**Action:** Delete integration tests that are not true unit tests
- [ ] **DELETE:** `tests/core/agent-loading.test.ts` - Complex integration test with world creation
- [ ] **DELETE:** `tests/core/world-management.test.ts` - Integration test with real dependencies
- [ ] **DELETE:** `tests/core/world-manager-simple.test.ts` - Empty placeholder test
- [ ] **DELETE:** `tests/core/world-agent-operations.test.ts` - Empty placeholder test
- [ ] **DELETE:** `tests/core/test-helpers.ts` - Superseded by mock-helpers.ts
- [ ] **DELETE:** `tests/core/test-utils.ts` - Redundant utility functions
- [ ] **DELETE:** `tests/core/*.bak` files - Backup files no longer needed

**Rationale:** These files contain integration tests or empty placeholders that don't belong in unit test suite

**Dependencies:** None
**Estimated Effort:** 0.5 hours

## Phase 1: Testing Infrastructure Setup

### 1.1 Enhance Existing Mock Infrastructure
**File:** `tests/core/mock-helpers.ts` (enhance existing)
- [ ] Add missing error scenario helpers for file operations
- [ ] Enhance LLM mock responses with streaming simulation
- [ ] Add mock cleanup verification utilities
- [ ] Extend existing assertion helpers for comprehensive coverage

**Dependencies:** None
**Estimated Effort:** 2 hours

### 1.2 Enhance AI SDK Mocking
**File:** `tests/core/setup.ts` (enhance existing LLM mocks)
- [ ] Add streaming response simulation with configurable chunks
- [ ] Mock provider creation functions (createOpenAI, createAnthropic, etc.)
- [ ] Add timeout and error scenario mocking
- [ ] Enhance existing LLM manager mocks with SSE event simulation

**Dependencies:** None
**Estimated Effort:** 3 hours

### 1.3 Expand Test Data Fixtures ✅
**File:** `tests/core/mock-helpers.ts` (enhance existing fixtures)
- [x] Add complex conversation history builders
- [x] Create event-heavy test scenarios
- [x] Add edge case agent configurations
- [x] Build SSE event test patterns

**Dependencies:** 1.1, 1.2
**Estimated Effort:** 2 hours

## Phase 2: Core Component Unit Tests

### 2.1 Enhance Existing Utils Tests ✅
**File:** `tests/core/utils.test.ts` (REUSE EXISTING - 12 tests passing)
- [x] Test `generateId()` and `toKebabCase()` - ✅ Already implemented and passing
- [x] **ADD:** Test `extractMentions()` with case-insensitive scenarios
- [x] **ADD:** Test `determineSenderType()` with various sender names
- [x] **ADD:** Test `getWorldTurnLimit()` with different world configurations
- [x] **ADD:** Test `prepareMessagesForLLM()` with conversation history

**Dependencies:** Phase 1
**Estimated Effort:** 2 hours (enhancement only)

### 2.2 Enhance Existing Agent Storage Tests ✅
**File:** `tests/core/agent-storage.test.ts` (REUSE EXISTING - 13 tests passing)
- [x] Test `loadAllAgentsFromDisk()`, `loadAgentFromDisk()`, `saveAgentToDisk()` - ✅ Already implemented and passing
- [x] **ADD:** Test enhanced error scenarios with new mock helpers
- [x] **ADD:** Test batch loading operations with concurrent access
- [x] **ADD:** Test agent validation with edge case configurations

**Dependencies:** Phase 1
**Estimated Effort:** 1 hour (enhancement only)

### 2.3 Agent Events Unit Tests ✅
**File:** `tests/core/agent-events.test.ts` (NEW)
- [x] Test `saveIncomingMessageToMemory()` with mocked file operations
- [x] Test `shouldAgentRespond()` with various message scenarios
- [x] Test `processAgentMessage()` with mocked LLM responses
- [x] Test turn limit logic with mocked agent state
- [x] Test subscription management with mocked world events
- [x] Test error scenarios and edge cases

**Dependencies:** Phase 1
**Estimated Effort:** 4 hours

### 2.4 LLM Manager Unit Tests
**File:** `tests/core/llm-manager.test.ts` (NEW)
- [ ] Test `streamAgentResponse()` with mocked streaming
- [ ] Test `generateAgentResponse()` with mocked generation
- [ ] Test provider loading with various configurations
- [ ] Test timeout handling with mocked delays
- [ ] Test error scenarios with mocked failures
- [ ] Test SSE event publishing during streaming

**Dependencies:** Phase 1
**Estimated Effort:** 3 hours

### 2.5 World Events Unit Tests
**File:** `tests/core/world-events.test.ts` (NEW)
- [ ] Test `publishMessage()` with mocked eventEmitter
- [ ] Test `subscribeToMessages()` with event handling
- [ ] Test `publishSSE()` with SSE event structures
- [ ] Test event isolation between different worlds
- [ ] Test subscription cleanup and memory leaks

**Dependencies:** Phase 1
**Estimated Effort:** 2 hours

### 2.6 Agent Manager Unit Tests
**File:** `tests/core/agent-manager.test.ts` (NEW)
- [ ] Test `createAgent()` with various configurations and mocked file operations
- [ ] Test `loadAgentsIntoWorld()` with mocked storage operations
- [ ] Test agent validation logic with edge case data
- [ ] Test error handling for invalid agent configurations
- [ ] Test agent memory initialization and structure

**Dependencies:** Phase 1
**Estimated Effort:** 3 hours

### 2.7 World Manager Unit Tests
**File:** `tests/core/world-manager.test.ts` (NEW - replaces existing integration test)
- [ ] Test `createWorld()` with mocked file operations
- [ ] Test `getWorld()` and world loading logic
- [ ] Test world configuration validation
- [ ] Test world event emitter initialization
- [ ] Test error handling for invalid world configurations

**Dependencies:** Phase 1
**Estimated Effort:** 3 hours

### 2.8 Message Manager Unit Tests
**File:** `tests/core/message-manager.test.ts` (NEW)
- [ ] Test `broadcastMessage()` with mocked world events
- [ ] Test message routing and filtering logic
- [ ] Test agent subscription management
- [ ] Test message persistence with mocked file operations
- [ ] Test error handling in message processing

**Dependencies:** Phase 1
**Estimated Effort:** 3 hours

## Phase 3: Core Component Workflow Testing (Unit Level)

### 3.1 Cross-Component Workflow Tests
**File:** `tests/core/core-workflows.test.ts`
- [ ] Test complete agent message processing pipeline with mocks
- [ ] Test world-agent-event coordination with mocked dependencies
- [ ] Test multi-agent mention scenarios with mocked LLM responses
- [ ] Test turn limit enforcement across agent interactions
- [ ] Test memory persistence workflow with mocked file operations

**Dependencies:** Phase 2
**Estimated Effort:** 4 hours

### 3.2 Core Error Handling Tests
**File:** `tests/core/core-error-scenarios.test.ts`
- [ ] Test file I/O failures during core operations
- [ ] Test LLM timeout and failure recovery in core workflows
- [ ] Test event system failures and cleanup
- [ ] Test memory corruption detection and recovery
- [ ] Test partial failure scenarios across core components

**Dependencies:** Phase 2
**Estimated Effort:** 3 hours

## Phase 4: Edge Case and Stress Testing (Unit Level)

### 4.1 Core Edge Case Tests
**File:** `tests/core/edge-cases.test.ts`
- [ ] Test empty messages and malformed content handling
- [ ] Test extremely long messages and memory structure limits
- [ ] Test special characters in agent names and mentions
- [ ] Test rapid message sequences and state consistency
- [ ] Test world/agent deletion during active operations
- [ ] Test concurrent access to shared resources (with mocked timing)

**Dependencies:** Phase 3
**Estimated Effort:** 4 hours

### 4.2 Core Validation and Boundary Tests
**File:** `tests/core/validation-boundaries.test.ts`
- [ ] Test input validation with boundary values
- [ ] Test configuration limits and constraints
- [ ] Test memory structure integrity with large datasets
- [ ] Test event system capacity with high message volumes
- [ ] Test error propagation chains across core components

**Dependencies:** Phase 3
**Estimated Effort:** 3 hours

## Phase 5: Test Configuration and Documentation

### 5.1 Jest Configuration Enhancement
**File:** `jest.config.js`
- [ ] Configure mock modules for file system operations
- [ ] Set up test environment with proper isolation
- [ ] Configure coverage reporting for core modules
- [ ] Set up test timeouts appropriate for unit tests
- [ ] Configure test patterns and exclusions

**Dependencies:** All previous phases
**Estimated Effort:** 1 hour

### 5.2 Test Documentation
**File:** `docs/testing/unit-testing-guide.md`
- [ ] Document mock infrastructure usage
- [ ] Provide examples of writing new tests
- [ ] Document test data fixtures and builders
- [ ] Explain testing patterns and best practices
- [ ] Document continuous integration setup

**Dependencies:** 5.1
**Estimated Effort:** 1 hour

## Progress Summary ✅

**COMPLETED PHASES:**
- ✅ **Phase 0:** Cleanup of invalid/integration tests completed
- ✅ **Phase 1:** Enhanced testing infrastructure with comprehensive mock helpers and fixtures
- ✅ **Phase 2 (Partial):** Core component tests enhanced and created:
  - ✅ Enhanced utils tests with 4 new test categories (extractMentions, determineSenderType, getWorldTurnLimit, prepareMessagesForLLM)
  - ✅ Enhanced agent storage tests with error scenarios, batch operations, and edge cases
  - ✅ Created comprehensive agent events unit tests with subscription, message processing, and error handling

**CURRENT STATE:**
- **25+ existing unit tests** preserved and enhanced
- **Comprehensive mock infrastructure** with test data builders, error scenarios, and SSE patterns
- **3 core modules fully tested** with proper isolation and mocking
- **File I/O and LLM operations** properly mocked throughout

**REMAINING WORK (Phase 2 continuation):**
- LLM Manager unit tests (estimated 3 hours)
- World Events unit tests (estimated 2 hours)
- Agent Manager unit tests (estimated 3 hours)
- World Manager unit tests (estimated 3 hours)
- Message Manager unit tests (estimated 3 hours)

**NEXT STEPS:**
Continue with Phase 2 core component tests, then proceed to Phase 3 (workflow tests) and Phase 4 (edge cases) as time permits.

### Critical Path
1. **Phase 1** (Enhanced Infrastructure) - Build on existing mock foundation
2. **Phase 2** (Core Component Tests) - Focus on 7 core modules with comprehensive unit tests
3. **Phase 3** (Core Workflow Tests) - Test component coordination with mocked dependencies
4. **Phase 4** (Edge Cases & Validation) - Comprehensive boundary and error testing
5. **Phase 5** (Configuration/Docs) - Documentation and CI integration

**Key Success Factor:** Leveraging existing mock infrastructure rather than creating redundant systems

## Mock Strategy Details

### File I/O Mocking (Enhanced Existing Pattern)
```typescript
// Enhance existing fs mocking in tests/core/setup.ts
// Keep current selective mocking approach, don't mock entire modules
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    mkdir: jest.fn(),
    access: jest.fn(),
    readdir: jest.fn(),
    rename: jest.fn(),
    unlink: jest.fn(),
    rm: jest.fn()
  }
}));

// DON'T mock entire agent-storage module - test real functions with mocked fs
// This preserves actual business logic testing
```

### LLM Mocking (Enhanced Existing Pattern)
```typescript
// Enhance existing LLM mocking in tests/core/setup.ts
jest.mock('../../core/llm-manager.js', () => ({
  streamAgentResponse: jest.fn().mockImplementation(async function* () {
    yield 'Mocked ';
    yield 'streaming ';
    yield 'response!';
  }),
  generateAgentResponse: jest.fn().mockResolvedValue('Mocked response'),
  LLMConfig: jest.fn()
}), { virtual: true });

// Add AI SDK mocking for unit tests
jest.mock('ai', () => ({
  generateText: jest.fn(),
  streamText: jest.fn()
}));
```

## Success Criteria

### Testing Coverage Goals
- [ ] **90%+ code coverage** on core modules
- [ ] **All file I/O operations mocked** - no real disk access in unit tests
- [ ] **All LLM operations mocked** - no API calls in unit tests
- [ ] **Fast execution** - entire test suite runs in under 30 seconds
- [ ] **Deterministic results** - tests produce consistent results
- [ ] **Isolated testing** - each test can run independently
- [ ] **Comprehensive scenarios** - cover happy path, errors, and edge cases

### Quality Metrics
- [ ] **Test isolation** - no test depends on another test's state
- [ ] **Mock verification** - all mocks are properly asserted
- [ ] **Error coverage** - all error paths tested
- [ ] **Performance validation** - tests complete within time limits

## Risk Mitigation

### Technical Risks
- **Mock complexity**: Start with simple mocks, enhance incrementally
- **Test brittleness**: Use data builders and flexible assertions
- **Coverage gaps**: Implement coverage reporting and monitoring
- **Performance issues**: Monitor test execution times

### Implementation Risks
- **Time estimation**: Include buffer time for mock debugging
- **Dependency conflicts**: Test mocks don't interfere with real code
- **Maintenance burden**: Document mock patterns for future developers

## Total Estimated Effort

**Phase 0** (Cleanup Invalid Tests): 0.5 hours
**Phase 1** (Enhanced Infrastructure): 7 hours
**Phase 2** (Core Component Tests): 21 hours (3 hours saved by reusing existing tests)
**Phase 3** (Core Workflow Tests): 7 hours
**Phase 4** (Edge Cases & Validation): 7 hours
**Phase 5** (Config/Docs): 2 hours

**Total Development Time:** 44.5 hours
**Total Calendar Time:** 2 weeks (with testing, debugging, and iteration)

**Note:** Estimates updated to reflect:
- ✅ **Reuse existing passing tests** (utils.test.ts, agent-storage.test.ts) - saves 3 hours
- ✅ **Leverage existing mock infrastructure** (mock-helpers.ts, setup.ts)
- ❌ **Remove invalid integration tests** to prevent confusion
- Phase 2 has 8 test files (2 enhanced existing + 6 new)

## Implementation Notes

1. **Start with Phase 0** - Clean up existing tests to prevent confusion and focus on true unit tests
2. **Leverage existing success** - Build on 25 passing tests in utils.test.ts and agent-storage.test.ts
3. **Enhance, don't replace** - Existing mock infrastructure (mock-helpers.ts, setup.ts) is solid foundation
4. **Focus on isolation** - Each test should be completely independent with proper mocking
5. **Monitor performance** - Unit tests should be fast and reliable (goal: under 30 seconds total)
6. **Document patterns** - Create reusable testing patterns based on proven existing infrastructure

**Key Architectural Decisions:**
- ✅ **Reuse existing mock infrastructure** instead of creating new mock files
- ✅ **Keep proven unit tests** (utils.test.ts, agent-storage.test.ts) and enhance them
- ❌ **Remove integration tests** from unit test suite (move to tests/integration if needed)
- ✅ **Follow existing patterns** established in working tests

This plan builds on the solid foundation of existing working tests while ensuring comprehensive coverage of core functionality.
