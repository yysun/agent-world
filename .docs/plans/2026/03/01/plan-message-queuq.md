# Plan: User Message Queue Implementation

**Date:** 2026-03-01  
**Requirements:** [req-message-queue.md](../../reqs/2026/03/01/req-message-queue.md)  
**Target:** Electron Desktop App  
**Architecture Baseline:** AR #3 (DB-native, core-driven queue processing)  
**Estimated Effort:** 10-14 hours

---

## Implementation-Ready Summary

This plan intentionally contains only the approved AR #3 architecture.

1. Queue data is persisted in SQLite (`agent_memory`) via a new `status` column.
2. Queue processing is owned by `core/managers.ts` (not renderer hook loops).
3. Renderer responsibilities are display and control via IPC only.
4. Processing is sequential and chat-scoped, and advances after full response completion.
5. Queue state survives restart; interrupted `sending` rows are recovered to `queued`.

---

## Final Architecture Decisions

### Storage Model

- Add migration: `migrations/0015_add_message_status.sql`.
- Add column: `agent_memory.status TEXT DEFAULT NULL`.
- Add index: `idx_agent_memory_queue` on `(world_id, chat_id, status)` with `WHERE status IS NOT NULL`.

### Queue Status Lifecycle

- Pending in queue: `status='queued'`
- In-flight queued message: `status='sending'`
- Completed: `status=NULL`
- Failed after retries: `status='error'`
- Stopped/skipped remainder: `status='cancelled'`

### Processing Ownership

- Core path in `core/managers.ts` drives queue advancement.
- Renderer does not implement async queue loops.
- Queue advance trigger points:
	- `restoreChat()` on chat activation
	- response completion path after each processed queued message

### Pause/Resume/Stop Semantics

- `pause`: prevent starting next queued item after current completion
- `resume`: clear pause flag and re-trigger queue check
- `stop`: keep current behavior for in-flight message via `api.stopMessage()` if needed, and mark remaining queued items `cancelled`

---

## End-to-End Flow

1. User adds message via `Add to Queue`.
2. Renderer calls `api.addToQueue(worldId, chatId, content, sender)`.
3. Main process inserts `agent_memory` row with `role='user', status='queued'`.
4. On chat activation (`restoreChat`) or response completion, core loads next queued item.
5. Core sets next item to `status='sending'` and publishes with existing message pipeline.
6. On successful completion, core clears queued message status to `NULL`.
7. Core checks for next queued item and repeats until queue empty or paused.

---

## Phased Implementation Checklist

## Phase 1: Database and Storage

**Goal:** Add durable queue status support in persistence layer.

> **Implementation note:** Used a dedicated `message_queue` table instead of `agent_memory.status`
> to avoid the `agent_id` FK constraint on `agent_memory` (FK enforcement is ON by default).
> Same status lifecycle and index strategy apply.

- [x] Create `migrations/0015_add_message_queue.sql`:
	- [x] `CREATE TABLE message_queue (...)` with world_id, chat_id, message_id, content, sender, status, retry_count
	- [x] Unique index on `message_id`, composite index on `(world_id, chat_id, status)`
- [x] Startup recovery query:
	- [x] `recoverSendingMessages()` resets `status='sending'` to `status='queued'`
- [x] Extend storage APIs in `core/storage/sqlite-storage.ts` + `storage-factory.ts`:
	- [x] `getQueuedMessages(worldId, chatId)`
	- [x] `addQueuedMessage(worldId, chatId, messageId, content, sender)`
	- [x] `updateMessageQueueStatus(messageId, status)`
	- [x] `incrementQueueMessageRetry(messageId)`
	- [x] `removeQueuedMessage(messageId)`
	- [x] `cancelQueuedMessages(worldId, chatId)`
	- [x] `recoverSendingMessages()`
	- [x] `deleteQueueForChat(worldId, chatId)`
- [x] Add `QueuedMessage` type and `QueueMessageStatus` to `core/types.ts`
- [x] Add optional queue methods to `StorageAPI` interface

## Phase 2: Core Queue Chaining

**Goal:** Run queue processing from core, sequentially and safely.

- [x] Add `triggerPendingQueueResume(world, chatId)` in `core/managers.ts`.
- [x] Call queue-resume trigger from `restoreChat()`.
- [x] Hook queue advancement from response-complete path.
- [x] Reuse dedup/in-flight guards to prevent double processing.
- [x] Ensure queue progression is blocked while `hasActiveChatMessageProcessing()` is true.

## Phase 3: IPC and Bridge

**Goal:** Expose queue operations to renderer.

- [x] Add IPC routes in `electron/main-process/ipc-routes.ts`:
	- [x] `queue:add`
	- [x] `queue:get`
	- [x] `queue:remove`
	- [x] `queue:clear`
	- [x] `queue:pause`
	- [x] `queue:resume`
	- [x] `queue:stop`
- [x] Add preload bridge methods in `electron/preload/bridge.ts`:
	- [x] `api.addToQueue`
	- [x] `api.getQueuedMessages`
	- [x] `api.removeFromQueue`
	- [x] `api.clearQueue`
	- [x] `api.pauseChatQueue`
	- [x] `api.resumeChatQueue`
	- [x] `api.stopChatQueue`

## Phase 4: Renderer Hook and UI Integration

**Goal:** Add queue UI and controls without processing loops.

- [x] Create `electron/renderer/src/hooks/useMessageQueue.ts`:
	- [x] load and refresh queue data for selected chat
	- [x] bind add/remove/edit/pause/resume/stop actions to IPC
	- [x] react to queue update events from core/main
- [x] Integrate hook in `App.tsx`.
- [x] Add `MessageQueuePanel.tsx` and `QueueMessageItem.tsx`.
- [x] Update composer with `Add to Queue` action.
- [x] Hide queue panel when queue is empty.

## Phase 5: Error Handling and UX Guarantees

**Goal:** Ensure robust behavior for expected failures and control actions.

- [x] Retry policy: up to 3 attempts with exponential backoff before `error`.
- [x] Display `Retry` and `Skip` actions for `error` messages.
- [x] Ensure in-flight row is not editable/deletable in UI.
- [x] Session delete path clears queue rows tied to session (ON DELETE CASCADE in migration).
- [x] World/chat switch behavior pauses queue advancement and preserves DB state.

## Phase 6: Tests and Verification

**Goal:** Land feature with deterministic coverage.

- [ ] Unit tests (core/storage):
	- [ ] queue retrieval ordering and filtering
	- [ ] status transitions (`queued` -> `sending` -> `NULL`)
	- [ ] recovery (`sending` -> `queued`)
	- [ ] cancel behavior (`queued` -> `cancelled`)
- [ ] Unit tests (core/managers):
	- [ ] queue trigger with 0/1/N rows
	- [ ] chain advancement after response completion
	- [ ] dedup guard for concurrent triggers
- [ ] Unit tests (renderer hook/components):
	- [ ] initial load + session switch refresh
	- [ ] IPC method invocation per user action
	- [ ] state rendering for queued/sending/error/cancelled
- [ ] Integration tests:
	- [ ] add 3 queued messages and verify ordered processing
	- [ ] pause after first item, resume, verify continuation
	- [ ] stop and verify remaining queued items become `cancelled`

---

## Source File Map

- `migrations/0015_add_message_status.sql`
- `core/managers.ts`
- `core/storage/*` (queue data access)
- `electron/main-process/ipc-routes.ts`
- `electron/preload/bridge.ts`
- `electron/renderer/src/hooks/useMessageQueue.ts`
- `electron/renderer/src/components/MessageQueuePanel.tsx`
- `electron/renderer/src/components/QueueMessageItem.tsx`
- `electron/renderer/src/components/index.ts`
- `electron/renderer/src/components/ComposerBar.tsx`

---

## Definition of Done

- [x] No superseded architecture paths remain in implementation docs.
- [x] Queue processing runs only through core-managed chaining.
- [x] DB status lifecycle is enforced (queued → sending → removed | error | cancelled).
- [x] Pause/resume/stop semantics implemented (FR-8: auto-pause on chat switch).
- [ ] Targeted unit tests added/updated and passing.
- [ ] Integration tests passing (`npm run integration`).
