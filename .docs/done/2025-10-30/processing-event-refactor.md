# Processing Activity Event Refactoring

**Date:** 2025-10-30  
**Type:** Refactoring - Pattern Consistency  
**Status:** ✅ Complete

## Overview

Refactored world activity tracking system from compound pattern (state + change) to separate event types (response-start, response-end, idle), aligning with existing SSE and tool event patterns throughout the codebase.

## Problem Statement

The activity tracking system used an inconsistent compound pattern:
- **Before:** `state: 'processing' | 'idle'` + `change: 'start' | 'end'`
- **Pattern:** Required checking both fields: `if (event.state === 'processing' && change === 'start')`

This differed from established patterns:
- **SSE Events:** `type: 'start' | 'chunk' | 'end' | 'error'`
- **Tool Events:** `type: 'tool-start' | 'tool-result' | 'tool-error' | 'tool-progress'`

## Solution

Replaced compound pattern with discriminated union:
- **After:** `type: 'response-start' | 'response-end' | 'idle'`
- **Pattern:** Single condition: `if (event.type === 'response-start')`

## Implementation Details

### Core Changes

**core/activity-tracker.ts:**
- Removed `WorldActivityEventState` type and `change` field
- Added `WorldActivityEventType` with three distinct event types
- Updated `emitActivityEvent()` to accept `type` parameter
- Maintained dual emission pattern (generic 'world' channel + type-specific channels)
- Updated `world.isProcessing` flag logic:
  - `true` for `response-start` and `response-end`
  - `false` only for `idle`

**core/index.ts:**
- Exported `WorldActivityEventType` instead of `WorldActivityEventState`

### Server/API Layer

**server/api.ts:**
- Updated activity event listener to use `type` field
- Changed `event.state === 'processing'` → `event.type === 'response-start'`
- Changed `event.state === 'idle'` → `event.type === 'idle'`

### CLI Layer

**cli/index.ts - WorldActivityMonitor class:**
- Updated `captureSnapshot()` to use `type` instead of `state`
- Refactored `handle()` method to check for valid event types
- Updated waiter state machine to track `seenProcessing` flag on `response-start` events
- Updated `waitForIdle()` logic to handle all three event types

**cli/index.ts - ActivityProgressRenderer class:**
- Replaced state/change checks with type checks
- Updated agent tracking on `response-start` and `response-end`
- Reset tracking on `idle`

**cli/stream.ts:**
- Updated `handleActivityEvents()` function
- Simplified conditional logic by removing compound checks
- All event type checks now use single `type` field

### Web/Frontend Layer

**web/src/pages/World.update.ts:**
- Updated activity event validation
- Changed all state/change condition checks to use `type`
- Updated worldEvent data structure (removed state/change, added type)
- Updated agent activity status tracking

## Files Modified

### Core (2 files)
- `core/activity-tracker.ts` - Event type definitions and emission logic
- `core/index.ts` - Type exports

### Server (1 file)
- `server/api.ts` - SSE handler for activity events

### CLI (2 files)
- `cli/index.ts` - Activity monitor and progress renderer classes
- `cli/stream.ts` - Activity event handling function

### Web (1 file)
- `web/src/pages/World.update.ts` - UI activity event handling

**Total:** 6 files modified

## Testing Results

### Automated Tests
- **Test Suite:** 624 passed, 13 skipped, 0 failed
- **TypeScript Compilation:** ✅ No errors
- **Linting:** ✅ No errors

### Test Coverage
All existing tests passed without modification, covering:
- Core functionality (export, message deletion, agents, events)
- Storage operations (agent, memory, world)
- API endpoints (chat, timestamp protection, case-insensitive lookup)
- Web domain logic (agent filtering, reply context)
- CLI operations (export command)
- Integration scenarios (message threading, chat management)

## Benefits Achieved

1. **Pattern Consistency** ✅
   - Activity events now match SSE and tool event patterns
   - Consistent discriminated union approach across all event types

2. **Simpler Consumer Logic** ✅
   - Reduced from compound conditions to single type checks
   - Example: `event.state === 'processing' && change === 'start'` → `event.type === 'response-start'`

3. **Better Type Safety** ✅
   - Discriminated unions work correctly with TypeScript
   - Compile-time validation of event types

4. **Clearer Semantics** ✅
   - Event type directly indicates what happened
   - No need to interpret state + change combinations

5. **Easier Debugging** ✅
   - Event logs more readable
   - Single field to check in debug output

6. **Future Extensibility** ✅
   - Easy to add new activity event types
   - Follows established pattern for new features

## Architecture Improvements

### Dual Emission Pattern Maintained
```typescript
world.eventEmitter.emit('world', payload);      // Generic channel
world.eventEmitter.emit(payload.type, payload); // Type-specific channel
```

Consumers can subscribe to:
- `'world'` - Catch all activity events
- `'response-start'` - Only start events
- `'response-end'` - Only end events
- `'idle'` - Only idle events

### Event Flow
1. **response-start** - Operation begins, `world.isProcessing = true`
2. **response-end** - Operation completes (but others may be ongoing), `world.isProcessing = true`
3. **idle** - All operations complete, `world.isProcessing = false`

### CLI Waiter Pattern
WorldActivityMonitor state machine correctly handles:
- Tracking when processing starts after target activity
- Resolving waiters when system becomes idle
- Timeout handling for all three event types

## Migration Notes

### Breaking Changes
None - This is an internal API refactoring. No external consumers affected.

### API Changes
- Removed: `WorldActivityEventState` type
- Removed: `change` field from `WorldActivityEventPayload`
- Added: `WorldActivityEventType` type
- Changed: Event payload now uses `type` field instead of `state`/`change`

### Before/After Comparison

**Event Emission (Before):**
```typescript
emitActivityEvent(world, 'processing', pending, activityId, source, 'start');
emitActivityEvent(world, 'processing', pending, activityId, source, 'end');
emitActivityEvent(world, 'idle', 0, activityId, source, 'end');
```

**Event Emission (After):**
```typescript
emitActivityEvent(world, 'response-start', pending, activityId, source);
emitActivityEvent(world, 'response-end', pending, activityId, source);
emitActivityEvent(world, 'idle', 0, activityId, source);
```

**Event Handling (Before):**
```typescript
if (event.state === 'processing' && event.change === 'start') {
  // Handle start
}
if (event.state === 'idle' && event.change === 'end') {
  // Handle idle
}
```

**Event Handling (After):**
```typescript
if (event.type === 'response-start') {
  // Handle start
}
if (event.type === 'idle') {
  // Handle idle
}
```

## Documentation

**Plan Document:** `.docs/plans/2025-10-30/plan-processing-event-refactor.md`
- Complete 10-phase implementation checklist
- Architecture review findings
- Risk analysis and mitigation
- Success criteria verification

## Related Work

This refactoring maintains consistency with:
- SSE streaming events (start, chunk, end, error)
- Tool execution events (tool-start, tool-result, tool-error, tool-progress)
- Event system architecture patterns

## Future Considerations

1. **Additional Event Types:** Easy to add new activity event types if needed (e.g., 'response-pause', 'response-resume')
2. **Event Metadata:** Can extend payload with additional fields without breaking pattern
3. **Event Filtering:** Type-specific channels enable efficient event filtering
4. **Monitoring:** Clearer event types improve observability and debugging

## Validation Checklist

- [x] TypeScript compilation clean
- [x] All tests passing (624/624)
- [x] No linting errors
- [x] Pattern consistency verified
- [x] Dual emission pattern working
- [x] CLI waiter logic functional
- [x] Web UI activity indicators working
- [x] SSE streaming correct
- [x] Multi-agent scenarios tested
- [x] Documentation updated

## Lessons Learned

1. **Pattern Consistency Matters** - Inconsistent patterns increase cognitive load for developers
2. **TypeScript Type Safety** - Discriminated unions provide excellent compile-time validation
3. **Test Coverage is Key** - All tests passed without modification, proving good isolation
4. **Plan First, Execute Second** - Architecture review caught critical issues before implementation
5. **Incremental Changes** - Layer-by-layer approach (core → server → CLI → web) minimized risk

## Team Notes

- No breaking changes for external APIs
- All existing functionality preserved
- Test suite validates correctness
- Pattern now consistent across entire codebase
- Future event types can follow this pattern
