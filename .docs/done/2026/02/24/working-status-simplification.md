# Working Status Simplification & Bug Fixes

**Date:** 2026-02-24
**Scope:** `electron/renderer/src/`, `electron/main-process/ipc-handlers.ts`

## Summary

Simplified the Electron app's agent working-status tracking to match the web app's simpler approach: direct state transitions instead of in-flight counters, deleted the dead `activity-state.ts` module, and fixed three bugs: a race condition causing missing messages, a stuck "working" indicator for live chats, and a stuck "working" indicator when entering historical chats.

---

## Bugs Fixed

### 1. Race condition — missing tool/message rows

**Root cause:** In `chat-event-handlers.ts`, the message handler called `setMessages` (upsert) before `endResponseStreamByMessage`/`endAllToolStreams`. This meant `handleEnd` re-tagged the final message as `isStreaming: true`, then `onStreamEnd` removed it from the list.

**Fix:** Reversed order — end streams first, then upsert. The final message is now upserted with `isStreaming: false` after all stream state is cleared.

### 2. Stuck "working" indicator — live chat

**Root cause:** No handler for `payload.type === 'activity'` events in `chat-event-handlers.ts`. The backend `response-end`/`idle` events (the authoritative "all done" signal) were forwarded by the main process but silently ignored by the renderer.

**Fix:** Added activity event handler at the bottom of `createChatSubscriptionEventHandler`. Triggers on `response-end` with `pendingOperations === 0` OR `idle`. Calls `streaming.cleanup()`, filters orphaned streaming placeholders from message list, and calls `clearChatAgents` to reset the status registry.

### 3. Stuck "working" indicator — entering historical chat

**Root cause (regression):** DB replay (`getChatEvents` in `App.tsx`) calls `applyEventToRegistry` for stored events. After removing counter arithmetic, `sse/end` became a no-op, leaving status stuck at `working` when the last stored event was `sse/start`.

**Secondary cause:** `message` events in the DB replay were skipped entirely because the guard `!agentName || !subtype` filtered them out — message payloads use `sender` (not `agentName`) and have no `type` field.

**Tertiary cause:** For interrupted sessions, `sse/end` may never have been stored (agent was killed mid-stream), so even correct replay logic would leave status at `working`.

**Fix (three-part):**
1. Restored `sse/end → complete` and `tool-result/error → complete` in `status-updater.ts`.
2. Fixed message event extraction in DB replay: use `payload.sender`, skip `human`/`user` senders.
3. Added `finalizeReplayedChat` — post-replay normalization that forces any remaining `working → complete`. Handles incomplete sequences from interrupted sessions.

### 4. False-positive "404 Message not found" on edit

**Root cause:** `editMessageInChat` in `ipc-handlers.ts` called `getMemory` (which requires the world to be in the runtime store) as a pre-check before delegating to `editUserMessage`. `getMemory` could fail when the message exists in SQLite but the world wasn't in the runtime store.

**Fix:** Removed the redundant pre-check. `editUserMessage` handles its own validation and is resilient via `getActiveSubscribedWorld` fallback.

---

## Architecture Changes

### Deleted: `activity-state.ts`

All six callbacks (`onToolStart`, `onToolResult`, `onToolError`, `onToolProgress`, `onElapsedUpdate`, `onBusyChange`) had become no-ops after the status-registry migration. Deleted the module and removed all wiring:
- `activityStateRef` removed from `useStreamingActivity`, `useChatEventSubscriptions`, `useMessageManagement`, `App.tsx` (three sites), `chat-event-handlers.ts`
- `ActivityRefs` interface and `ActivityState` type removed

### Simplified: `status-updater.ts`

Removed `inFlightSse`/`inFlightTools` counter arithmetic. Replaced with direct state transitions:

| eventType | subtype             | Effect            |
|-----------|---------------------|-------------------|
| `sse`     | `start`             | → `working`       |
| `sse`     | `end` / `error`     | → `complete`      |
| `tool`    | `tool-start`        | → `working`       |
| `tool`    | `tool-result/error` | → `complete`      |
| `system`  | `hitl-option-req.`  | → `complete`      |
| `message` | (any)               | → `complete`      |

The activity event handler (`clearChatAgents`) is the authoritative reset to `idle`.

### Added: `finalizeReplayedChat` (status-registry.ts)

Pure reducer that forces all `working` agents in a chat to `complete`. Used exclusively after DB replay to normalize incomplete event sequences.

---

## Files Changed

| File | Change |
|------|--------|
| `electron/renderer/src/activity-state.ts` | **Deleted** |
| `electron/renderer/src/domain/status-types.ts` | Removed `inFlightSse`, `inFlightTools` fields |
| `electron/renderer/src/domain/status-updater.ts` | Replaced counter arithmetic with direct transitions; added `message` type |
| `electron/renderer/src/domain/status-registry.ts` | Added `finalizeReplayedChat`; updated `syncWorldRoster` initial entry |
| `electron/renderer/src/domain/chat-event-handlers.ts` | Removed `ActivityRefs`; fixed race condition order; removed `tool-progress` branch; added activity event handler |
| `electron/renderer/src/hooks/useStreamingActivity.ts` | Removed `activityStateRef` and `createActivityState` effect |
| `electron/renderer/src/hooks/useChatEventSubscriptions.ts` | Removed `activityStateRef` and `ActivityState` type |
| `electron/renderer/src/hooks/useMessageManagement.ts` | Removed `activityStateRef` |
| `electron/renderer/src/App.tsx` | Removed `activityStateRef` (3 sites); fixed DB replay loop; added `finalizeReplayedChat` |
| `electron/main-process/ipc-handlers.ts` | Removed `getMemory` pre-check from `editMessageInChat` |

**Net:** 145 insertions, 377 deletions (−232 lines).
