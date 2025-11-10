# Tool Results Display in Web Frontend - Complete Fix

**Date:** 2025-11-10  
**Issue:** Tool execution results not showing in web frontend despite working in CLI  
**Root Causes:** Two critical bugs preventing tool result display

## Problem Analysis

### Symptom
Tool approvals and executions worked perfectly in CLI but failed silently in web frontend with "Unknown tool_call_id" security rejection.

### Investigation Trail
1. **Initial hypothesis**: Tool events not being emitted → Rejected (CLI worked, same code path)
2. **Key insight**: "it must be different the way subscribe to the world between CLI and API"
3. **First discovery**: API bypassed `subscribeWorld()` pattern
4. **Second discovery**: SQLite wasn't parsing tool_calls JSON strings back to objects

## Root Cause #1: API Subscription Bypass

### The Bug
API tool-result handlers (`handleNonStreamingToolResult` and `handleStreamingToolResult`) used middleware world directly instead of calling `subscribeWorld()`.

```typescript
// BEFORE (Wrong)
const world = res.locals.world; // Middleware world, not subscribed
publishToolResult(world, agentId, {...});
```

### Why This Broke
- `subscribeWorld()` does more than load data - it activates agent message subscribers and event emitter wiring
- Without subscription, agent event handlers weren't registered
- Events were emitted but nobody was listening
- CLI worked because it properly called `subscribeWorld()` at startup

### The Fix
Updated both handlers to match CLI pattern:

```typescript
// AFTER (Correct)
const subscription = await subscribeWorld(worldName, { isOpen: true });
const activeWorld = subscription.world;
publishToolResult(activeWorld, agentId, {...});
// Wait for world idle event
// Cleanup subscription
```

**Files Modified:**
- `server/api.ts` - Lines 350-400 (handleNonStreamingToolResult)
- `server/api.ts` - Lines 450-500 (handleStreamingToolResult)

## Root Cause #2: SQLite tool_calls Not Parsed

### The Bug
When loading agents from SQLite, the `tool_calls` field (stored as JSON string) wasn't being parsed back into objects.

```typescript
// BEFORE (Wrong)
memory: memoryData.map(msg => ({
  ...msg,
  createdAt: msg.createdAt ? new Date(msg.createdAt) : new Date(),
  chatId: msg.chatId,
  replyToMessageId: msg.replyToMessageId
  // Missing: tool_calls parsing!
}))
```

### Why CLI Didn't Hit This
- **CLI**: Maintains single world instance throughout session
  - Tool calls added to memory as JavaScript objects
  - Never reloaded from SQLite during session
  - Objects stayed as objects in memory
  
- **API**: Creates new world instance per HTTP request
  - Each request loads agents fresh from SQLite
  - tool_calls stored as JSON string: `'[{"id":"call_123",...}]'`
  - Without parsing: memory.tool_calls = string (not array)
  - Security check fails: can't find tool_call_id in string

### The Fix
Added JSON.parse for tool_calls field:

```typescript
// AFTER (Correct)
memory: memoryData.map(msg => ({
  ...msg,
  createdAt: msg.createdAt ? new Date(msg.createdAt) : new Date(),
  chatId: msg.chatId,
  replyToMessageId: msg.replyToMessageId,
  tool_calls: msg.toolCalls ? JSON.parse(msg.toolCalls as any) : undefined
}))
```

**Files Modified:**
- `core/storage/sqlite-storage.ts` - Line 337 (listAgents function)

## Additional Changes

### Frontend originalToolCall Preservation
Updated web frontend to store and use complete `originalToolCall` object (including nested tool ID):

**Files Modified:**
- `web/src/types/index.ts` - Added `originalToolCall` to toolCallData type
- `web/src/pages/World.update.ts` - Lines 245, 533 (preserve originalToolCall in request reconstruction)
- `web/src/utils/sse-client.ts` - Line 335 (store originalToolCall in approval request)

### Debug Logging
Added comprehensive logging for troubleshooting:

**Files Modified:**
- `core/events/subscribers.ts` - Line 234 (log all tool_call_ids in memory when rejection occurs)
- `core/events/orchestrator.ts` - Line 181 (log tool_call_ids when saving assistant message)

## Testing Validation

### Database Verification
```sql
SELECT message_id, role, tool_calls 
FROM agent_memory 
WHERE agent_id = 'a1' AND tool_calls IS NOT NULL;
```
Result: Tool calls correctly saved as JSON strings in SQLite

### Memory Load Test
Before fix: `allToolCallIdsInMemory: []`  
After fix: `allToolCallIdsInMemory: ["call_pea450rp", "approval_1762806343015_ash1fq"]`

### End-to-End Flow
1. ✅ User sends message triggering tool approval
2. ✅ Assistant message with tool_calls saved to SQLite
3. ✅ Approval request displayed in web UI
4. ✅ User approves → API loads world via subscribeWorld()
5. ✅ Agent memory loaded with tool_calls properly parsed
6. ✅ Security check passes (tool_call_id found in memory)
7. ✅ Tool executes and result displays in web UI

## Pattern Documentation

### Correct World Subscription Pattern
```typescript
// 1. Subscribe to world (activates agent subscriptions)
const subscription = await subscribeWorld(worldName, { isOpen: true });
const activeWorld = subscription.world;

// 2. Publish events on subscribed world
publishToolResult(activeWorld, agentId, {...});

// 3. Wait for completion (event-driven)
await waitForWorldIdle(activeWorld);

// 4. Cleanup
await subscription.unsubscribe();
```

### Why This Pattern Matters
- `subscribeWorld()` is the entry point for activating world runtime
- Not just data loading - sets up entire event infrastructure
- Agent message handlers registered during subscription
- Without it: events emitted into void, handlers never called

## Impact

### Before Fix
- Web frontend: Tool approvals silent failures, no results displayed
- CLI: Worked (kept world in memory, never reloaded from SQLite)
- Developer experience: Confusing - same code, different behavior

### After Fix
- Complete parity between CLI and web frontend
- Tool approvals and results work identically in both interfaces
- Proper event-driven architecture throughout
- SQLite correctly round-trips all data types

## Related Documentation
- `docs/done/2025-11-10/tool-events-sse-debug.md` - Initial subscription investigation
- `docs/done/2025-11-10/tool-call-id-alignment.md` - Frontend originalToolCall handling

## Key Learnings

1. **Subscription vs Loading**: `subscribeWorld()` does more than load data - it's the runtime activation point
2. **CLI vs API Lifecycle**: CLI's long-lived instance masked SQLite serialization bugs
3. **Type Preservation**: JSON fields in SQLite must be explicitly parsed on load
4. **Event Infrastructure**: Proper subscription critical for event-driven systems
5. **Pattern Consistency**: Both CLI and API must follow same subscription pattern even if CLI doesn't technically need reload
