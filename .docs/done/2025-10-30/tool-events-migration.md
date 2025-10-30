# Tool Events Migration: SSE → World Channel

**Date:** 2025-01-29  
**Status:** ✅ Completed  
**Tests:** All 598 tests passing

## Phase 2: Redundant Field Removal

**Date:** 2025-10-29  
**Status:** ✅ Completed  
**Tests:** All 598 tests passing

### Removed `phase` Field from `WorldToolEvent`

After migration, discovered that `toolExecution.phase` was redundant with the top-level `type` field:
- `type: 'tool-start'` always had `phase: 'starting'`
- `type: 'tool-result'` always had `phase: 'completed'`
- `type: 'tool-error'` always had `phase: 'failed'`
- `type: 'tool-progress'` would have `phase: 'executing'`

**No consumers used `phase`** - all code checked `event.type` instead.

**Changes:**
- Removed `phase` field from `WorldToolEvent.toolExecution` in `core/types.ts`
- Removed `phase` field from `WorldToolEvent.toolExecution` in `web/src/types/index.ts`
- Removed `phase` assignments from all LLM providers (10 locations):
  - `core/openai-direct.ts` (5 removals)
  - `core/anthropic-direct.ts` (3 removals)
  - `core/google-direct.ts` (3 removals)
- Removed `phase` from `core/tool-utils.ts` (1 removal)
- Updated test fixtures (8 locations)
- Fixed `Message.toolExecution` to be optional (was incorrectly required)

**Benefits:**
- ✅ Eliminates redundancy
- ✅ Simplifies event structure
- ✅ Reduces cognitive load
- ✅ One less field to maintain

**Note:** Web's `AgentActivityStatus.phase` remains unchanged - it's independent and uses event `type` values directly ('tool-start', 'tool-progress', 'thinking', etc.).

---

## Summary

Migrated tool execution events (`tool-start`, `tool-result`, `tool-error`, `tool-progress`) from the `sse` channel to the `world` channel to properly reflect their semantic nature as **agent behavioral events** rather than LLM streaming content.

## User Insight

> "SSE is used sending content from LLM streaming. tool-start, tool-result, tool-error are more like agent behavior. Right?"

**Correct!** This insight led to the proper architectural separation:
- **SSE channel**: Pure LLM output streaming (`start`, `chunk`, `end`, `error`, `log`)
- **World channel**: Agent behavioral events (activity tracking + tool execution)

## Architecture Changes

### Before (Incorrect Semantic Mixing)
```
sse channel:
  - start, chunk, end, error, log (LLM streaming) ✅
  - tool-start, tool-result, tool-error (tool execution) ❌ wrong channel

world channel:
  - processing/idle activity events ✅
```

### After (Correct Semantic Separation)
```
sse channel:
  - start, chunk, end, error, log (LLM streaming) ✅

world channel:
  - processing/idle activity events ✅
  - tool-start, tool-result, tool-error, tool-progress (tool execution) ✅
```

## Implementation Changes

### 1. Type System (`core/types.ts`)

**Created new `WorldToolEvent` type:**
```typescript
export interface WorldToolEvent {
  agentName: string;
  type: 'tool-start' | 'tool-result' | 'tool-error' | 'tool-progress';
  messageId: string;
  toolExecution: {
    toolName: string;
    toolCallId: string;
    sequenceId?: string;
    duration?: number;
    input?: any;
    result?: any;
    resultType?: 'string' | 'object' | 'array' | 'null';
    resultSize?: number;
    error?: string;
    metadata?: {
      serverName?: string;
      transport?: string;
      isStreaming?: boolean;
    };
  };
}
```

**Updated `WorldSSEEvent` type:**
- Removed `tool-start`, `tool-result`, `tool-error`, `tool-progress` from type union
- Removed optional `toolExecution` property
- Added documentation note about tool event migration

### 2. Core Events (`core/events.ts`)

**Added new `publishToolEvent()` function:**
```typescript
export function publishToolEvent(world: World, data: Partial<WorldToolEvent>): void {
  const toolEvent: WorldToolEvent = {
    agentName: data.agentName!,
    type: data.type!,
    messageId: data.messageId || generateId(),
    toolExecution: data.toolExecution!
  };
  world.eventEmitter.emit('world', toolEvent);
}
```

### 3. LLM Providers

Updated all three provider files to use `publishToolEvent()` instead of `publishSSE()`:

**Files Modified:**
- `core/openai-direct.ts` (4 tool event emissions)
- `core/anthropic-direct.ts` (3 tool event emissions)
- `core/google-direct.ts` (3 tool event emissions)

**Pattern Used:**
```typescript
// Tool start event
const { publishToolEvent } = await import('./events.js');
publishToolEvent(world, {
  agentName: agent.id,
  type: 'tool-start',
  messageId,
  toolExecution: {
    toolName: toolName,
    toolCallId: toolCallId,
    sequenceId: sequenceId,
    input: toolInput
  }
});
```

**Enhanced Tool Event Data:**
- Added `sequenceId` for tool call tracking
- Added `input` field (tool arguments) to all tool events
- Added `resultType` and `resultSize` to tool-result events
- Consistent structure across all three providers

### 4. Server API (`server/api.ts`)

**Updated `handleStreamingChat()` to listen on world channel:**

```typescript
onWorldEvent: (eventType: string, eventData: any) => {
  if (eventType === 'world') {
    const payload = eventData as any;
    // Handle activity events
    if (payload?.state === 'processing' || payload?.state === 'idle') {
      // ... activity tracking
    }
    // Handle tool events (migrated from sse channel)
    else if (payload?.type === 'tool-start' || payload?.type === 'tool-result' || payload?.type === 'tool-error') {
      const agentName = payload.agentName;
      if (agentName) {
        if (payload.type === 'tool-start') {
          const toolKey = `${agentName}-${payload.toolExecution?.toolCallId}`;
          activeToolCalls.add(toolKey);
          pendingEvents++;
        } else if (payload.type === 'tool-result' || payload.type === 'tool-error') {
          const toolKey = `${agentName}-${payload.toolExecution?.toolCallId}`;
          activeToolCalls.delete(toolKey);
          pendingEvents = Math.max(0, pendingEvents - 1);
        }
      }
    }
  }
}
```

### 5. CLI (`cli/index.ts` and `cli/stream.ts`)

**Created new `handleToolEvents()` function in `cli/stream.ts`:**
```typescript
export function handleToolEvents(eventData: any): void {
  if (eventData.type === 'tool-start' && eventData.toolExecution) {
    const toolName = eventData.toolExecution.toolName;
    const agentName = eventData.agentName || 'agent';
    console.log(`\n${cyan(agentName)} ${gray('calling tool -')} ${yellow(toolName)} ${gray('...')}`);
  }
  // ... tool-progress, tool-result, tool-error handlers
}
```

**Updated `cli/index.ts` to route tool events:**
```typescript
function handleWorldEvent(...) {
  if (eventType === 'world') {
    const payload = eventData as any;
    // Handle activity events
    if (payload.state === 'processing' || payload.state === 'idle') {
      activityMonitor.handle(payload);
      progressRenderer.handle(payload);
    }
    // Handle tool events (migrated from sse channel)
    else if (payload.type === 'tool-start' || payload.type === 'tool-result' || 
             payload.type === 'tool-error' || payload.type === 'tool-progress') {
      handleToolEvents(payload);
    }
  }
}
```

## Why This Matters

### Semantic Correctness
- **Tool execution** is an **agent action** (behavioral event), not LLM output
- LLM returns tool calls to execute, but **execution happens in core**, not in LLM
- World channel tracks agent behavior (activity + tool execution)
- SSE channel is now purely for LLM streaming content

### Architecture Benefits
1. **Clear separation of concerns**: LLM output vs agent actions
2. **Consistent event routing**: All agent behavior goes to world channel
3. **Better debugging**: Tool events appear in same channel as activity tracking
4. **Future extensibility**: Can add more agent behavioral events to world channel

### Consumer Impact
- **Server**: Tracks tool execution for timeout management (prevents premature SSE closure)
- **CLI**: Displays tool progress alongside agent activity
- **Web Client**: Can distinguish between LLM streaming and tool execution

## Testing

All 598 existing tests pass without modification, confirming:
- ✅ Backward compatibility maintained
- ✅ No breaking changes to existing functionality
- ✅ Event flow working correctly
- ✅ Type safety preserved

## Related Changes

This migration follows the earlier consolidation of `world-activity` → `world` channel, establishing a clear pattern:

1. **message channel**: Persistent messages (user/assistant)
2. **sse channel**: Transient LLM streaming (start/chunk/end/error/log)
3. **system channel**: System-level events
4. **world channel**: Agent behavioral events (activity + tool execution)

## Migration Impact

**No breaking changes** - This is an internal architecture improvement. All consumers (server, CLI, web) updated simultaneously to maintain consistent behavior.

## Lessons Learned

1. **Channel semantics matter**: Event channel names should reflect the semantic nature of events, not the transport mechanism
2. **User insights are valuable**: The user's observation about SSE being for LLM streaming led to correct architecture
3. **Separation of concerns**: LLM output (streaming) and agent actions (tool execution) are fundamentally different and belong in different channels
