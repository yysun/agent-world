# Chat Title Duplicate Event Fix

**Date:** November 1, 2025  
**Status:** ✅ Completed

## Overview

Fixed duplicate `chat-title-updated` system events that occurred when multiple agents responded to the same message. The root cause was title generation triggering on each agent's SSE end event rather than waiting for all agents to complete.

## Problem Identified

### Symptom
Export logs showed duplicate `chat-title-updated` events:

```
22:23:37 ● [message] HUMAN: hi
22:23:37 ● [world] a1: response-start pending=1
22:23:37 ● [world] a2: response-start pending=2
22:23:37 ● [sse] a1: start
22:23:38 ● [sse] a1: end
22:23:38 ● [sse] a2: start
22:23:38 ● [message] a1: Hello! It's nice to meet you...
22:23:38 ● [world] a1: response-end pending=1
22:23:39 ● [sse] a2: end
22:23:39 ● [message] a2: How can I assist you today?
22:23:39 ● [world] a2: idle pending=0
22:23:39 ● [system] chat-title-updated
22:23:39 ● [system] chat-title-updated  ← DUPLICATE
```

### Root Cause
Title update logic was in `publishSSE` function, triggered on every SSE `type === 'end'` event:
- Agent a1 finishes streaming → SSE end → triggers title update #1
- Agent a2 finishes streaming → SSE end → triggers title update #2

With multiple agents responding, each agent's end event triggered a separate title generation, causing:
1. **Duplicate events** - One per agent
2. **Race conditions** - Both updates happening simultaneously (within same second)
3. **Unnecessary LLM calls** - Title generated multiple times for same conversation

## Solution Implemented

### Architecture Change
**Before:** SSE end event → Title update (per agent)  
**After:** World idle event → Title update (once per conversation)

### Key Insight
The world activity tracker already emits an `'idle'` event when `pendingOperations === 0`, indicating all agents have finished. This is the perfect trigger point for title updates.

### Implementation Details

#### 1. Removed SSE-based Title Update
**File:** `core/events.ts` - `publishSSE` function

Removed the SSE end event handler that triggered title updates:
```typescript
// REMOVED: Title update on SSE end
if (sseEvent.type === 'end') {
  queueMicrotask(async () => {
    // Title generation logic
  });
}
```

#### 2. Created World Activity Listener
**File:** `core/events.ts` - New function

Added `setupWorldActivityListener` to monitor world idle state:
```typescript
export function setupWorldActivityListener(world: World): () => void {
  const handler = async (event: any) => {
    // Only update title when world becomes idle (all agents done)
    if (event.type === 'idle' && event.pendingOperations === 0) {
      try {
        if (!world.currentChatId) return;
        const chat = world.chats.get(world.currentChatId);
        if (!chat) return;
        // Only update if still default title
        if (chat.name === 'New Chat') {
          const title = await generateChatTitleFromMessages(world, '');
          if (title) {
            chat.name = title;
            const storage = await getStorageWrappers();
            await storage.updateChatData(world.id, world.currentChatId, { name: title });
            publishEvent(world, 'system', `chat-title-updated`);
          }
        }
      } catch (err) {
        loggerChatTitle.warn('Activity-based title update failed', { error });
      }
    }
  };

  world.eventEmitter.on('world', handler);
  return () => world.eventEmitter.off('world', handler);
}
```

**Why this works:**
- `type === 'idle'` - Only fires when world transitions to idle state
- `pendingOperations === 0` - Confirms all agents finished
- Fires **once** per conversation, not once per agent
- Direct async handler (no `queueMicrotask` needed - EventEmitter handles async naturally)

#### 3. Added World Type Property
**File:** `core/types.ts`

Added cleanup function property to World interface:
```typescript
export interface World {
  // ... existing properties
  _eventPersistenceCleanup?: () => void;
  _activityListenerCleanup?: () => void; // NEW
}
```

#### 4. Integrated Listener Setup
**File:** `core/managers.ts`

Added activity listener setup in `createWorld`:
```typescript
// Setup event persistence and activity listener
if (worldData.eventStorage) {
  const { setupEventPersistence, setupWorldActivityListener } = await import('./events.js');
  worldData._eventPersistenceCleanup = setupEventPersistence(worldData);
  worldData._activityListenerCleanup = setupWorldActivityListener(worldData); // NEW
}
```

Added activity listener setup in `getWorld`:
```typescript
// Setup event persistence and activity listener
if (world.eventStorage) {
  const { setupEventPersistence, setupWorldActivityListener } = await import('./events.js');
  world._eventPersistenceCleanup = setupEventPersistence(world);
  world._activityListenerCleanup = setupWorldActivityListener(world); // NEW
}
```

Added cleanup in `deleteWorld`:
```typescript
// Clean up event persistence listeners if world is currently loaded
const world = await getWorld(normalizedWorldId);
if (world?._eventPersistenceCleanup) {
  world._eventPersistenceCleanup();
}
if (world?._activityListenerCleanup) {
  world._activityListenerCleanup(); // NEW
}
```

#### 5. Updated Tests
**File:** `tests/core/events/post-stream-title.test.ts`

Converted test from SSE-based to idle-based:

**Before:**
```typescript
test('updates title on SSE end when chat is New Chat', async () => {
  publishSSE(world, { agentName: agent.id, type: 'end' });
  await new Promise(r => setTimeout(r, 10));
  expect(chat.name).not.toBe('New Chat');
});
```

**After:**
```typescript
test('updates title on idle when chat is New Chat', async () => {
  world.eventEmitter.emit('world', {
    type: 'idle',
    pendingOperations: 0,
    // ... other event properties
  });
  await new Promise(r => setTimeout(r, 10));
  expect(chat.name).not.toBe('New Chat');
});
```

Added new test case:
```typescript
test('does not update title on non-idle events', async () => {
  // Fire response-start event (not idle)
  world.eventEmitter.emit('world', {
    type: 'response-start',
    pendingOperations: 1,
    // ...
  });
  await new Promise(r => setTimeout(r, 10));
  // Title should remain unchanged
  expect(world.chats.get('chat-1')!.name).toBe('New Chat');
});
```

## Benefits

### 1. Eliminates Duplicate Events
- **Before:** N events (one per agent)
- **After:** 1 event (once per conversation)
- No more duplicate `chat-title-updated` in export logs

### 2. Better Resource Efficiency
- Single LLM call for title generation per conversation
- No wasted API calls for duplicate title generation
- Reduced database updates

### 3. Correct Semantic Timing
- Title updates when world is **truly done** processing
- Reflects actual completion state, not partial completion
- Aligns with world activity lifecycle

### 4. Cleaner Event Flow
Export now shows proper event sequence:
```
22:23:39 ● [world] a2: idle pending=0
22:23:39 ● [system] chat-title-updated  ← Single event
```

### 5. More Maintainable Code
- Single responsibility: World activity tracker manages world state
- Clear separation: SSE events for streaming, world events for lifecycle
- Easier to reason about: Title updates tied to completion, not streaming

## Testing & Verification

### Test Execution
All tests pass (717 tests):
- ✅ `post-stream-title.test.ts` - 3 tests for idle-based title updates
- ✅ All existing event persistence tests
- ✅ All agent message tests
- ✅ All world lifecycle tests

### Validation Scenarios
1. **Single agent response** - Title updates correctly on idle
2. **Multiple agent responses** - Title updates once on idle (not per agent)
3. **Non-idle events** - Title does not update on response-start/response-end
4. **Existing chat titles** - No update if chat name is not "New Chat"
5. **World deletion** - Activity listener properly cleaned up

## Technical Details

### Event Flow Comparison

**Before (SSE-based):**
```
Human sends message
  ↓
Agent a1 starts streaming → SSE start
  ↓
Agent a1 finishes → SSE end → Title update #1 ❌
  ↓
Agent a2 starts streaming → SSE start
  ↓
Agent a2 finishes → SSE end → Title update #2 ❌
```

**After (Idle-based):**
```
Human sends message
  ↓
World: response-start pending=1
  ↓
Agent a1 starts streaming → SSE start
  ↓
Agent a1 finishes → SSE end
  ↓
World: response-start pending=2
  ↓
Agent a2 starts streaming → SSE start
  ↓
Agent a2 finishes → SSE end
  ↓
World: idle pending=0 → Title update ✅ (once)
```

### World Activity Events
The world activity tracker emits these event types:
- `response-start` - Agent begins processing (pendingOperations++)
- `response-end` - Agent finishes but others still active (pendingOperations > 0)
- `idle` - All agents finished (pendingOperations === 0)

Title updates now correctly use the `idle` event, which fires **once** when the entire conversation turn is complete.

### Listener Lifecycle
1. **Setup:** `createWorld` or `getWorld` calls `setupWorldActivityListener`
2. **Active:** Listener monitors `'world'` channel for idle events
3. **Cleanup:** `deleteWorld` calls cleanup function to remove listener
4. **Cleanup stored:** Function reference in `world._activityListenerCleanup`

## Files Modified

1. **core/events.ts** (primary changes)
   - Removed SSE end event title update logic
   - Added `setupWorldActivityListener` function (40+ lines)
   - Updated header documentation with change log

2. **core/types.ts**
   - Added `_activityListenerCleanup?: () => void` to World interface

3. **core/managers.ts**
   - Added activity listener setup in `createWorld`
   - Added activity listener setup in `getWorld`
   - Added activity listener cleanup in `deleteWorld`

4. **tests/core/events/post-stream-title.test.ts**
   - Updated test description and imports
   - Changed from `publishSSE` to world activity event emission
   - Added test for non-idle events
   - Renamed test suite to "World activity-based title update"

## Related Context

### Previous Title Update Issues
This fix addresses a user-reported issue discovered through export analysis showing duplicate `chat-title-updated` events.

### Design Decision Rationale
**Question:** Why not use a flag to prevent duplicate SSE-triggered updates?

**Answer:** Using world idle events is architecturally superior because:
1. **Single source of truth:** Activity tracker already manages world state
2. **No race conditions:** One event, one update
3. **Cleaner code:** No need for flags or synchronization logic
4. **Better semantics:** Title updates when conversation is complete, not mid-stream

### Alternative Approaches Considered
1. ~~Add flag to prevent duplicate SSE updates~~ - Adds complexity, doesn't solve root cause
2. ~~Debounce SSE end events~~ - Fragile timing logic, race conditions possible
3. ✅ **Use world idle event** - Correct semantic trigger, single update

## Lessons Learned

1. **Event Design Matters:** Choose the right event trigger for the semantic meaning
   - SSE events = per-agent streaming lifecycle
   - World events = world-level state changes

2. **Activity Tracking is Authoritative:** The activity tracker knows when work is done
   - Don't duplicate "completion" logic across different event handlers
   - Trust the activity tracker's idle signal

3. **Race Conditions from Multiple Agents:** When multiple agents can trigger the same logic
   - Consider using world-level events instead of agent-level events
   - Prefer single authoritative signal over deduplication logic

4. **Export Logs are Valuable:** User-facing export revealed the duplicate event issue
   - Event logs show actual system behavior
   - Export format made the problem visible and understandable

## Future Considerations

1. **Other Title Update Triggers:** Consider if title should update on:
   - Chat restore (if title is still "New Chat")
   - Manual refresh request
   - World configuration change

2. **Title Generation Performance:** Monitor LLM call latency for title generation
   - Consider caching or pre-generation strategies if needed
   - Current approach: Generate once per conversation turn

3. **Activity Listener Patterns:** This pattern could be useful for other world-level triggers
   - Auto-save on idle
   - Metrics collection on idle
   - Cleanup operations on idle

4. **Event Ordering Guarantees:** Currently assumes world idle fires after all SSE events
   - This is correct based on activity tracker implementation
   - Document this ordering dependency if exposing events externally
