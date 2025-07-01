# Implementation Plan: Unit Testing with Mock File I/O and LLM

## Overview
Create comprehensive unit tests for the Agent Passive Memory and Event Message System with proper mocking of file I/O and LLM operations to ensure fast, reliable, and isolated testing.

## Current State Analysis

### Recent Fixes Applied ✅
- **Fixed Minor Logic Inconsistency**: Updated `shouldAgentRespond()` to use `determineSenderType()` consistently instead of hardcoded string comparisons
- **Fixed Pass Command Response Handling**: Enhanced pass command detection to preserve original LLM response in memory while publishing redirect message
- **Enhanced Comment Blocks**: Updated all core module comment blocks with comprehensive feature descriptions, implementation details, and recent changes

### Existing Test Implementation
- **Integration Tests**: `tests/integration/core-passive-memory-basic.test.ts` exists but uses real file I/O
- **Utility Tests**: Basic utility function tests exist but lack comprehensive coverage
- **Missing**: Proper unit tests with mocked file I/O and LLM operations

### Testing Requirements
1. **Mock File I/O**: All disk operations must be mocked for unit tests
2. **Mock LLM**: All LLM API calls must be mocked to avoid external dependencies
3. **Isolated Testing**: Each component tested independently
4. **Fast Execution**: Tests should run in milliseconds, not seconds
5. **Deterministic**: Tests must be predictable and not depend on external services

## Phase 1: Testing Infrastructure Setup

### 1.1 Create Mock Infrastructure
**File:** `tests/core/mocks/file-system.mock.ts`
- [ ] Mock `fs/promises` operations (readFile, writeFile, mkdir, etc.)
- [ ] Mock agent storage operations (saveAgentToDisk, loadAgentFromDisk)
- [ ] Mock memory persistence operations (saveAgentMemoryToDisk)
- [ ] Provide configurable mock responses and error scenarios

**Dependencies:** None
**Estimated Effort:** 2 hours

### 1.2 Create LLM Mock Infrastructure
**File:** `tests/core/mocks/llm.mock.ts`
- [ ] Mock AI SDK functions (generateText, streamText)
- [ ] Mock streaming responses with configurable chunks
- [ ] Mock provider creation functions (createOpenAI, createAnthropic, etc.)
- [ ] Mock error scenarios (timeouts, API failures)
- [ ] Provide deterministic responses for testing

**Dependencies:** None
**Estimated Effort:** 2 hours

### 1.3 Create World and Agent Test Fixtures
**File:** `tests/core/fixtures/test-data.ts`
- [ ] Create sample World objects with mocked eventEmitter
- [ ] Create sample Agent objects with various configurations
- [ ] Create sample message events and SSE events
- [ ] Create conversation history fixtures
- [ ] Provide builders for dynamic test data creation

**Dependencies:** 1.1, 1.2
**Estimated Effort:** 1 hour

## Phase 2: Core Component Unit Tests

### 2.1 Agent Events Unit Tests
**File:** `tests/core/agent-events.test.ts`
- [ ] Test `saveIncomingMessageToMemory()` with mocked file operations
- [ ] Test `shouldAgentRespond()` with various message scenarios
- [ ] Test `processAgentMessage()` with mocked LLM responses
- [ ] Test turn limit logic with mocked agent state
- [ ] Test pass command detection and handling
- [ ] Test auto-mention logic for agent-to-agent replies
- [ ] Test error handling with mocked failures

**Dependencies:** Phase 1
**Estimated Effort:** 4 hours

### 2.2 Utils Unit Tests
**File:** `tests/core/utils.test.ts`
- [ ] Test `extractMentions()` with case-insensitive scenarios
- [ ] Test `determineSenderType()` with various sender names
- [ ] Test `getWorldTurnLimit()` with different world configurations
- [ ] Test `prepareMessagesForLLM()` with conversation history
- [ ] Test message transformation utilities

**Dependencies:** Phase 1
**Estimated Effort:** 2 hours

### 2.3 LLM Manager Unit Tests
**File:** `tests/core/llm-manager.test.ts`
- [ ] Test `streamAgentResponse()` with mocked streaming
- [ ] Test `generateAgentResponse()` with mocked generation
- [ ] Test provider loading with various configurations
- [ ] Test timeout handling with mocked delays
- [ ] Test error scenarios with mocked failures
- [ ] Test SSE event publishing during streaming

**Dependencies:** Phase 1
**Estimated Effort:** 3 hours

### 2.4 World Events Unit Tests
**File:** `tests/core/world-events.test.ts`
- [ ] Test `publishMessage()` with mocked eventEmitter
- [ ] Test `subscribeToMessages()` with event handling
- [ ] Test `publishSSE()` with SSE event structures
- [ ] Test event isolation between different worlds
- [ ] Test subscription cleanup and memory leaks

**Dependencies:** Phase 1
**Estimated Effort:** 2 hours

## Phase 3: Integration Testing with Mocks

### 3.1 End-to-End Workflow Tests
**File:** `tests/core/integration/workflow.test.ts`
- [ ] Test complete message processing workflow with mocks
- [ ] Test agent subscription and message handling
- [ ] Test multiple agents responding to mentions
- [ ] Test turn limit scenarios across agent interactions
- [ ] Test memory persistence throughout conversations

**Dependencies:** Phase 2
**Estimated Effort:** 3 hours

### 3.2 Error Scenario Tests
**File:** `tests/core/integration/error-handling.test.ts`
- [ ] Test file I/O failures during message processing
- [ ] Test LLM timeout and API failure scenarios
- [ ] Test memory corruption and recovery
- [ ] Test eventEmitter failures and cleanup
- [ ] Test partial failure scenarios

**Dependencies:** Phase 2
**Estimated Effort:** 2 hours

## Phase 4: Performance and Edge Case Testing

### 4.1 Performance Tests with Mocks
**File:** `tests/core/performance/performance.test.ts`
- [ ] Test memory usage with large conversation histories
- [ ] Test processing speed with mocked operations
- [ ] Test concurrent agent processing scenarios
- [ ] Test event system performance under load
- [ ] Benchmark against performance requirements

**Dependencies:** Phase 3
**Estimated Effort:** 2 hours

### 4.2 Edge Case Tests
**File:** `tests/core/edge-cases/edge-cases.test.ts`
- [ ] Test empty messages and malformed content
- [ ] Test extremely long messages and memory limits
- [ ] Test special characters in agent names and mentions
- [ ] Test rapid message sequences and race conditions
- [ ] Test world deletion during active conversations

**Dependencies:** Phase 3
**Estimated Effort:** 2 hours

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

## Implementation Priority and Dependencies

### Critical Path
1. **Phase 1** (Infrastructure) - Mock setup is foundation for all other tests
2. **Phase 2** (Core Tests) - Essential component testing
3. **Phase 3** (Integration) - Workflow validation with mocks
4. **Phase 4** (Performance/Edge Cases) - Comprehensive coverage
5. **Phase 5** (Configuration/Docs) - Finalization and documentation

## Mock Strategy Details

### File I/O Mocking
```typescript
// Mock all file operations to use in-memory storage
jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  mkdir: jest.fn(),
  access: jest.fn()
}));

// Mock agent storage operations
jest.mock('../core/agent-storage', () => ({
  saveAgentToDisk: jest.fn(),
  loadAgentFromDisk: jest.fn(),
  saveAgentMemoryToDisk: jest.fn()
}));
```

### LLM Mocking
```typescript
// Mock AI SDK for deterministic responses
jest.mock('ai', () => ({
  generateText: jest.fn(),
  streamText: jest.fn()
}));

// Mock streaming with controlled chunks
const mockStreamText = {
  textStream: async function* () {
    yield 'Hello ';
    yield 'from ';
    yield 'mocked LLM!';
  }
};
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

**Phase 1** (Infrastructure): 5 hours
**Phase 2** (Core Tests): 11 hours  
**Phase 3** (Integration): 5 hours
**Phase 4** (Performance/Edge): 4 hours
**Phase 5** (Config/Docs): 2 hours

**Total Development Time:** 27 hours
**Total Calendar Time:** 1 week (with testing and iteration)

## Implementation Notes

1. **Start with Phase 1** - Mock infrastructure is critical foundation
2. **Test incrementally** - Validate mocks work before building complex tests
3. **Focus on isolation** - Each test should be completely independent
4. **Monitor performance** - Unit tests should be fast and reliable
5. **Document patterns** - Create reusable testing patterns for future development

This plan ensures comprehensive unit testing with proper mocking while maintaining fast, reliable, and maintainable test suites.
