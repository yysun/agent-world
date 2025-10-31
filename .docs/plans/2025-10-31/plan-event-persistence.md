# Implementation Plan: Event Persistence Integration

**Date:** 2025-10-31  
**Status:** ✅ **COMPLETED**  
**Priority:** High (Critical Gap)

## Implementation Status

**✅ All tasks completed successfully**
- ✅ Event storage integrated with World event emitter
- ✅ All 12 integration tests passing
- ✅ Full test suite passing (667 tests)
- ✅ Zero regressions
- ✅ Event persistence working for all event types (message, SSE, tool, system)

## Problem Statement

The event storage infrastructure was added in commit 2c0b41c but is **not integrated** with the World event emitter. All events emitted via `world.eventEmitter.emit()` are only in-memory and not persisted to storage, breaking:
- Event audit trails
- Event replay capabilities  
- Debugging/troubleshooting
- Event-driven features that require persistence

## Architecture Review Findings

### ✅ What Works
- Event storage implementations (Memory, File, SQLite) are complete and tested
- All tests correctly use memory storage (not SQLite)
- Event storage API is well-designed with proper interfaces

### ❌ Critical Gap
- **No integration** between `World.eventEmitter` and `EventStorage`
- Events are emitted but never saved to storage
- No mechanism to retrieve historical events from storage

## Solution: Automatic Event Persistence (Option 1)

**Why This Approach:**
- Zero changes needed in existing event publishers
- Centralized persistence logic (single point of control)
- Easy to disable for tests (optional field)
- Consistent behavior across all event types
- Minimal performance overhead

## Implementation Tasks

### Task 1: Update World Interface
**File:** `core/types.ts`

Add optional `eventStorage` field to World interface:

```typescript
export interface World {
  // ... existing fields ...
  eventStorage?: EventStorage; // Optional for backward compatibility
}
```

**Rationale:** Optional field ensures backward compatibility with existing tests and code.

---

### Task 2: Add Event Storage to Storage Factory
**File:** `core/storage/storage-factory.ts`

Update `StorageAPI` interface and implementation:

```typescript
// Add to imports
import { EventStorage, createMemoryEventStorage, createSQLiteEventStorage } from './eventStorage/index.js';

// Add to StorageAPI interface
export interface StorageAPI {
  // ... existing methods ...
  
  // Event storage
  eventStorage: EventStorage;
}

// Update createStorageWithWrappers()
export async function createStorageWithWrappers(): Promise<StorageAPI> {
  const storage = await createStorage();
  
  // Create event storage based on storage type
  let eventStorage: EventStorage;
  if (isMemoryStorage(storage)) {
    eventStorage = createMemoryEventStorage();
  } else {
    // For SQLite storage
    const db = (storage as any).db; // Access underlying DB
    eventStorage = await createSQLiteEventStorage(db);
  }
  
  return {
    // ... existing wrappers ...
    eventStorage
  };
}
```

**Rationale:** Centralizes event storage creation with the main storage system.

---

### Task 3: Create Event Persistence Helper
**File:** `core/events.ts` (add new function)

Add `setupEventPersistence()` function:

```typescript
/**
 * Setup automatic event persistence listeners on World event emitter.
 * Should be called once during World initialization.
 * 
 * Events are persisted asynchronously - failures are logged but don't block emission.
 */
export function setupEventPersistence(world: World): void {
  if (!world.eventStorage) {
    loggerPublish.debug('Event storage not configured - events will not be persisted', { worldId: world.id });
    return;
  }
  
  const storage = world.eventStorage;
  
  // Persist message events
  world.eventEmitter.on('message', async (event: WorldMessageEvent) => {
    try {
      await storage.saveEvent({
        id: event.messageId,
        worldId: world.id,
        chatId: event.chatId || null,
        type: 'message',
        payload: {
          content: event.content,
          sender: event.sender,
          replyToMessageId: event.replyToMessageId
        },
        meta: {
          sender: event.sender,
          chatId: event.chatId
        },
        createdAt: event.timestamp
      });
    } catch (error) {
      loggerPublish.warn('Failed to persist message event', {
        worldId: world.id,
        messageId: event.messageId,
        error: error instanceof Error ? error.message : error
      });
    }
  });
  
  // Persist SSE events
  world.eventEmitter.on('sse', async (event: WorldSSEEvent) => {
    try {
      await storage.saveEvent({
        id: event.messageId,
        worldId: world.id,
        chatId: null, // SSE events are not chat-specific
        type: 'sse',
        payload: {
          agentName: event.agentName,
          type: event.type,
          content: event.content,
          error: event.error,
          usage: event.usage
        },
        meta: {
          agentName: event.agentName,
          sseType: event.type
        },
        createdAt: new Date()
      });
    } catch (error) {
      loggerPublish.warn('Failed to persist SSE event', {
        worldId: world.id,
        messageId: event.messageId,
        error: error instanceof Error ? error.message : error
      });
    }
  });
  
  // Persist tool events (world channel)
  world.eventEmitter.on('world', async (event: WorldToolEvent) => {
    try {
      await storage.saveEvent({
        id: event.messageId,
        worldId: world.id,
        chatId: null,
        type: 'tool',
        payload: {
          agentName: event.agentName,
          type: event.type,
          toolExecution: event.toolExecution
        },
        meta: {
          agentName: event.agentName,
          toolType: event.type
        },
        createdAt: new Date()
      });
    } catch (error) {
      loggerPublish.warn('Failed to persist tool event', {
        worldId: world.id,
        messageId: event.messageId,
        error: error instanceof Error ? error.message : error
      });
    }
  });
  
  // Persist system events
  world.eventEmitter.on('system', async (event: WorldSystemEvent) => {
    try {
      await storage.saveEvent({
        id: event.messageId,
        worldId: world.id,
        chatId: null,
        type: 'system',
        payload: event.content,
        meta: {},
        createdAt: event.timestamp
      });
    } catch (error) {
      loggerPublish.warn('Failed to persist system event', {
        worldId: world.id,
        messageId: event.messageId,
        error: error instanceof Error ? error.message : error
      });
    }
  });
  
  loggerPublish.debug('Event persistence setup complete', { worldId: world.id });
}
```

**Rationale:** 
- Single function handles all event types
- Async persistence doesn't block event emission
- Errors are logged but don't crash the system
- Easy to test and maintain

---

### Task 4: Integrate in World Creation
**File:** `core/managers.ts`

Update `createWorld()` and `getWorld()`:

```typescript
// In createWorld() - after world object creation
export async function createWorld(params: CreateWorldParams): Promise<World | null> {
  await ensureInitialization();
  
  // ... existing world creation code ...
  
  const worldData: World = {
    // ... existing fields ...
    eventStorage: storageWrappers!.eventStorage
  };
  
  // Setup event persistence
  setupEventPersistence(worldData);
  
  // ... rest of function ...
}

// In getWorld() - after loading world
export async function getWorld(worldId: string): Promise<World | null> {
  await ensureInitialization();
  
  const worldData = await storageWrappers!.loadWorld(worldId);
  if (!worldData) return null;
  
  // Restore EventEmitter (not serialized)
  worldData.eventEmitter = new EventEmitter();
  
  // Restore event storage
  worldData.eventStorage = storageWrappers!.eventStorage;
  
  // Setup event persistence
  setupEventPersistence(worldData);
  
  // ... rest of function ...
}
```

**Rationale:** Ensures all World instances have event persistence configured.

---

### Task 5: Add Integration Tests
**File:** `tests/core/event-persistence.test.ts` (new file)

Create comprehensive tests:

```typescript
/**
 * Event Persistence Integration Tests
 * 
 * Verifies that events emitted via World.eventEmitter are automatically
 * persisted to event storage.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { createWorld, getWorld } from '../../core/managers.js';
import { publishMessage, publishSSE, publishToolEvent, publishEvent } from '../../core/events.js';
import { createMemoryStorage } from '../../core/storage/memory-storage.js';

describe('Event Persistence Integration', () => {
  let worldId: string;
  
  beforeEach(async () => {
    const world = await createWorld({ 
      name: 'test-event-persistence',
      turnLimit: 5 
    });
    worldId = world!.id;
  });
  
  test('should persist message events when emitted', async () => {
    const world = await getWorld(worldId);
    expect(world).toBeTruthy();
    
    // Emit a message
    publishMessage(world!, 'Hello World', 'user-1', world!.currentChatId);
    
    // Small delay for async persistence
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify event was persisted
    const events = await world!.eventStorage!.getEventsByWorldAndChat(
      worldId, 
      world!.currentChatId
    );
    
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('message');
    expect(events[0].payload.content).toBe('Hello World');
    expect(events[0].payload.sender).toBe('user-1');
  });
  
  test('should persist SSE events when emitted', async () => {
    const world = await getWorld(worldId);
    
    publishSSE(world!, {
      agentName: 'test-agent',
      type: 'start',
      messageId: 'msg-123'
    });
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const events = await world!.eventStorage!.getEventsByWorldAndChat(
      worldId,
      null,
      { types: ['sse'] }
    );
    
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].type).toBe('sse');
    expect(events[0].payload.agentName).toBe('test-agent');
  });
  
  test('should persist multiple events in sequence', async () => {
    const world = await getWorld(worldId);
    
    publishMessage(world!, 'First', 'user-1', world!.currentChatId);
    publishMessage(world!, 'Second', 'agent-1', world!.currentChatId);
    publishMessage(world!, 'Third', 'user-1', world!.currentChatId);
    
    await new Promise(resolve => setTimeout(resolve, 200));
    
    const events = await world!.eventStorage!.getEventsByWorldAndChat(
      worldId,
      world!.currentChatId
    );
    
    expect(events).toHaveLength(3);
    expect(events[0].payload.content).toBe('First');
    expect(events[1].payload.content).toBe('Second');
    expect(events[2].payload.content).toBe('Third');
  });
  
  test('should handle persistence errors gracefully', async () => {
    const world = await getWorld(worldId);
    
    // Mock storage to throw error
    const originalSave = world!.eventStorage!.saveEvent;
    world!.eventStorage!.saveEvent = async () => {
      throw new Error('Storage failure');
    };
    
    // Should not throw
    expect(() => {
      publishMessage(world!, 'Test', 'user-1', world!.currentChatId);
    }).not.toThrow();
    
    // Restore
    world!.eventStorage!.saveEvent = originalSave;
  });
  
  test('should retrieve events by sequence', async () => {
    const world = await getWorld(worldId);
    
    for (let i = 1; i <= 5; i++) {
      publishMessage(world!, `Message ${i}`, 'user-1', world!.currentChatId);
    }
    
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const events = await world!.eventStorage!.getEventsByWorldAndChat(
      worldId,
      world!.currentChatId,
      { sinceSeq: 2 }
    );
    
    expect(events.length).toBeGreaterThanOrEqual(3);
  });
});
```

**Rationale:** Ensures event persistence works end-to-end in realistic scenarios.

---

### Task 6: Update Existing Tests
**Files:** Various test files

Add `eventStorage` field where World objects are manually created:

```typescript
// Pattern to find and update:
const world: World = {
  // ... existing fields ...
  eventEmitter: new EventEmitter(),
  // ADD THIS:
  eventStorage: createMemoryEventStorage()
};
```

**Estimated files to update:** ~10-15 test files

**Rationale:** Prevents tests from failing due to missing optional field.

---

### Task 7: Add Event Retrieval Helper (Optional)
**File:** `core/managers.ts` (add new function)

```typescript
/**
 * Get historical events for a world/chat
 */
export async function getWorldEvents(
  worldId: string,
  chatId?: string | null,
  options?: {
    sinceSeq?: number;
    sinceTime?: Date;
    limit?: number;
    types?: string[];
  }
): Promise<StoredEvent[]> {
  await ensureInitialization();
  
  const world = await getWorld(worldId);
  if (!world?.eventStorage) {
    throw new Error('Event storage not available');
  }
  
  return world.eventStorage.getEventsByWorldAndChat(
    worldId,
    chatId ?? null,
    options
  );
}
```

**Rationale:** Provides convenient API for retrieving historical events.

---

### Task 8: Run Test Suite
**Command:** `npm test`

Verify:
- [ ] All existing tests pass
- [ ] New event-persistence.test.ts passes
- [ ] No regressions in event emission
- [ ] No performance degradation

---

## Implementation Checklist

- [x] Task 1: Update World interface ✅
- [x] Task 2: Add event storage to storage factory ✅
- [x] Task 3: Create setupEventPersistence() helper ✅
- [x] Task 4: Integrate in createWorld/getWorld ✅
- [x] Task 5: Add integration tests ✅
- [x] Task 6: Update test environment (vitest-setup.ts) ✅
- [x] Task 7: Run full test suite and validate ✅

**Completion Date:** 2025-10-31  
**All 667 tests passing (19 skipped)**

## Success Criteria

1. ✅ All events emitted via `world.eventEmitter` are persisted to storage
2. ✅ Event persistence is automatic (no code changes in publishers)
3. ✅ Persistence failures don't crash or block event emission
4. ✅ Tests use memory storage (fast, isolated)
5. ✅ Production uses SQLite storage (durable)
6. ✅ All existing tests pass
7. ✅ New integration tests verify persistence

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Performance overhead | Async persistence, minimal serialization |
| Storage failures | Try-catch with logging, don't block |
| Test failures | Make eventStorage optional, update tests incrementally |
| Memory leaks | Use bounded event storage in tests |

## Timeline Estimate

- Tasks 1-4: 1-2 hours (core implementation)
- Task 5: 1 hour (integration tests)
- Task 6: 1-2 hours (update existing tests)
- Task 7: 30 minutes (optional API)
- Task 8: 30 minutes (validation)

**Total: 4-6 hours**

## Dependencies

- ✅ Event storage implementations (already complete)
- ✅ Storage factory (already exists)
- ✅ Event emitter system (already exists)

## Follow-up Work

After implementation:
1. Add event replay functionality
2. Add event-based debugging tools
3. Add event filtering/search API
4. Add event retention policies
5. Add event export/import
