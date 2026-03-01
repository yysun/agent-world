# Done: User Message Queue

**Date:** 2026-03-01
**Branch:** `feature/message-queue`
**Commit:** `4dc42af`
**Requirements:** [req-message-queue.md](../../reqs/2026/03/01/req-message-queue.md)
**Plan:** [plan-message-queuq.md](../../plans/2026/03/01/plan-message-queuq.md)

---

## Summary

Implemented a persistent, core-driven user message queue for the Electron desktop app. Users can queue messages for sequential delivery to agents, with pause/resume/stop controls and automatic retry logic.

---

## Architecture: AR #3 (DB-native, core-driven)

- Queue data persisted in SQLite (`message_queue` table), not localStorage or memory.
- Core owns all queue processing logic — renderer is display-only.
- Sequential processing: one queued message per chat at a time.
- Queue state survives app restart; interrupted `sending` rows recovered to `queued`.

**Key deviation from original plan:** Used a dedicated `message_queue` table instead of an `agent_memory.status` column, because `agent_memory` has a `FOREIGN KEY (agent_id, world_id)` constraint with `PRAGMA foreign_keys = ON`. Queued messages have no `agent_id` until sent.

---

## What Was Built

### Phase 1 — Database & Storage
- **`migrations/0015_add_message_queue.sql`**: New `message_queue` table with `ON DELETE CASCADE` on `world_id` and `chat_id` FKs (handles session-delete cleanup automatically).
- **`core/types.ts`**: Added `QueueMessageStatus`, `QueuedMessage` interface, and 9 optional queue methods to `StorageAPI`.
- **`core/storage/sqlite-storage.ts`**: Implemented `getQueuedMessages`, `addQueuedMessage`, `updateMessageQueueStatus`, `incrementQueueMessageRetry`, `resetQueueMessageForRetry`, `removeQueuedMessage`, `cancelQueuedMessages`, `recoverSendingMessages`, `deleteQueueForChat`.
- **`core/storage/storage-factory.ts`**: Wrapper + SQLite bindings for all queue functions.

### Phase 2 — Core Queue Processing
- **`triggerPendingQueueResume(world, chatId)`**: Finds next `queued` row, marks it `sending`, publishes via `publishMessageWithId`. Guards: pause flag, active-processing check, per-chat dedup set.
- **`attachQueueAdvanceListener(world, chatId)`**: Hooks into `world.eventEmitter.on('world', ...)` for `idle`/`response-end` events. On completion, removes the `sending` row and chains to next item.
- **Retry policy**: On publish failure, increments `retry_count`. If `< 3`, reverts to `queued` and reschedules with exponential backoff (1s, 2s, 4s). At 3 retries, marks `error`.
- **`restoreChat()` integration**: Auto-pauses the previous chat's queue and auto-resumes the new chat's queue on session switch (FR-8).
- **Startup recovery**: `recoverSendingMessages()` called in `initializeModules()`.
- **Exported functions**: `addToQueue`, `getQueueMessages`, `removeFromQueue`, `pauseChatQueue`, `resumeChatQueue`, `stopChatQueue`, `clearChatQueue`, `retryQueueMessage`.

### Phase 3 — IPC / Bridge
- **8 IPC channels** in `DESKTOP_INVOKE_CHANNELS`: `queue:add/get/remove/clear/pause/resume/stop/retry`.
- **`ipc-contracts.ts`**: Channel constants, `QueueAddPayload`, `DesktopApi` queue methods.
- **`ipc-handlers.ts`**: Validated handler implementations with `ensureCoreReady` guard.
- **`bridge.ts`**: Preload bridge methods for all queue operations.
- **`main.ts`**: Core function imports, handler wiring, route registration.

### Phase 4 — Renderer Hook & UI
- **`useMessageQueue.ts`**: Loads queue on session switch, refreshes when `messages.length` changes (queue items consumed), exposes all queue actions.
- **`MessageQueuePanel.tsx`**: Queue display with Pause/Resume/Stop/Clear controls; auto-hides when empty.
- **`QueueMessageItem.tsx`**: Status badge (`queued`/`sending`/`error`/`cancelled`), Remove button (disabled while `sending`), Retry button for `error` items.
- **`ComposerBar.tsx`**: "Queue" button added alongside Send; composer clears on queue add.
- **`App.tsx`**: Hook integrated; panel rendered in `statusBar` slot.

### Phase 5 — Error Handling & UX Guarantees
- Automatic retry (3 attempts, exponential backoff) before `error` state.
- `retryQueueMessage`: resets `status='queued'` and `retry_count=0` for user-triggered retries.
- Retry/Skip UI actions on `error` items in `QueueMessageItem`.
- In-flight (`sending`) items non-removable in UI (`disabled`).
- Session delete automatically clears queue via `ON DELETE CASCADE`.
- Chat-switch auto-pause/resume implemented in `restoreChat()`.

---

## Status Lifecycle

```
queued → sending → (row deleted — message now in chat history)
queued → cancelled  (stop/clear action)
sending → queued    (startup recovery)
sending → error     (3 retries exhausted)
error → queued      (user retries via UI)
```

---

## Files Changed

| File | Change |
|------|--------|
| `migrations/0015_add_message_queue.sql` | New |
| `core/types.ts` | QueuedMessage types + StorageAPI methods |
| `core/index.ts` | Queue function exports |
| `core/managers.ts` | Queue processing engine |
| `core/storage/sqlite-storage.ts` | 9 queue storage functions |
| `core/storage/storage-factory.ts` | Queue wrappers + SQLite bindings |
| `electron/shared/ipc-contracts.ts` | 8 channels, payload types, DesktopApi |
| `electron/main-process/ipc-routes.ts` | Handler interface + routes |
| `electron/main-process/ipc-handlers.ts` | Handler implementations |
| `electron/preload/bridge.ts` | Bridge methods |
| `electron/main.ts` | Import + wire queue functions |
| `electron/renderer/src/hooks/useMessageQueue.ts` | New |
| `electron/renderer/src/components/MessageQueuePanel.tsx` | New |
| `electron/renderer/src/components/QueueMessageItem.tsx` | New |
| `electron/renderer/src/components/ComposerBar.tsx` | Queue button |
| `electron/renderer/src/components/index.ts` | New component exports |
| `electron/renderer/src/utils/app-layout-props.ts` | onAddToQueue prop |
| `electron/renderer/src/App.tsx` | Hook integration + panel render |

---

## Remaining Work (Phase 6 — Tests)

- Unit tests for storage (ordering, status transitions, recovery, cancel)
- Unit tests for core/managers (trigger with 0/1/N rows, chain advancement, dedup guard)
- Unit tests for renderer hook/components (load + session switch, IPC invocation per action, state rendering)
- Integration tests (3-message ordered processing, pause/resume, stop with cancellation)
