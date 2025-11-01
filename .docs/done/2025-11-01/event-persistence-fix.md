# Event Persistence Fix - Complete Implementation

**Date:** November 1, 2025  
**Status:** ✅ Completed

## Overview

Fixed critical event persistence issues that prevented SSE end events and agent message events from being saved to the database. The root cause was UNIQUE constraint violations due to duplicate event IDs.

## Problems Identified

### 1. Missing Events in Database
- SSE end events were not persisted
- Agent response messages were not persisted
- Only SSE start events and human messages appeared in the events table

### 2. Root Causes
- **Duplicate IDs:** SSE chunk, end, and agent message events all used the same `messageId`, causing UNIQUE constraint failures
- **Unnecessary Persistence:** SSE chunk events were being persisted (should only persist start/end)
- **Silent Failures:** Database errors were logged at `warn` level instead of `error` level

### 3. Discovery Process
- Added debug logging to trace event flow
- Identified UNIQUE constraint violations in server logs
- Found that `setupEventPersistence` was being called correctly
- Discovered that handlers were returning Promises (synchronous/awaitable) as designed

## Solution Implemented

### 1. SSE Event Persistence Strategy

**Before:**
- All SSE events (start, chunk, end) used the same messageId
- Caused UNIQUE constraint violations after first insert

**After:**
```typescript
// Only persist start and end events, not chunk events
if (event.type !== 'start' && event.type !== 'end') {
  return;
}

// Make ID unique by combining messageId with event type
const eventData = {
  id: `${event.messageId}-sse-${event.type}`,
  // ... rest of event data
};
```

**Result:**
- SSE start: `{messageId}-sse-start` ✅
- SSE end: `{messageId}-sse-end` ✅
- Agent message: `{messageId}` ✅
- No conflicts, all events persist successfully

### 2. Error Logging Enhancement

Changed all database operation failures from `warn` to `error` level:

**Files Updated:**
- `core/events.ts` - Event persistence failures
- `core/export.ts` - Chat message/event load failures
- `core/managers.ts` - Memory archive failures

**Before:**
```typescript
loggerPublish.warn('Failed to persist event', { ... });
```

**After:**
```typescript
loggerPublish.error('Failed to persist event', { ... });
```

### 3. Code Cleanup

Removed all debug console.log statements:
- `[SETUP EVENT PERSISTENCE]` logs
- `[MESSAGE HANDLER]` logs
- `[SSE HANDLER]` logs
- `[PERSIST]` / `[PERSIST SUCCESS]` / `[PERSIST FAIL]` logs

Kept only proper structured logging through pino logger.

## Testing & Verification

### Test Execution
1. Created new chat session
2. Sent message "final test"
3. Both agents (a1, a2) responded
4. Verified database persistence
5. Checked export functionality

### Database Verification
Query results showed complete event persistence:

```
message|ZvnriPQ5iPFwkegl2uy99|HUMAN|||hi
world|wuIwEbR5CH||||
world|GGXZjQnEKv||||
sse|jbNh4IV3-iFp8KFOUGO2C-sse-start||start|a1|
sse|jbNh4IV3-iFp8KFOUGO2C-sse-end||end|a1|
message|jbNh4IV3-iFp8KFOUGO2C|a1|||Hello! It's nice to...
sse|XU_jj6GV4NBRByKkSGBfF-sse-start||start|a2|
sse|XU_jj6GV4NBRByKkSGBfF-sse-end||end|a2|
message|XU_jj6GV4NBRByKkSGBfF|a2|||Hello! How can I...
world|14jCT45f33||||
system|yls5mhrmXGwBFLBLX44pY||||
```

### Export Verification
Export showed **24 total events** including:
- ✅ `[sse] a1: start` (2x)
- ✅ `[sse] a1: end` (2x)
- ✅ `[sse] a2: start` (2x)
- ✅ `[sse] a2: end` (2x)
- ✅ `[message] a1: <response>` (2x)
- ✅ `[message] a2: <response>` (2x)
- ✅ `[message] HUMAN: hi`
- ✅ `[message] HUMAN: final test`
- ✅ World activity events
- ✅ System events

## Technical Details

### Event ID Strategy

| Event Type | ID Format | Example |
|------------|-----------|---------|
| Message (human) | `{messageId}` | `pcl2xZr0Xkb8VeVu8_BgR` |
| Message (agent) | `{messageId}` | `jbNh4IV3-iFp8KFOUGO2C` |
| SSE start | `{messageId}-sse-start` | `jbNh4IV3-iFp8KFOUGO2C-sse-start` |
| SSE end | `{messageId}-sse-end` | `jbNh4IV3-iFp8KFOUGO2C-sse-end` |
| SSE chunk | *not persisted* | - |
| World | `{generateId()}` | `wuIwEbR5CH` |
| System | `{generateId()}` | `yls5mhrmXGwBFLXX44pY` |

### Event Flow

```
1. Human sends message → message event (id: msg-123)
2. Agent a1 starts → world event (response-start)
3. Agent a1 SSE start → sse event (id: msg-456-sse-start)
4. Agent a1 SSE chunks → *not persisted*
5. Agent a1 SSE end → sse event (id: msg-456-sse-end)
6. Agent a1 response → message event (id: msg-456)
7. World activity → world event (response-end)
```

### Files Modified

1. **core/events.ts**
   - Modified `sseHandler` to skip chunk events
   - Modified `sseHandler` to use composite IDs for SSE events
   - Changed error logging from `warn` to `error` for persistence failures
   - Removed debug console.log statements

2. **core/export.ts**
   - Changed error logging from `warn` to `error` for load failures

3. **core/managers.ts**
   - Changed error logging from `warn` to `error` for archive failures

4. **tests/core/agent-message-persistence.test.ts**
   - Fixed `LLMProvider` enum usage
   - Added missing `type` field to agent creation

## Benefits

### 1. Complete Event History
- All agent responses now persisted
- SSE lifecycle fully tracked (start → end)
- Export functionality shows complete conversation flow

### 2. Better Debugging
- Error-level logging for all database failures
- Clear visibility into persistence issues
- Structured logging with context

### 3. Clean Codebase
- Removed temporary debug logging
- Maintained proper logging practices
- Clear event ID strategy

### 4. No Performance Impact
- Reduced persistence load (no chunk events)
- Efficient composite ID generation
- Synchronous/awaitable handlers work as designed

## Related Context

### Original Issue
- User asked: "what does SYNC_EVENT_PERSISTENCE do? can we remove it and always persist events"
- Investigation revealed the flag controlled sync vs async persistence
- Removed the flag and made all persistence synchronous/awaitable
- Discovered events weren't persisting due to ID conflicts

### SYNC_EVENT_PERSISTENCE Removal
The original goal was achieved:
- ✅ Removed `SYNC_EVENT_PERSISTENCE` flag
- ✅ Made all event persistence synchronous/awaitable
- ✅ Event handlers now return Promises properly
- ✅ Fixed ID conflicts that prevented persistence

## Lessons Learned

1. **Debug Logging Strategy**: Console.log is crucial for diagnosing server-side issues since browser console only shows client code
2. **Database Constraints**: UNIQUE constraints will silently fail unless proper error handling is in place
3. **Event ID Design**: Need careful planning when multiple event types share a logical relationship
4. **Test Data vs Production**: Old test data showed different patterns than new data generated with fixes

## Future Considerations

1. **Event Cleanup**: Consider cleanup strategy for old SSE events with duplicate IDs
2. **Migration**: May need migration script to fix events created before this fix
3. **Monitoring**: Add metrics for event persistence success/failure rates
4. **CLI Alignment**: Update CLI event display to match new format (next task)
