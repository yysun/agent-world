# Agent World Test Suite

## Overview
This directory contains the comprehensive test suite for Agent World, including unit tests, integration tests, and end-to-end tests.

## Quick Start

```bash
npm test                        # Run all unit tests
npm test -- specific.test       # Run specific test file
npm run test:watch              # Watch mode with hot reload
npm run test:ui                 # Visual test UI
npm run test:coverage           # Coverage report with v8
npm run integration             # Integration tests
npm run test:db                 # Database migration tests
npm run test:electron:e2e       # Real Electron desktop E2E tests (full build + run)
npm run test:electron:e2e:run   # Electron E2E run only (skip builds)
```

## Test Structure
```
tests/
├── __mocks__/         # Manual module mocks (e.g. pino)
├── core/              # Core system unit tests
│   └── storage/       # Storage layer tests (migration-runner.test.ts)
├── api/               # API endpoint tests
├── cli/               # CLI command tests
├── db/                # Standalone database migration tests
├── electron/          # Electron unit tests (main / preload / renderer layers)
├── electron-e2e/      # Real Electron desktop Playwright E2E tests
├── helpers/           # Shared test utilities (world-test-setup, storage-factory)
├── integration/       # Integration tests (migration-paths.test.ts)
├── manual/            # Manual test scripts and checklists
├── opik/              # LLM Assessment & Robustness tests (LLM-as-a-Judge)
└── web-domain/        # Web/renderer domain unit tests
```

## Electron Unit Tests (`electron/`)

Layer-oriented unit tests for the Electron runtime:

| Sub-directory | Scope |
|---|---|
| `electron/main/` | Main-process lifecycle, window management, IPC registration |
| `electron/preload/` | Preload bridge contracts, invoke guards, payload normalization |
| `electron/renderer/` | Renderer streaming/activity state and domain orchestration helpers |
| `electron/ipc-handlers.test.ts` | Cross-layer IPC handler contract tests |

All Electron unit tests run in-memory with no real LLM calls. See `tests/electron/README.md` for naming conventions.

## Electron Desktop E2E Tests (`electron-e2e/`)

Playwright tests that launch the **real compiled Electron app** and exercise full desktop flows using actual LLM calls (Google Gemini). Requires `GOOGLE_API_KEY`.

```bash
npm run test:electron:e2e        # Full build + run
npm run test:electron:e2e:run    # Run only (skip builds)
```

See `tests/electron-e2e/README.md` for full prerequisites, test descriptions, and debugging guidance.

## Web Domain Tests (`web-domain/`)

Unit tests for renderer/web domain logic: agent filtering, HITL flows, SSE log events, tool execution, chat state, history search, and more. All run in-memory with no real providers.

## Test Helpers (`helpers/`)

Shared utilities used across test suites:

- **`world-test-setup.ts`** — `setupTestWorld()` helper for world creation/deletion with real in-memory storage; reduces boilerplate in `describe` blocks.
- **`storage-factory.ts`** — Creates real in-memory storage instances for tests that need direct storage access.

## Manual Tests (`manual/`)

Step-by-step manual test scripts and checklists for scenarios that are impractical to automate (e.g., multi-agent collaboration flows). Not run by CI.

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
