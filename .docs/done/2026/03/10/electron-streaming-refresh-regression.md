# Electron Streaming Refresh Regression

## Summary

Fixed an Electron renderer regression where live assistant streaming content disappeared and only the final assistant message remained visible.

## Root Cause

Assistant streaming rows created by the renderer streaming accumulator did not carry a `chatId`.

That broke the selected-chat refresh reconciliation path:

1. SSE `start` / `chunk` events created or updated a live assistant stream row.
2. The row existed in renderer state, but it was unscoped because `chatId` was missing.
3. A selected-chat refresh resolved while the stream was active.
4. `reconcileRefreshedMessagesWithLiveState(...)` only preserves live rows whose `chatId`
   matches the active chat.
5. The live assistant row was dropped until the canonical final assistant message arrived.

User-visible result: no incremental streaming, then the last message appeared at completion.

## Fix

- Added assistant-stream `chatId` support to `electron/renderer/src/streaming-state.ts`.
- Forwarded selected-chat `chatId` from Electron SSE handlers into streaming-state `handleStart(...)`
  and `handleChunk(...)`.
- Persisted that `chatId` onto live assistant rows in `electron/renderer/src/hooks/useStreamingActivity.ts`
  so refresh reconciliation can carry them forward safely.
- Updated `electron/AGENTS.md` to document that live assistant streaming rows must retain
  `chatId` inside renderer state, not just on the incoming SSE payload.

## Tests

- `npm test -- tests/electron/renderer/streaming-state.test.ts tests/electron/renderer/chat-event-handlers-domain.test.ts`
- `npm run integration`
- `npm run check`
