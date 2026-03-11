# restore-chat-parity

**Date:** 2026-03-11  
**Status:** Done

---

## Summary

Fixed a hanging e2e test (`chat-flow-matrix.spec.ts:68 › Loaded Current Chat › edit success`) caused by two separate root causes, and then expanded the fix to full Electron parity across all agent-interaction entry points in the server API.

---

## Root Causes

### 1. `chat-title-updated` wiping messages (frontend)

The `chat-title-updated` SSE system event triggered `initWorld` (full reload), which rebuilt `messages` from agent memory. After `deleteAllAgents` in the preceding e2e test, that rebuild returned empty messages — no edit buttons existed, so `editLatestUserMessage` hung indefinitely.

### 2. Stale server-side world runtime (server)

The e2e test bootstrap deletes+recreates the world between tests. The server's streaming `PUT` edit endpoint called `subscribeWorld` directly, which reused a stale in-memory runtime with `agents = []`. With no agents, the resubmitted message was dispatched but no agent processed it, so no `response-start` event was ever emitted and the SSE stream waited until the 3-minute timeout.

---

## Fixes

### Fix 1 — Frontend: `chat-title-updated` in-place title update (`web/src/pages/World.update.ts`)

Changed the `chat-title-updated` handler in `handleSystemEvent` to perform a lightweight in-place update using `structuredPayload.title` (already present in the event payload), instead of calling `initWorld`. `initWorld` is retained as a fallback only when the title is absent from the payload.

Also added explicit `error`/`queue-dispatch` event handling to surface queue dispatch failures as visible frontend error state.

### Fix 2 — Server: `restoreChat` before `subscribeWorld` in streaming edit path (`server/api.ts`)

Added `await restoreChat(worldCtx.id, chatId, { suppressAutoResume: true })` before `subscribeWorld` in the streaming `PUT /worlds/:worldName/messages/:messageId` handler. This mirrors Electron's `editMessageInChat` flow: `restoreChat → ensureWorldSubscribed → editUserMessage`.

`restoreChat` calls `syncRuntimeAgentMemoryFromStorage` internally, refreshing the agent list from SQLite before the subscription proceeds.

### Fix 3 — Core: `stopWorldRuntimesByWorldId` after world delete (`core/world-registry.ts`, `core/managers.ts`)

Added `stopWorldRuntimesByWorldId(worldId)` to `deleteWorld` so subsequent `subscribeWorld` calls after a world delete+recreate cycle create a fresh runtime from storage rather than inheriting stale state (empty agents, stale chat memory) from the previous incarnation.

### Fix 4 — Server: `restoreChat` on all send-message paths (`server/api.ts`)

Extended the Electron parity fix to `handleStreamingChat` and `handleNonStreamingChat` (both `POST /worlds/:worldName/messages` paths). Added `if (chatId) { await restoreChat(worldName, chatId); }` before `subscribeWorld` in each path, matching Electron's `sendChatMessage` pattern. This prevents stale-agent silences from agent add/delete operations that don't trigger a world recreate.

---

## Files Changed

| File | Change |
|------|--------|
| `web/src/pages/World.update.ts` | `chat-title-updated` in-place update; `queue-dispatch` error surfacing |
| `server/api.ts` | `restoreChat` added before `subscribeWorld` in 3 locations (streaming edit, streaming send, non-streaming send) |
| `core/world-registry.ts` | New `stopWorldRuntimesByWorldId` function |
| `core/managers.ts` | `deleteWorld` calls `stopWorldRuntimesByWorldId` after storage delete |
| `core/index.ts` | Re-exports `stopWorldRuntimesByWorldId` |
| `tests/api/message-edit-restore-chat.test.ts` | New regression tests (4 cases): restoreChat call-order verified for all 3 API paths |
| `tests/web-domain/world-crud-refresh.test.ts` | Updated `chat-title-updated` test: asserts no API call; verifies both `currentChat.name` and `world.chats[0].name` |

---

## Tests

- `tests/api/message-edit-restore-chat.test.ts` — 4/4 passing
  - `PUT` streaming: `restoreChat(suppressAutoResume: true)` before `subscribeWorld` ✅
  - `PUT` non-streaming: `restoreChat` NOT called (direct `editUserMessage` path) ✅
  - `POST` streaming: `restoreChat` before `subscribeWorld` ✅
  - `POST` non-streaming: `restoreChat` before `subscribeWorld` ✅
- `tests/web-domain/world-crud-refresh.test.ts` — 5/5 passing ✅
- All API tests: 47/47 passing ✅

---

## Reference

Electron canonical pattern (`electron/main-process/ipc-handlers.ts`):
- `sendChatMessage`: `restoreChat → ensureWorldSubscribed → enqueueAndProcessUserTurn`
- `editMessageInChat`: `restoreChat(suppressAutoResume: true) → ensureWorldSubscribed → editUserMessage`
- `deleteMessageFromChat`: `restoreChat(suppressAutoResume: true) → removeMessagesFrom`
