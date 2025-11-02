# WebSocket Event Format Consolidation

**Date:** November 2, 2025  
**Status:** Completed

## Overview
Consolidated WebSocket client implementations and simplified event structure to eliminate confusing nested payloads across the Agent World codebase.

## Problem Statement
The WebSocket event protocol had several issues:
1. **Nested `payload.payload` structure** - Events were double-wrapped, causing confusion when accessing data
2. **Duplicate client implementations** - `ws/client.ts` (Node.js only) and `ws/ws-client.ts` (browser) had overlapping functionality
3. **Inconsistent event handling** - Different event types used different wrapping patterns
4. **Type field collisions** - Spreading events with `type` fields caused conflicts

## Solution

### 1. Flattened Event Structure
Changed from nested to clean format:

**Before:**
```typescript
{
  type: 'event',
  payload: {
    type: 'world',        // Event type
    payload: {            // ❌ Double nesting!
      type: 'response-start',
      pendingOperations: 1,
      ...
    }
  }
}
```

**After:**
```typescript
{
  type: 'event',          // WebSocket message type
  eventType: 'world',     // Event type at top level
  payload: {              // Data directly
    type: 'response-start',
    pendingOperations: 1,
    ...
  }
}
```

### 2. Consolidated WebSocket Clients
- **Deleted:** `ws/client.ts` (old duplicate)
- **Enhanced:** `ws/ws-client.ts` → Universal client for both Node.js and browser
- **Features:**
  - Environment detection (`isNode` check)
  - Dynamic WebSocket loading (Node.js `ws` module vs browser `globalThis.WebSocket`)
  - Cross-platform event handlers (`addEventListener` for browser, `on()` for Node.js)
  - Handles both `Buffer` (Node.js) and `string` (browser) messages
  - ConnectionState changed from enum to string union type for browser compatibility

### 3. Updated TUI Integration
Modified TUI hooks to use correct API methods:
- `ws.enqueue()` → `ws.sendMessage()`
- `ws.executeCommand()` → `ws.sendCommand()`
- Removed `ping()` method (handled internally)
- Added conversion for `replayFrom: 'beginning'` → `fromSeq: 0`

### 4. Consistent Event Broadcasting
All event types now follow the same pattern:

| Event Type | eventType | payload.type | Description |
|------------|-----------|--------------|-------------|
| Message | `'message'` | N/A | Agent/human messages |
| World | `'world'` | `'response-start'`, `'tool-start'`, `'idle'`, etc. | Activity tracking, tool execution |
| SSE | `'sse'` | `'start'`, `'chunk'`, `'end'`, `'error'` | Streaming LLM responses |

## Files Changed

### Core Infrastructure
- **`ws/ws-server.ts`** - Updated `broadcastEvent()` to use flat structure with `eventType` field
- **`ws/queue-processor.ts`** - All event listeners wrap with `{type: X, payload: event}`
- **`ws/demo.ts`** - Updated event handler to read `event.eventType` and `event.payload`
- **`ws/ws-client.ts`** - Consolidated universal client with browser + Node.js support

### TUI Integration  
- **`tui/src/hooks/useAgentWorldClient.ts`**:
  - Updated to use `sendMessage()` and `sendCommand()`
  - Removed `ping()` from interface and implementation
  - Added `replayFrom` conversion
- **`tui/src/hooks/useWebSocketConnection.ts`** - Updated imports to use `ws/ws-client.ts`

### Tests
- **`tests/ws/event-format.test.ts`** - New comprehensive test suite (14 tests)
  - Message events (human/agent)
  - World events (activity tracking, tool execution)
  - SSE events (start/chunk/end/error)
  - Validates no `payload.payload` nesting
  - Ensures `eventType` at top level

### Documentation
- **`ws/types.ts`** - Added missing Message interface fields

### Deleted
- **`ws/client.ts`** - Removed duplicate Node.js-only client

## Testing
All 14 unit tests passing:
```
✓ Message Events (2)
✓ World Events (3)  
✓ SSE Events (Streaming) (4)
✓ Event Sequence Tracking (2)
✓ Event Filtering by Chat (1)
✓ Consistency Validation (2)
```

## Benefits
1. **Simpler event access** - No more `event.payload.payload.data`
2. **Consistent structure** - All events follow same pattern
3. **Single source of truth** - One universal WebSocket client
4. **Better maintainability** - Clear separation of WebSocket message type vs event type
5. **Cross-platform support** - Works in both browser and Node.js
6. **Type safety** - Clean TypeScript types without workarounds
7. **Test coverage** - Comprehensive validation of event structure

## Migration Notes
For code using the old structure:
```typescript
// OLD
if (event.payload?.type === 'world' && event.payload.payload?.type === 'idle') {
  const pending = event.payload.payload.pendingOperations;
}

// NEW
if (event.eventType === 'world' && event.payload?.type === 'idle') {
  const pending = event.payload.pendingOperations;
}
```

## Related Files
- Event broadcasting: `ws/ws-server.ts`, `ws/queue-processor.ts`
- Event handling: `ws/demo.ts`, `ws/ws-client.ts`
- TUI integration: `tui/src/hooks/useAgentWorldClient.ts`, `tui/src/hooks/useWebSocketConnection.ts`
- Tests: `tests/ws/event-format.test.ts`
- Types: `ws/types.ts`
