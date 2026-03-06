# Requirements: Queue-Based Status Visibility

**Date:** 2026-03-06
**Feature Branch:** feature/heart-beat
**Status:** Draft

---

## Current State

| Entity | Status Field | Values | Limitation |
|---|---|---|---|
| `World` | `isProcessing: boolean` (in-memory) | `true` / `false` | Lost on restart; no granularity |
| `Agent` | `status: string` | `'active' \| 'inactive' \| 'error'` | Lifecycle only — not "is responding now" |
| Chat | Inferred from `activeChatIds` in activity events | set of chat IDs | No "waiting in queue" signal |
| `QueuedMessage` | `status: QueueMessageStatus` | `'queued' \| 'sending' \| 'error' \| 'cancelled'` | Lives in SQLite but not surfaced to frontend |

---

## Overview

The system has a message queue (per-world, per-chat) that tracks messages as `queued`, `sending`, `error`, or `cancelled`. Currently, this queue state is not surfaced to the world/chat/agent working-status layer or the frontend. Clients only see a coarse `isProcessing` boolean and activity events that reflect active LLM processing — they have no visibility into messages that are waiting in queue. This requirement defines what new status information must be exposed.

---

## Problem Statements

1. **No "pending/queued" state per chat.** A chat can have messages waiting in the queue (`status = 'queued'`) before any agent starts responding. The frontend only learns about activity when processing begins (`response-start`). There is a blind spot between "user sent message" and "agent started responding."

2. **No per-agent working indicator.** When multiple agents are active in a world, there is no way to know which specific agent is currently generating a response. The `activeChatIds` set identifies chats in flight, but not which agents within those chats are busy.

3. **Heartbeat injects into saturated queues.** The heartbeat skip guard checks `world.isProcessing`, but does not check whether there are already-queued or in-flight messages for that chat in the queue. A heartbeat tick can add duplicate messages while the queue is occupied.

4. **`isProcessing` is stale after restart.** `world.isProcessing` is in-memory only. After a server restart, any messages stuck in `sending` state in the queue leave `isProcessing` as `false`, causing guards (heartbeat, deduplication) to behave incorrectly.

5. **No aggregate world-status snapshot.** There is no REST endpoint that provides a point-in-time health snapshot of a world's queue and processing state, making it difficult for operators or external clients to assess world health without subscribing to SSE.

---

## Requirements

### R1 — Queued Chat Visibility in Activity Events

The `WorldActivityEventPayload` emitted on every `world` event MUST include a `queuedChatIds` field listing the chat IDs that have at least one message in `queued` status in the message queue.

- `queuedChatIds` must be derived from the persistent queue store at emit time.
- `queuedChatIds` must be distinct from `activeChatIds` (those currently being processed).
- A chat ID should appear in `queuedChatIds` if it has `queued`-status rows and is NOT in `activeChatIds`.
- The frontend MUST be able to derive three distinct per-chat states from this data:
  - **idle** — not in `activeChatIds`, not in `queuedChatIds`
  - **queued** — in `queuedChatIds` (waiting, not yet processing)
  - **working** — in `activeChatIds` (LLM actively responding)

### R2 — Per-Agent Working Status in Activity Events

The `WorldActivityEventPayload` MUST include an `activeAgentNames` field listing the names of agents currently generating responses.

- This is derived from which agents are subscribed to chats in `activeChatIds`.
- If no agent association is known for a chat, the field may be empty for that chat.
- The frontend MUST be able to show a per-agent "thinking" or "working" indicator using this field.

### R3 — Heartbeat Guard: Queue Depth Check

The heartbeat tick guard MUST be updated so that the heartbeat skips if there are any `queued` or `sending` messages for `currentChatId` in the message queue, in addition to the existing `isProcessing` check.

- This prevents the heartbeat from injecting new messages into a chat that is already backlogged or mid-response.
- The check must be performed against the same persistent queue store used by the queue processor.

### R4 — Derive `isProcessing` from Queue on World Load

When a world is loaded or initialized, `isProcessing` MUST be derived from the actual queue state rather than defaulting to `false`.

- If any message for the world has status `sending` in the queue at load time, `isProcessing` must be set to `true` (or equivalent busy state).
- Existing behaviour of resetting stuck `sending` → `queued` during startup recovery is preserved and happens before this check.
- This ensures heartbeat guards and other consumers of `isProcessing` see a correct value immediately after restart.

### R5 — World Status REST Endpoint

A new REST endpoint `GET /worlds/:id/status` MUST return a JSON snapshot of the world's current queue and processing state.

Response shape:
```json
{
  "worldId": "string",
  "isProcessing": "boolean",
  "activeChatIds": ["string"],
  "queuedChatIds": ["string"],
  "activeAgentNames": ["string"],
  "queueDepth": "number",
  "sendingCount": "number"
}
```

- `queueDepth`: total count of messages with status `queued` for this world.
- `sendingCount`: total count of messages with status `sending` for this world.
- This endpoint is read-only and does not mutate any state.
- Availability of this endpoint should not require an active SSE connection.

---

## Out of Scope

- Persisting per-agent status to the database (agent `status` field remains lifecycle-only: `active/inactive/error`).
- Real-time per-token agent progress beyond what SSE already provides.
- Queue management operations (pause, cancel, reprioritize) via the status endpoint.
- Multi-world aggregate status.

---

## Acceptance Criteria

| # | Criterion |
|---|---|
| AC1 | Activity events include `queuedChatIds`; frontend can distinguish idle / queued / working per chat |
| AC2 | Activity events include `activeAgentNames`; frontend can show per-agent working indicator |
| AC3 | Heartbeat does not fire when `currentChatId` has queued or sending messages |
| AC4 | After server restart, `isProcessing` reflects actual queue state for all worlds |
| AC5 | `GET /worlds/:id/status` returns a correct JSON snapshot with all specified fields |
| AC6 | All new behaviour is covered by unit tests; no regressions in existing tests |
