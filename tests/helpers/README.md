# Test Helpers

Reusable utilities to reduce test duplication and improve maintainability.

## World Test Setup (`world-test-setup.ts`)

Provides utilities for world creation/deletion using **real in-memory storage** (not mocks).

### Quick Start

```typescript
import { setupTestWorld } from '../helpers/world-test-setup';

describe('My Test Suite', () => {
  const { worldId, getWorld } = setupTestWorld({
    name: 'my-test-world',
    turnLimit: 10
  });
  
  test('should work with world', async () => {
    const world = await getWorld();
    expect(world).toBeTruthy();
    expect(world.id).toBe(worldId());
  });
});
```

### Manual Cleanup

For tests that need more control:

```typescript
import { createTestWorld } from '../helpers/world-test-setup';

test('manual test', async () => {
  const { worldId, getWorld, cleanup } = await createTestWorld();
  
  try {
    const world = await getWorld();
    // ... test code
  } finally {
    await cleanup();
  }
});
```

### Multiple Worlds

```typescript
import { createTestWorlds, cleanupTestWorlds } from '../helpers/world-test-setup';

test('multiple worlds', async () => {
  const worlds = await createTestWorlds([
    { name: 'world-1' },
    { name: 'world-2' }
  ]);
  
  try {
    // ... test code
  } finally {
    await cleanupTestWorlds(worlds);
  }
});
```

## Storage Factory (`storage-factory.ts`)

Provides factory functions for creating **real in-memory storage** instances with test data.

### Basic Storage

```typescript
import { createTestStorage } from '../helpers/storage-factory';

test('storage test', async () => {
  const storage = createTestStorage();
  // ... test code
});
```

### Pre-populated Storage

```typescript
import { 
  createStorageWithWorld,
  createStorageWithAgents,
  createStorageWithChat 
} from '../helpers/storage-factory';

test('with world', async () => {
  const { storage, worldId, world } = await createStorageWithWorld();
  // storage has one world pre-loaded
});

test('with agents', async () => {
  const { storage, worldId, agents } = await createStorageWithAgents(3);
  // storage has 1 world + 3 agents
});

test('with chat', async () => {
  const { storage, worldId, agents, chatId, chat } = await createStorageWithChat(2);
  // storage has 1 world + 2 agents + 1 chat
});
```

### Test Data Factories

Create test data objects without storage:

```typescript
import { 
  createTestWorldData,
  createTestAgentData,
  createTestChatData 
} from '../helpers/storage-factory';

const world = createTestWorldData({ name: 'Custom World' });
const agent = createTestAgentData({ model: 'gpt-4o' });
const chat = createTestChatData(worldId, { name: 'Custom Chat' });
```

## Key Principles

1. **Use Real Storage**: Always use `MemoryStorage` instead of mocks for unit tests
2. **Only Mock LLMs**: Mock LLM providers (OpenAI, Anthropic, etc.), not storage
3. **Test Isolation**: Each test gets a clean storage instance
4. **Cleanup Guaranteed**: `setupTestWorld` automatically cleans up in `afterEach`

## Benefits

- **~300-350 lines saved** from world creation/deletion patterns
- **~400-500 lines saved** from storage mock duplication
- **Consistent patterns** across all tests
- **Easier maintenance** - update helpers, not every test
- **Real behavior** - tests use actual storage implementation

## Migration Example

### Before

```typescript
describe('My Test', () => {
  let worldId: string;

  beforeEach(async () => {
    const world = await createWorld({
      name: 'test-world',
      turnLimit: 5
    });
    worldId = world!.id;
  });

  afterEach(async () => {
    if (worldId) {
      await deleteWorld(worldId);
    }
  });

  test('my test', async () => {
    const world = await getWorld(worldId);
    // test code
  });
});
```

### After

```typescript
import { setupTestWorld } from '../helpers/world-test-setup';

describe('My Test', () => {
  const { worldId, getWorld } = setupTestWorld({
    name: 'test-world',
    turnLimit: 5
  });

  test('my test', async () => {
    const world = await getWorld();
    // test code
  });
});
```

**Lines saved: 13 → 4 = 9 lines saved per test file!**
