# WorldClass Integration Tests

This directory contains comprehensive integration tests for the WorldClass OOP wrapper that validate all CRUD operations for worlds, agents, and chats.

## Overview

Four comprehensive test suites validate the complete WorldClass interface:

- **World CRUD** - Creation, updates, export, deletion, utility methods
- **Agent CRUD** - Multi-provider agents, memory management, lifecycle operations  
- **Chat CRUD** - Session management, restoration, currentChatId handling
- **Comprehensive** - Integrated workflows across all functionality

All tests follow the established pattern from `test-chat.core.ts` with proper cleanup, validation, and error handling.

## Test Structure

### Individual Test Suites

1. **`test-world-class-world.ts`** - World CRUD Operations
   - World creation, update, reload, export
   - WorldClass utility methods (toString, toJSON, getters)
   - Kebab-case conversion validation
   - Stateless behavior verification
   - World deletion and cleanup

2. **`test-world-class-agent.ts`** - Agent CRUD Operations
   - Agent creation with various providers (Anthropic, OpenAI)
   - Agent retrieval, update, and listing
   - Agent memory clearing functionality
   - Agent deletion and error handling
   - Multiple agent management scenarios

3. **`test-world-class-chat.ts`** - Chat CRUD Operations
   - Chat creation and session management
   - Chat listing and restoration
   - currentChatId state management
   - Chat deletion and validation
   - Multiple chat session workflows

4. **`test-world-class-comprehensive.ts`** - Integrated Workflows
   - Complex multi-entity scenarios
   - Cross-functional operations (agents + chats + world updates)
   - Realistic workflow patterns
   - Advanced state management validation

### Test Runner

- **`test-world-class-runner.ts`** - Automated test execution
  - Runs all test suites in sequence
  - Provides comprehensive reporting
  - Performance metrics and timing
  - CI/CD ready with proper exit codes

## Running Tests

### Run Individual Tests

```bash
# Test world operations
npx tsx integration/test-world-class-world.ts

# Test agent operations  
npx tsx integration/test-world-class-agent.ts

# Test chat operations
npx tsx integration/test-world-class-chat.ts

# Test comprehensive workflows
npx tsx integration/test-world-class-comprehensive.ts
```

### Run All Tests with Summary

```bash
# Run all tests with comprehensive reporting
npx tsx integration/test-world-class-runner.ts
```

**Sample Output:**
```
🧪 WorldClass Integration Test Runner
============================================================
Running 4 integration test suites...

📋 WorldClass World CRUD Operations
✅ PASSED: test-world-class-world.ts (514ms)

📋 WorldClass Agent CRUD Operations  
✅ PASSED: test-world-class-agent.ts (1048ms)

📋 WorldClass Chat CRUD Operations
✅ PASSED: test-world-class-chat.ts (536ms)

📋 WorldClass Comprehensive Operations
✅ PASSED: test-world-class-comprehensive.ts (902ms)

🎉 ALL TESTS PASSED!
Total Duration: 3000ms (3.00s)
```

## Test Features

### Comprehensive Coverage
- ✅ World CRUD operations
- ✅ Agent CRUD operations
- ✅ Chat CRUD operations
- ✅ Cross-functional workflows
- ✅ Error handling scenarios
- ✅ State consistency validation

### Real-World Scenarios
- Multiple agents with different providers
- Complex chat session management
- Integrated world/agent/chat operations
- Memory management and cleanup
- Performance and timing validation

### Quality Assurance
- Automatic cleanup on test completion
- Error handling and recovery
- Consistent test patterns
- Color-coded output for clarity
- Detailed assertion messages

## Test Architecture

### Design Principles
1. **Isolation** - Each test creates its own world for independence
2. **Cleanup** - Automatic cleanup ensures no test artifacts remain
3. **Validation** - Comprehensive assertions verify expected behavior
4. **Consistency** - Common patterns across all test suites
5. **Readability** - Clear structure and helpful output messages

### Following Existing Patterns
The tests follow the established pattern from `test-chat.core.ts`:
- Consistent color helpers for output
- Structured test phases with clear descriptions
- Proper error handling and cleanup
- Detailed logging and validation
- Exit code management for CI/CD

## Integration with Development Workflow

### Development Testing
```bash
# Quick validation during development
npx tsx integration/test-world-class-world.ts

# Full validation before commits
npx tsx integration/test-world-class-runner.ts
```

### CI/CD Integration
The test runner provides proper exit codes:
- `0` - All tests passed
- `1` - One or more tests failed

### Performance Monitoring
The test runner provides timing metrics:
- Individual test duration
- Total execution time
- Performance comparisons
- Fastest/slowest test identification

## Test Data and Cleanup

### Test Isolation
- Each test creates a unique world with generated ID
- No shared state between test runs
- Automatic cleanup prevents conflicts

### Cleanup Strategy
- `try/finally` blocks ensure cleanup runs
- Error handling during cleanup
- Double cleanup (on error + finally)
- Clear logging of cleanup operations

## Contributing

When adding new WorldClass functionality:

1. Add corresponding tests to appropriate test file
2. Follow existing test patterns and structure
3. Include comprehensive assertions
4. Add proper cleanup and error handling
5. Update this README with new test descriptions

### Test Naming Convention
- Test files: `test-world-class-[category].ts`
- Test functions: `runWorldClass[Category]Test()`
- Clear, descriptive test step names
- Consistent assertion messages
