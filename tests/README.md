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
npm run test:integration   # Integration tests
```

## Test Structure
```
tests/
├── core/              # Core system unit tests
│   ├── vitest-setup.ts  # Global test setup and mocks
│   ├── agents/        # Agent-specific tests
│   ├── events/        # Event system tests
│   ├── storage/       # Storage layer tests
│   └── shared/        # Shared test utilities
├── api/               # API endpoint tests
├── cli/               # CLI command tests
├── integration/       # Integration tests
└── web/               # Web interface tests
```

## Mock Strategy

### Global Setup (`tests/vitest-setup.ts`)

The global setup file provides consistent mocks for all unit tests. It is automatically loaded by Vitest before running tests.

**What it mocks:**
- ✅ File system operations (`fs`, `fs/promises`)
- ✅ Storage factory returns **real MemoryStorage** instances
- ✅ LLM providers (OpenAI, Anthropic, Google)
- ✅ External dependencies (`path`, `crypto`, `nanoid`, `dotenv`)
- ✅ Database operations (SQLite)

**Key Features:**
- **Real MemoryStorage**: Uses actual `MemoryStorage` class instead of mocks (~400 lines of mock code eliminated!)
- **Shared instance**: All storage functions return the same MemoryStorage instance for data persistence
- **Full StorageAPI**: Tests run against complete, production-ready implementation
- **Test isolation**: Storage can be cleared with `__testUtils.clearStorage()` when needed
- **No maintenance burden**: MemoryStorage automatically stays in sync with StorageAPI changes

### When to Use Global Setup

**Default for all unit tests** - Most tests should rely on global setup without any modifications.

```typescript
// ✅ Good - Uses real MemoryStorage via global setup
import { createWorld, createAgent } from '../../core/index.js';

describe('My Feature', () => {
  test('should work', async () => {
    const world = await createWorld({ name: 'Test' });
    const agent = await createAgent(world, { name: 'Bot', model: 'gpt-4' });
    // Real MemoryStorage handles all operations!
  });
});
```

**Why this works:** The storage-factory mock returns a real `MemoryStorage` instance that implements the full `StorageAPI` interface. All world/agent/chat operations use actual production code, just in-memory instead of on disk.

### When to Use Local Overrides

Use local overrides only when you need to:

1. **Test error conditions**
   ```typescript
   // Override MemoryStorage to simulate failures
   const { __testUtils } = await vi.importMock('../../core/storage/storage-factory');
   const storage = __testUtils.getStorage();
   storage.saveWorld = vi.fn().mockRejectedValue(new Error('Storage full'));
   ```

2. **Clear storage mid-test** (rarely needed)
   ```typescript
   import { __testUtils } from '../../core/storage/storage-factory';
   
   test('should handle fresh state', async () => {
     // Clear all stored data
     __testUtils.clearStorage();
     
     const world = await createWorld({ name: 'Fresh' });
     // Storage is now empty
   });
   ```

3. **Use real MemoryStorage directly**
   ```typescript
   import { MemoryStorage } from '../../core/storage/memory-storage.js';
   
   test('should test storage directly', async () => {
     const storage = new MemoryStorage();
     await storage.saveWorld(worldData);
     const loaded = await storage.loadWorld(worldData.id);
     expect(loaded).toEqual(worldData);
   });
   ```

### Storage Implementation

#### Real MemoryStorage
Tests use **real `MemoryStorage`** class from `core/storage/memory-storage.ts`:

```typescript
// In tests/core/setup.ts
Example with custom storage:

```typescript
vi.mock('../../core/storage/storage-factory', async () => {
  const { MemoryStorage } = await vi.importActual('../../core/storage/memory-storage');
  let sharedStorage = new MemoryStorage();
  
  return {
    createStorageWrappers: () => sharedStorage,
    createStorageWithWrappers: async () => sharedStorage,
    getStorageWrappers: async () => sharedStorage,
    __testUtils: {
      clearStorage: () => { sharedStorage = new MemoryStorage(); },
      getStorage: () => sharedStorage
    }
  };
});
```

**Benefits:**
- ✅ Tests run against production code (not mocks)
- ✅ Automatic API compatibility (no manual sync needed)
- ✅ Full feature support (all StorageAPI methods)
- ✅ Deep cloning for data isolation (just like production)
- ✅ ~400 lines of mock code eliminated

#### Storage Operations

All operations use the real MemoryStorage implementation:

**World Operations:**
- `saveWorld(world)` - Deep clones and stores in Map
- `loadWorld(worldId)` - Returns deep clone from Map or `null`
- `deleteWorld(worldId)` - Removes from Map, returns boolean
- `listWorlds()` - Returns array of World objects
- `worldExists(worldId)` - Checks existence in Map

**Agent Operations:**
- `saveAgent(worldId, agent)` - Stores with composite key
- `loadAgent(worldId, agentId)` - Retrieves agent or `null`
- `deleteAgent(worldId, agentId)` - Removes agent
- `listAgents(worldId)` - Returns agent objects for world
- `saveAgentMemory(worldId, agentId, memory)` - Updates agent memory
- `archiveMemory(worldId, agentId, memory)` - Archives memory

**Chat Operations:**
- `saveChatData(worldId, chat)` - Stores chat
- `loadChatData(worldId, chatId)` - Retrieves chat
- `updateChatData(worldId, chatId, updates)` - Updates chat fields
- `deleteChatData(worldId, chatId)` - Removes chat
- `listChats(worldId)` - Returns all chats for world

**Batch Operations:**
- `saveAgentsBatch(worldId, agents)` - Saves multiple agents
- `loadAgentsBatch(worldId, agentIds)` - Loads multiple agents

**Memory Operations:**
- `getMemory(worldId, chatId?)` - Aggregates memory across agents
- `deleteMemoryByChatId(worldId, chatId)` - Removes chat messages

**WorldChat Operations:**
- `saveWorldChat(worldId, chatId, chat)` - Saves snapshot
- `loadWorldChat(worldId, chatId)` - Loads snapshot
- `loadWorldChatFull(worldId, chatId)` - Full snapshot with agents
- `restoreFromWorldChat(worldId, chat)` - Restores world state

**Integrity Operations:**
- `validateIntegrity(worldId, agentId?)` - Validates data
- `repairData(worldId, agentId?)` - Repairs corrupted data

#### LLM Provider Mocks
- `generateOpenAIResponse()` - Returns `'Mock OpenAI response'`
- `streamOpenAIResponse()` - Returns `'Mock OpenAI streaming response'`
- `generateAnthropicResponse()` - Returns `'Mock Anthropic response'`
- `streamAnthropicResponse()` - Returns `'Mock Anthropic streaming response'`
- `generateGoogleResponse()` - Returns `'Mock Google response'`
- `streamGoogleResponse()` - Returns `'Mock Google streaming response'`

## Writing Tests

### Best Practices

1. **Rely on global setup by default**
   ```typescript
   // ✅ Good - Clean and simple
   test('creates agent', async () => {
     const world = await createWorld({ name: 'Test' });
     const agent = await createAgent(world.id, { name: 'Agent1' });
     expect(agent).toBeTruthy();
   });
   ```

2. **Use stateful operations naturally**
   ```typescript
   // ✅ Good - Save and load work together
   test('persists agent memory', async () => {
     const world = await createWorld({ name: 'Test' });
     const agent = await createAgent(world.id, { name: 'Agent1' });
     
     // Add messages to agent
     agent.memory.push({ role: 'user', content: 'Hello' });
     
     // Save agent
     const storage = await createStorageWithWrappers();
     await storage.saveAgent(world.id, agent);
     
     // Load agent - memory is preserved
     const loaded = await storage.loadAgent(world.id, agent.id);
     expect(loaded.memory).toHaveLength(1);
   });
   ```

3. **Clear mocks between tests**
   ```typescript
   // ✅ Good - Already done in global setup
   // No action needed - beforeEach() clears all mocks automatically
   ```

4. **Use descriptive test names**
   ```typescript
   // ✅ Good
   test('should save agent with messageIds in memory', async () => { ... });
   
   // ❌ Bad
   test('test1', async () => { ... });
   ```

### Common Patterns

#### Testing World Creation
```typescript
test('creates world with default settings', async () => {
  const world = await createWorld({ name: 'Test World' });
  
  expect(world).toBeTruthy();
  expect(world.name).toBe('Test World');
  expect(world.agents.size).toBe(0);
});
```

#### Testing Agent Responses
```typescript
test('agent responds to messages', async () => {
  const world = await createWorld({ name: 'Test' });
  const agent = await createAgent(world.id, {
    name: 'Assistant',
    provider: LLMProvider.OPENAI,
    model: 'gpt-4'
  });
  
  await publishMessage(world, {
    content: 'Hello',
    sender: 'HUMAN',
    recipients: [agent.id]
  });
  
  // Global mock returns 'Mock OpenAI response'
  expect(agent.memory.length).toBeGreaterThan(0);
});
```

#### Testing Storage Persistence
```typescript
test('loads saved world data', async () => {
  const storage = await createStorageWithWrappers();
  
  const world = { id: 'world-1', name: 'Test World' };
  await storage.saveWorld(world);
  
  const loaded = await storage.loadWorld('world-1');
  expect(loaded).toEqual(world);
});
```

## Running Tests

### Run all tests
```bash
npm test
```

### Run specific test file
```bash
npm test -- tests/core/message-saving.test.ts
```

### Run tests in watch mode
```bash
npm test -- --watch
```

### Run tests with coverage
```bash
npm test -- --coverage
```

### Run only integration tests
```bash
npm run test:integration
```

## Debugging Tests

### Enable verbose output
```bash
npm test -- --verbose
```

### Run single test
```bash
npm test -- -t "should save agent with messageIds"
```

### Debug with Node inspector
```bash
node --inspect-brk node_modules/.bin/vitest run
```

## Common Issues

### Issue: "Cannot find module" errors
**Solution**: Ensure you're using `.js` extensions in imports (TypeScript compilation requirement)
```typescript
// ✅ Correct
import { createWorld } from '../../core/index.js';

// ❌ Wrong
import { createWorld } from '../../core/index';
```

### Issue: Tests hang or timeout
**Solution**: Check for unresolved promises or missing `await` keywords
```typescript
// ✅ Correct
await createWorld({ name: 'Test' });

// ❌ Wrong - Promise not awaited
createWorld({ name: 'Test' });
```

### Issue: Mock not working as expected
**Solution**: Check if you're overriding global mocks. Remove local mocks to use global setup.
```typescript
// ✅ Good - Uses global mock
const storage = await createStorageWithWrappers();

// ⚠️ May conflict - Local mock overrides global
vi.mock('../../core/storage/storage-factory', () => ({ ... }));
```

### Issue: Memory leaks or out-of-memory errors
**Solution**: Ensure stateful mocks are being used (fixed in global setup)
- Global setup uses Maps that are cleared between tests
- Avoid creating infinite loops in test logic

## Contributing

When adding new tests:
1. Follow the existing file structure
2. Use global mocks unless you need custom behavior
3. Add descriptive test names and comments
4. Ensure tests are isolated and don't depend on each other
5. Update this README if you add new testing patterns

## Questions?

See the conversation history or ask the team about:
- Mock strategy decisions
- Test isolation techniques
- Stateful vs stateless mocking
- Integration test patterns
