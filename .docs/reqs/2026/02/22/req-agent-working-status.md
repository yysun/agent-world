# REQ: Agent Working Status — Centralized Global State (Electron)

**Date:** 2026-02-22  
**Status:** Reviewed  
**Scope:** Electron app (`electron/`)

---

## Overview

Track agent working status as a centralized global state in the Electron app.
All status computation must derive exclusively from core events.
Status display logic must be fully decoupled from status update logic.

---

## 1. Centralized Status Enums

Define a single, authoritative enum set covering all three levels of the hierarchy:

| Level  | Status Values                        |
|--------|--------------------------------------|
| Agent  | `idle`, `working`, `complete`        |
| Chat   | `idle`, `working`, `complete`        |
| World  | `idle`, `working`, `complete`        |

- These enums replace all existing ad-hoc status strings (`active`, `inactive`, `running`, `error`, etc.) for the purpose of working-status tracking.
- The enum set must live in a single shared module accessible throughout the Electron app.

---

## 2. Status Registry

A single **Status Registry** holds the working status for all worlds, chats, and agents in memory.

### Structure

```
StatusRegistry
└── world: WorldStatus
    └── chats: Map<chatId, ChatStatus>
        └── agents: Map<agentId, AgentStatus>
```

Each level:
- Stores its own current status value (from the enum above).
- Exposes a computed status derived from the statuses of its children (see §4).
- Can be queried independently (world status, chat status, agent status).

### Lifecycle

- The registry is populated (or re-populated) per-chat when the UI switches to a chat.
- On chat switch, all stored events for that chat are replayed first to reconstruct agent statuses, then live events continue to update them.

---

## 3. Status Update Rules (Event-Driven)

Agent status is the single source of truth. It is updated **solely** by core events — no polling, no heuristics, no timer-based inference.

### Observable Events That Drive Status

No "agent-start" or "agent-complete" event type currently exists as a single dedicated event. Status must be inferred from the events the core layer already emits. The mapping below defines the authoritative contract:

| Observable Core Event                        | Agent Status Transition |
|----------------------------------------------|-------------------------|
| `sse:start` (LLM streaming begins)           | `* → working`           |
| `tool-start` (tool execution begins)         | `* → working`           |
| `sse:end` **and** no active tools pending    | `working → complete`    |
| `sse:error` **and** no active tools pending  | `working → complete`    |
| `tool-result` (tool succeeds) **and** no active stream or tools pending | `working → complete` |
| `tool-error` **and** no active stream or tools pending | `working → complete` |
| `hitl-option-request` system event           | `working → complete`    |
| Chat/session reset or new chat               | `* → idle`              |

**Multi-hop tool handling:** An agent may cycle through LLM → tool → LLM → tool (up to 50 hops) within a single logical turn. Throughout this entire sequence the agent remains `working`. The agent is `complete` only when the final SSE stream ends with no more tools pending. The status update module must track a per-agent count of in-flight `sse` streams and `tool` calls; `complete` is triggered only when both counts reach zero.

**HITL semantics (intentional UX choice):**
- A `hitl-option-request` event means the agent has finished computing its current turn and submitted a question to the human. From the status-tracking perspective, the agent is `complete` — it has done its work and is waiting for input. The agent is technically suspended in the core layer, but this suspension is transparent to the status display.
- When the user submits a HITL answer, no broadcast event is emitted. The core resumes the agent directly via an IPC invoke (`HITL_RESPOND`), and the resumed agent emits `sse:start` shortly after, which naturally transitions status back to `working`. No explicit status tracking for the submission is required.
- There is deliberately no "paused" or "waiting" state. The status model is: `idle`, `working`, `complete` only.

**Agent with no events:** An agent that has never emitted any observable event (e.g., skipped because it was not mentioned, or conditions not met) has status `idle` by default and is counted as `idle` in the chat rollup.

### Prohibited Status Sources

The following must **not** drive agent status:
- Timer-based expiry or heartbeats.
- UI component lifecycle (mount/unmount).
- Polling or direct inspection of message arrays.
- Any non-core-event source other than the events listed above.

---

## 4. Derived Status Calculation

Chat and world statuses are **calculated** values, not stored independently.
They must be recomputed whenever any child status changes.

### Chat Status (from agent statuses)

| Condition                              | Chat Status  |
|----------------------------------------|--------------|
| All agents are `idle`                  | `idle`       |
| Any agent is `working`                 | `working`    |
| All agents are `complete` (none `working`) | `complete` |

- An agent with no recorded events is treated as `idle`.
- A chat with no agents is `idle`.

### World Status (from chat statuses)

| Condition                               | World Status  |
|-----------------------------------------|---------------|
| All chats are `idle`                    | `idle`        |
| Any chat is `working`                   | `working`     |
| All chats are `complete` (none `working`) | `complete`  |

- A world with no chats is `idle`.

### Complete Is Not Terminal

The status `complete` is not a final state. An agent or chat may transition from `complete` back to `working` when new work begins (e.g., next user turn, HITL response). The lifecycle is:

```
idle ─► working ─► complete ─► working ─► complete ...
```

There is no requirement to return through `idle` between turns.

---

## 5. Chat Switch / Event Replay

When the user switches to a chat:

1. Clear all agent statuses for that chat in the registry.
2. Load all stored events for that chat from persistent storage, ordered by their sequence/insertion order (the storage layer guarantees insertion order integrity).
3. Replay those events through the same status-update logic used for live events, to reconstruct the current agent statuses.
4. Once replay is complete, continue processing new live events.

This ensures status is always consistent with the full event history, regardless of when the user navigates to a chat.

**Replay ordering:** Events must be replayed in the order they were persisted (ascending by sequence ID or insertion order). The status module must not rely on wall-clock timestamps for ordering, as events may have identical millisecond timestamps.

---

## 6. Separation of Concerns

### Status Update Logic

- A dedicated module (or set of pure functions) receives core events and mutates the Status Registry.
- This module has no knowledge of UI components, React state, or rendering.

### Status Display Logic

- Display components read from the Status Registry only.
- Display components do **not** interpret events directly.
- Display components do **not** perform status calculations.
- The display layer subscribes to registry changes via a notification/pub-sub mechanism.

---

## 7. Migration: Remove Existing Status Logic

The following existing constructs must be removed and replaced by the new system:

- All ad-hoc agent/chat/world status strings and flags derived from SSE events in `chat-event-handlers.ts` (`onSessionResponseStateChange`, activity-based `isBusy`, `pendingOperations`).
- `useStreamingActivity` hook's responsibility for tracking working state (it may retain timer/tool-list responsibilities if those are not superseded).
- Any status display logic that interprets raw events rather than reading from the registry.
- Related existing tests that test the removed logic.

---

## 8. Tests

Create targeted unit tests that verify, in isolation:

1. **Agent status transitions — LLM streaming path**
   - `sse:start` moves agent to `working`.
   - `sse:end` with no pending tools moves agent to `complete`.
   - `sse:error` with no pending tools moves agent to `complete`.

2. **Agent status transitions — tool path**
   - `tool-start` moves agent to `working`.
   - `tool-error` with no pending stream/tools moves agent to `complete`.
   - Multi-hop: interleaved `sse:start → tool-start → sse:end → sse:start → sse:end` (two SSE rounds, one tool) keeps agent `working` until all in-flight signals drain.

3. **HITL transitions**
   - `hitl-option-request` moves agent to `complete`.
   - `hitl-option-response` moves agent to `working`.
   - Full cycle: `working → complete (hitl-request) → working (hitl-response) → complete (sse:end)`.

4. **Chat status derivation**
   - All agents `idle` → chat `idle`.
   - Any agent `working` → chat `working`.
   - All agents `complete`, none `working` → chat `complete`.
   - Agent with no events counted as `idle`.
   - Empty agent list → chat `idle`.

5. **World status derivation**
   - All chats `idle` → world `idle`.
   - Any chat `working` → world `working`.
   - All chats `complete`, none `working` → world `complete`.
   - Empty chat list → world `idle`.

6. **Event replay correctness**
   - Replaying a stored sequence of events produces the same final agent status as processing them live one-by-one in the same order.

7. **Chat switch isolation**
   - Switching chats clears the previous chat's agent statuses.
   - Replaying Chat B's events does not affect Chat A's agent statuses.
   - After switching back to Chat A, its statuses are reconstructed from its own events.

Tests must use in-memory storage only. No real LLM calls. No file system access.

---

## Out of Scope

- Changes to the web app (`web/`).
- Changes to `core/` business logic beyond event type definitions already consumed.
- Detailed tool-execution progress display (ToolEntry / tool cards) — these remain as-is unless directly entangled with the removed status logic.
- Audio or notifications triggered by status changes.
