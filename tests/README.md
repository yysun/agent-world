# Agent World Test Suite

## Overview
This directory contains the comprehensive test suite for Agent World, including unit tests, integration tests, and end-to-end tests.

## Quick Start

```bash
npm test                    # Run all tests
npm test -- specific.test   # Run specific test
npm run test:watch         # Watch mode with hot reload
npm run test:ui            # Visual test UI
npm run test:coverage      # Coverage report with v8
npm run integration        # Integration tests
npm run test:db            # Database migration tests
```

## Test Structure
```
tests/
├── core/              # Core system unit tests
│   ├── storage/       # Storage layer tests (migration-runner.test.ts)
├── api/               # API endpoint tests
├── cli/               # CLI command tests
├── db/                # Standalone database tests (migration-tests.ts)
├── integration/       # Integration tests (migration-paths.test.ts)
└── web/               # Web interface tests
```

## Database Testing

All tests use **temporary SQLite databases** to avoid conflicts with production data:

| Test Type | Database Location | Migration Files | Purpose |
|-----------|------------------|-----------------|---------|
| **Unit Tests** | `/tmp/test-migrations-*.db` | Mock SQL (created in test) | Test migration runner logic |
| **Integration Tests** | `/tmp/test-migration-paths-*.db` | Real production SQL files | Test actual migration paths |
| **Standalone Tests** | `/tmp/agent-world-tests/*.db` | Real system (initializeWithDefaults) | Test complete DB initialization |

### Migration Path Coverage

See `tests/db/README.md` for detailed migration test coverage including:
- Fresh database (v0 → v9)
- Historical migrations (v1→v9, v4→v9, v7→v9)
- Incremental steps (v4→v5, v5→v6, v6→v7, v7→v8, v8→v9)
- Data preservation and integrity
- All 10 production migration files tested

## Mock Strategy

### Global Setup (`tests/vitest-setup.ts`)

Provides consistent mocks for all unit tests:
- ✅ File system operations (`fs`, `fs/promises`)
- ✅ Storage factory returns **real MemoryStorage** instances
- ✅ LLM providers (OpenAI, Anthropic, Google)
- ✅ Database operations (SQLite)

**Key Feature**: Tests use **real MemoryStorage** class instead of mocks - no manual sync needed, automatic API compatibility.

### When to Override

Most tests should rely on global setup. Override only for:
1. **Testing error conditions** - Simulate storage failures
2. **Clearing storage mid-test** - Use `__testUtils.clearStorage()`
3. **Custom test scenarios** - Direct MemoryStorage instantiation

## Writing Tests

### Basic Test Pattern

```typescript
import { createWorld, createAgent } from '../../core/index.js';

test('creates agent', async () => {
  const world = await createWorld({ name: 'Test' });
  const agent = await createAgent(world.id, { name: 'Agent1' });
  expect(agent).toBeTruthy();
});
```

### Testing with Storage

```typescript
test('persists agent memory', async () => {
  const world = await createWorld({ name: 'Test' });
  const agent = await createAgent(world.id, { name: 'Agent1' });
  
  agent.memory.push({ role: 'user', content: 'Hello' });
  
  const storage = await createStorageWithWrappers();
  await storage.saveAgent(world.id, agent);
  
  const loaded = await storage.loadAgent(world.id, agent.id);
  expect(loaded.memory).toHaveLength(1);
});
```

### Best Practices

- Use descriptive test names
- Use `.js` extensions in imports (TypeScript requirement)
- Always `await` async operations
- Rely on global mocks unless custom behavior needed

## Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- tests/core/message-saving.test.ts

# Run tests in watch mode
npm test -- --watch

# Run with coverage
npm test -- --coverage

# Run integration tests
npm run integration

# Run database tests
npm run test:db

# Run specific test by name
npm test -- -t "should save agent"
```

## Common Issues

**"Cannot find module" errors**  
Use `.js` extensions: `import { x } from '../../core/index.js';`

**Tests hang or timeout**  
Check for missing `await` keywords on promises

**Mock not working**  
Verify you're not overriding global mocks unnecessarily

## Contributing

When adding tests:
1. Follow existing file structure
2. Use global mocks unless custom behavior needed
3. Add descriptive test names
4. Ensure test isolation
5. Update documentation for new patterns
