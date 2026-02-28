# Architecture Plan: Test Coverage Improvement

**Date**: 2025-11-09  
**Status**: Planning  
**Current Coverage**: 32.56% statement coverage (518 tests passing)

## Overview

Improve test coverage for critical system components, focusing on LLM providers, MCP integration, approval flows, and database layer. Target: >60% coverage for core business logic.

## Current State Analysis

### Well-Tested Areas ✅
- Event system (persistence, metadata, validation)
- Message handling and persistence
- Tool utilities and validation
- Agent response logic and mentions
- Memory storage (in-memory implementation)
- CLI command parsing

### Under-Tested Areas ⚠️
- **LLM Providers**: 2-3% coverage (anthropic, google, openai direct)
- **MCP Server Registry**: 3.7% coverage
- **Approval Checker**: 2.9% coverage
- **LLM Manager**: 9.91% coverage
- **SQLite Storage**: 0% coverage
- **Queue Storage**: 0% coverage (despite existing tests - investigation needed)

## Implementation Plan

### Phase 1: Critical Path Testing (High Priority)

#### [ ] Task 1.1: LLM Provider Testing
**Files**: `anthropic-direct.ts`, `google-direct.ts`, `openai-direct.ts`

**Test Coverage**:
- [ ] Streaming response handling
  - SSE event parsing and emission
  - Chunk accumulation and reconstruction
  - Stream error handling and recovery
- [ ] Non-streaming response handling
  - Direct response parsing
  - Response format validation
- [ ] Tool call execution flows
  - Tool call detection and extraction
  - Multiple tool calls in sequence
  - Tool result formatting
- [ ] Error scenarios
  - API failures (4xx, 5xx errors)
  - Network timeouts
  - Rate limiting (429 responses)
  - Invalid API keys
  - Malformed responses
- [ ] Token management
  - Token counting accuracy
  - Context window limits
  - Response truncation

**New Test Files**:
- `tests/core/llm-providers/anthropic-streaming.test.ts`
- `tests/core/llm-providers/google-streaming.test.ts`
- `tests/core/llm-providers/openai-streaming.test.ts`
- `tests/core/llm-providers/provider-errors.test.ts`
- `tests/core/llm-providers/token-management.test.ts`

**Approach**:
- Mock HTTP responses using fetch mocks
- Test SSE parsing with simulated streams
- Use real provider response samples (anonymized)
- Test each provider's specific quirks (e.g., Google's function calling format)

---

#### [ ] Task 1.2: MCP Server Registry Testing
**File**: `mcp-server-registry.ts` (2000+ lines, 3.7% coverage)

**Test Coverage**:
- [ ] Server lifecycle management
  - Connection establishment (stdio, SSE, HTTP)
  - Reconnection logic on failure
  - Graceful disconnect and cleanup
  - Health check mechanisms
- [ ] Tool discovery and registration
  - Tool schema retrieval
  - Schema validation and transformation
  - Tool list updates on server changes
  - Duplicate tool name handling
- [ ] Tool execution coordination
  - Request/response flow
  - Argument validation and transformation
  - Result parsing and forwarding
  - Execution timeout handling
- [ ] Multi-server scenarios
  - Multiple MCP servers active simultaneously
  - Tool name conflicts across servers
  - Server priority and selection logic
- [ ] Configuration management
  - Config validation on load
  - Dynamic config updates
  - Invalid config handling
  - Credentials management

**New Test Files**:
- `tests/core/mcp/server-lifecycle.test.ts`
- `tests/core/mcp/tool-discovery.test.ts`
- `tests/core/mcp/tool-execution.test.ts`
- `tests/core/mcp/multi-server.test.ts`
- `tests/core/mcp/config-management.test.ts`

**Approach**:
- Mock MCP server responses
- Use in-memory transport for testing
- Test with actual MCP protocol messages
- Simulate server failures and recovery

---

#### [ ] Task 1.3: Approval System Testing
**File**: `approval-checker.ts` (2.9% coverage)

**Test Coverage**:
- [ ] Approval scope handling
  - ONCE: Single execution then prompt again
  - SESSION: Valid for current chat session
  - ALWAYS: Permanent approval across sessions
- [ ] Approval request flow
  - Request detection in tool_calls
  - Approval prompt generation
  - Response parsing (APPROVE_ONCE, APPROVE_SESSION, etc.)
- [ ] Approval validation
  - Tool call verification against agent memory
  - Security: Reject unauthorized tool calls
  - Approval expiration and cleanup
- [ ] Denial flow
  - DENY handling
  - Error message generation
  - State cleanup after denial
- [ ] Concurrent scenarios
  - Multiple pending approval requests
  - Approval race conditions
  - Approval state consistency

**New Test Files**:
- `tests/core/approval/approval-scopes.test.ts`
- `tests/core/approval/approval-security.test.ts`
- `tests/core/approval/approval-concurrent.test.ts`
- `tests/core/approval/approval-expiration.test.ts`

**Approach**:
- Test with realistic tool call scenarios
- Mock tool execution results
- Test state transitions thoroughly
- Verify security boundaries

---

### Phase 2: Storage Layer Testing (High Priority)

#### [ ] Task 2.1: SQLite Storage Testing
**Files**: `sqlite-storage.ts`, `sqlite-schema.ts` (0% coverage)

**Test Coverage**:
- [ ] CRUD operations for all entities
  - Worlds: create, read, update, delete
  - Agents: create, read, update, delete
  - Chats: create, read, update, delete
  - Messages: create, read, filter, delete
  - Events: create, read, query by type/chat
- [ ] Transaction handling
  - Multi-operation transactions
  - Rollback on error
  - Nested transaction support
- [ ] Schema migrations
  - Forward migrations (0000 → current)
  - Migration idempotency
  - Schema version tracking
  - Migration failure recovery
- [ ] Constraints and validation
  - Foreign key constraints
  - Unique constraints
  - NOT NULL constraints
  - CHECK constraints
- [ ] Concurrent access
  - Multiple read operations
  - Write lock contention
  - WAL mode behavior
  - Connection pooling

**New Test Files**:
- `tests/core/storage/sqlite-crud.test.ts`
- `tests/core/storage/sqlite-transactions.test.ts`
- `tests/core/storage/sqlite-migrations.test.ts`
- `tests/core/storage/sqlite-concurrent.test.ts`
- `tests/core/storage/sqlite-constraints.test.ts`

**Approach**:
- Use in-memory SQLite for fast tests
- Test with temporary file databases for migration tests
- Use concurrent workers for concurrency tests
- Verify data integrity after operations

---

#### [ ] Task 2.2: Queue Storage Investigation
**File**: `queue-storage.ts` (0% coverage despite tests existing)

**Investigation**:
- [ ] Analyze why `tests/core/queue-storage.test.ts` shows 0% coverage
- [ ] Verify test execution against actual implementation
- [ ] Check if tests are using mocks instead of real code
- [ ] Ensure vitest coverage configuration is correct

**Actions**:
- [ ] Review vitest.config.ts coverage settings
- [ ] Add integration tests if unit tests are fully mocked
- [ ] Test queue processing in realistic scenarios
- [ ] Add performance benchmarks for queue operations

**New/Updated Test Files**:
- `tests/core/queue-storage.test.ts` (investigate and fix)
- `tests/integration/queue-processing.test.ts` (new integration test)

---

### Phase 3: Orchestration & Integration (Medium Priority)

#### [ ] Task 3.1: LLM Manager Testing
**File**: `llm-manager.ts` (9.91% coverage)

**Test Coverage**:
- [ ] Provider selection logic
  - Default provider selection
  - Per-world provider override
  - Per-agent provider override
  - Provider fallback on error
- [ ] Configuration management
  - Config validation
  - Dynamic config updates
  - Model-specific settings
  - API key management
- [ ] Tool integration
  - Tool schema conversion for different providers
  - Tool execution coordination
  - Tool result formatting per provider
- [ ] Streaming coordination
  - Stream start/chunk/end event handling
  - Multi-agent streaming
  - Stream cancellation
- [ ] Error handling and recovery
  - Provider API failures
  - Retry logic
  - Circuit breaker pattern
  - Fallback providers

**New Test Files**:
- `tests/core/llm-manager/provider-selection.test.ts`
- `tests/core/llm-manager/config-management.test.ts`
- `tests/core/llm-manager/tool-integration.test.ts`
- `tests/core/llm-manager/streaming.test.ts`
- `tests/core/llm-manager/error-recovery.test.ts`

---

#### [ ] Task 3.2: Storage Factory Testing
**File**: `storage-factory.ts` (21.36% coverage)

**Test Coverage**:
- [ ] Storage type selection
  - Memory storage initialization
  - SQLite storage initialization
  - Default storage fallback
- [ ] Configuration validation
  - Invalid storage type handling
  - SQLite path validation
  - Permissions checking
- [ ] Factory pattern edge cases
  - Singleton behavior
  - Re-initialization handling
  - Concurrent factory access

**New Test Files**:
- `tests/core/storage/storage-factory.test.ts` (expand existing)

---

### Phase 4: Integration & E2E (Medium Priority)

#### [ ] Task 4.1: Fix Existing Integration Tests
**Files**: Integration test suite

**Issues to Fix**:
- [ ] WebSocket integration test connection failure
  - Ensure WS server is running before tests
  - Add setup/teardown for WS server
  - Add retry logic for connection
- [ ] MCP config test syntax error
  - Add vitest globals to integration config
  - Fix `describe is not defined` error
  - Verify test runs correctly

**Files to Fix**:
- `tests/integration/ws-integration.test.ts`
- `tests/integration/mcp-config.test.ts`
- `vitest.integration.config.ts`

---

#### [ ] Task 4.2: Add E2E Test Suite
**New E2E Tests**:
- [ ] Complete approval flow (request → response → execution)
- [ ] Multi-agent conversation with tool usage
- [ ] Session persistence across restarts
- [ ] Export/import world functionality
- [ ] MCP server tool execution end-to-end

**New Test Files**:
- `tests/e2e/approval-flow.test.ts`
- `tests/e2e/multi-agent-tools.test.ts`
- `tests/e2e/session-persistence.test.ts`
- `tests/e2e/export-import.test.ts`

---

### Phase 5: Edge Cases & Polish (Low Priority)

#### [ ] Task 5.1: Activity Tracker Edge Cases
**File**: `activity-tracker.ts` (73.86% coverage)

**Gaps**: Lines 108-109, 113-131

**Test Coverage**:
- [ ] Boundary conditions for activity detection
- [ ] Concurrent activity tracking
- [ ] Activity cleanup and expiration
- [ ] Performance under high activity load

---

#### [ ] Task 5.2: Export Module Edge Cases
**File**: `export.ts` (57.77% coverage)

**Gaps**: Lines 197, 616, 624-705

**Test Coverage**:
- [ ] Large world exports (>1000 messages)
- [ ] Export with malformed data
- [ ] Export formatting edge cases
- [ ] Import validation

---

## Testing Infrastructure Improvements

### [ ] Task 6.1: Mock Infrastructure
- [ ] Create reusable LLM provider mocks
- [ ] Create MCP server mock framework
- [ ] Create SQLite test database fixtures
- [ ] Add test data generators for realistic scenarios

**New Files**:
- `tests/__mocks__/llm-providers.ts`
- `tests/__mocks__/mcp-servers.ts`
- `tests/fixtures/database-states.ts`
- `tests/helpers/data-generators.ts`

---

### [ ] Task 6.2: Test Utilities
- [ ] Add test assertion helpers for events
- [ ] Add test helpers for message verification
- [ ] Add performance benchmarking utilities
- [ ] Add coverage reporting enhancements

**New Files**:
- `tests/helpers/event-assertions.ts`
- `tests/helpers/message-assertions.ts`
- `tests/helpers/performance-utils.ts`

---

### [ ] Task 6.3: CI/CD Integration
- [ ] Set up coverage thresholds in vitest config
- [ ] Add coverage badge to README
- [ ] Configure coverage failure on regression
- [ ] Add integration test workflow

**Files to Update**:
- `vitest.config.ts`
- `.github/workflows/test.yml` (if exists)
- `README.md`

---

## Success Criteria

### Coverage Targets
- [ ] Overall statement coverage: >60% (currently 32.56%)
- [ ] Core business logic (core/): >80%
- [ ] LLM providers: >50%
- [ ] MCP server registry: >60%
- [ ] Approval system: >80%
- [ ] Storage layer: >70%

### Quality Metrics
- [ ] All existing tests continue to pass
- [ ] No regression in test performance
- [ ] Integration tests run reliably
- [ ] E2E tests cover critical user flows

### Documentation
- [ ] Update testing guide in docs/
- [ ] Document mock usage patterns
- [ ] Add examples for writing new tests
- [ ] Update README with coverage badge

---

## Risk Assessment

### High Risk Areas
1. **LLM Provider Testing**: Mocking complex streaming APIs requires careful design
2. **MCP Registry**: Large surface area (2000+ lines) will take significant time
3. **SQLite Concurrent Access**: Race conditions hard to reproduce reliably

### Mitigation Strategies
1. Use real provider response samples for mocks
2. Break MCP testing into smaller, focused test files
3. Use deterministic concurrency testing with controlled timing
4. Start with most critical paths, expand coverage iteratively

---

## Timeline Estimate

- **Phase 1** (Critical Path): 2-3 weeks
  - LLM Providers: 5 days
  - MCP Registry: 7 days
  - Approval System: 3 days

- **Phase 2** (Storage Layer): 1-2 weeks
  - SQLite Testing: 7 days
  - Queue Investigation: 2 days

- **Phase 3** (Orchestration): 1 week
  - LLM Manager: 4 days
  - Storage Factory: 1 day

- **Phase 4** (Integration/E2E): 1 week
  - Fix existing tests: 2 days
  - New E2E tests: 3 days

- **Phase 5** (Polish): 3-4 days

**Total Estimated Time**: 6-8 weeks for comprehensive coverage improvement

---

## Dependencies

- No blocking dependencies for Phase 1-2
- Phase 3 depends on Phase 1 completion (LLM providers must be tested first)
- Phase 4 depends on Phase 1-3 (integration tests need stable unit tests)
- Infrastructure improvements (Task 6.x) can proceed in parallel

---

## Open Questions

1. Should we aim for 100% coverage on critical paths, or is 80% sufficient?
2. Do we need contract tests with real LLM APIs, or are mocks sufficient?
3. Should integration tests run as part of standard test suite or separately?
4. What's the acceptable test execution time for the full suite?
5. Should we add mutation testing to verify test quality?

---

## Notes

- Current test suite runs in ~5 seconds with good performance
- 41 test files with 518 tests is a solid foundation
- Event system and message handling are very well tested
- Focus should be on under-tested integration points
- Consider adding performance benchmarks during testing improvements
