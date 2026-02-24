# Test Fixes and Shell stdout Streaming Corrections

**Date:** 2026-02-24

## Summary

Completed test suite repair following the working-status simplification (activity-state.ts deletion) and fixed two gaps identified during code review: missing test coverage for the `tool-start` command metadata path, and an empty-stdout flicker in the shell_cmd SSE streaming path.

## Changes Made

### 1. `tests/electron/renderer/chat-event-handlers-domain.test.ts`

**Problem:** `activityStateRef` was still referenced throughout the test file after `activity-state.ts` was deleted and `activityStateRef` was removed from `ChatHandlerOptions`. TypeScript errors and two failing tests.

**Fixes:**
- Removed `makeFullActivityRef()` helper function entirely.
- Added `cleanup: vi.fn()` to `makeFullStreamingRef()` and the inline streaming ref, matching the updated `RealtimeRefs` interface.
- Removed all `activityStateRef` parameters from every `createChatSubscriptionEventHandler` call (13 occurrences).
- Rewrote "delegates SSE and tool lifecycle events to state managers" → "delegates SSE start events to streaming state manager": retains `handleStart` and `endAllToolStreams` assertions; drops the removed `handleToolStart`/`handleToolResult` activity ref assertions.
- Rewrote "routes unscoped tool-result events to activity state" → "processes unscoped tool-result events without error": verifies the handler does not throw and that `endAllToolStreams` is called.

**New tests added (CR gap fix):**
- `propagates tool-start command to subsequent tool-stream chunk` — verifies that a `tool-start` event with `toolInput.command` stores the command in `toolCommandByUseId`, and a subsequent `tool-stream` SSE chunk for the same `toolUseId` passes the command through to both `handleToolStreamStart` and `handleToolStreamChunk`.
- `backfills tool-start command onto pre-existing tool-stream row` — verifies late `tool-start` events (arriving after a tool-stream row was already created) backfill the `command` and `toolName` onto the existing message row in the messages list.

### 2. `tests/electron/main/main-ipc-handlers.test.ts`

- Removed stale `expect(getMemory).toHaveBeenCalledWith('world-1', 'chat-1')` assertion (pre-check was removed from the IPC handler in a prior session).
- Deleted the "rejects edit when target message is not a user message" test (role enforcement was removed from the edit handler).

### 3. `tests/electron/renderer/activity-state.test.ts`

- Deleted. The `activity-state.ts` module it tested was deleted as part of the working-status simplification. All 8 tests were stale.

### 4. `core/shell-cmd-tool.ts` — Lazy stdout SSE start (CR gap fix)

**Problem:** The SSE `start` event for stdout was emitted unconditionally before `executeShellCommand`. Commands that produce no stdout (e.g., `mkdir`, `rm`) would briefly show a streaming placeholder (`'...'`) that disappears with no replacement — a visible flicker.

**Fix:** Replaced the unconditional pre-execution `start` block with a lazy init inside `emitStdoutToolStreamChunk`:
- Added `let stdoutStartEmitted = false` flag.
- On the first stdout chunk, emit SSE `start` then set `stdoutStartEmitted = true`.
- Removed the pre-execution `start` block.
- Guarded the post-execution `end` + `publishMessageWithId` block with `&& stdoutStartEmitted` — both are skipped entirely when no stdout was produced.

**Result:** Commands with no stdout output emit no SSE events; no streaming placeholder appears. Commands with stdout still stream live with SSE start/chunk/end as before.

## Test Results

- **Before:** 4 test failures across 3 files (chat-event-handlers-domain, main-ipc-handlers, activity-state).
- **After:** 100 test files, 952 tests, all passing.
- Net change: +2 new tests, -8 deleted (activity-state), -7 stale (role-check, getMemory assertion, old activity ref tests).

## Files Changed

| File | Change |
|------|--------|
| `core/shell-cmd-tool.ts` | Lazy stdout SSE start (no flicker for empty stdout) |
| `tests/electron/renderer/chat-event-handlers-domain.test.ts` | Remove activityStateRef; add tool-start command metadata coverage |
| `tests/electron/main/main-ipc-handlers.test.ts` | Remove stale assertions |
| `tests/electron/renderer/activity-state.test.ts` | Deleted (module removed) |
