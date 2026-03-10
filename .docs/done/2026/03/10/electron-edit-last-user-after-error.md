# DD: Electron Last User Message Editability After Error

**Date:** 2026-03-10  
**Status:** Done  
**Related REQ:** `.docs/reqs/2026/03/09/req-electron-edit-last-user-after-error.md`  
**Related AP:** `.docs/plans/2026/03/09/plan-electron-edit-last-user-after-error.md`

## Summary

Fixed the failed-turn edit path so Electron no longer replays the old failed last user message before an edit or delete mutation. Queue state is now the only automatic resume authority for user turns, restore no longer resends from persisted chat memory, failed user-turn queue dispatches stop using automatic backoff replay, and edit/delete IPC restores the chat in mutation mode with auto-resume suppressed.

Also changed failed-turn diagnostics handling:

- raw log lines remain in the logs panel only
- terminal agent-turn failures now publish one persisted chat-scoped `system` error event
- renderer transcript reload merges those persisted `system` error events back into the chat so the failure survives restart
- the latest failed user turn keeps its edit/delete action chrome visible when only diagnostic error rows follow it

## Root Cause

- Persisted chat inspection for `chat-1772819555736-rm4adolrr` showed two stored user messages after edit:
  - original failed prompt: `MekAJaXDUv0_kldQXofmz`
  - edited prompt: `wDkLVCmxoEaHqfanErNMt`
- The old failed prompt was auto-resumed during `restoreChat(...)` before the edit mutation removed and resubmitted the turn.
- This was not caused by losing `chatId`.
- The duplicate came from restore-time replay of the old failed user-last message, followed by the edited resubmission.

## Implemented Changes

### Core restore logic

- Added `RestoreChatOptions` with `suppressAutoResume?: boolean`.
- Removed restore-time resend from persisted user-last chat memory.
- Restore now resumes only queue-owned rows:
  - `queued` rows dispatch normally,
  - stale `sending` rows recover only when the latest post-message SSE is non-terminal,
  - stale `sending` rows are marked `error` when terminal SSE already post-dates them.
- Preserved pending assistant tool-call resume independently of user-turn replay.

### Queue failure handling

- Removed automatic exponential-backoff replay for failed user-authored queue dispatches.
- Queue dispatch failures now increment retry metadata once, transition the row to `error`, and wait for explicit user retry.
- No-response fallback and no-responder preflight failures now also land in durable `error` state instead of silently re-queueing.
- Stale `sending` rows are now also marked `error` when a newer message has already superseded that queued turn, preventing replay of obsolete work during restore.

### Queue boundary split

- Replaced the mixed-send helper with two explicit APIs:
  - `enqueueAndProcessUserTurn(...)` for queue-backed user-authored turns only
  - `dispatchImmediateChatMessage(...)` for assistant/tool/system/non-user immediate dispatch
- Queue ingress now rejects non-user senders instead of silently direct-publishing them through a queue-shaped API.
- Non-user sends continue to work, but they bypass queue persistence and queue lifecycle state entirely.
- Updated server, Electron main IPC, CLI, and core tool callers so user turns use the queue-only API and non-user dispatch uses the immediate path.

### Queue-backed edit resubmission

- `editUserMessage(...)` now resubmits edited content through `enqueueAndProcessUserTurn(...)` instead of direct `publishMessage(...)`.
- This unifies normal send, manual retry, and edit resubmission under the same queue-backed submission path.
- Removing a message turn now clears only the queue rows and persisted chat events that belong to the trimmed tail, so obsolete failed turns do not remain retryable after edit/delete while unrelated queued work is preserved.

### Electron IPC mutation flow

- `message:edit` now restores chat state with `restoreChat(worldId, chatId, { suppressAutoResume: true })`.
- `message:delete` now does the same before mutation and validates that the chat exists after restore.
- This prevents edit/delete flows from replaying the old failed turn during restore.

### Durable failed-turn diagnostics

- Terminal agent-turn failures now emit one structured `system` error event from core orchestration.
- Electron renderer now converts selected-chat `system` error events into transcript rows in realtime.
- On chat refresh/restart, Electron reloads persisted `system` error events from chat event storage and merges them into the transcript.
- Error logs remain in the right-side logs panel; the transcript uses the persisted `system` error row instead of replaying raw logs.
- Structured `system` error transcript rows now render with a red left border so failed-turn diagnostics are visually distinct from neutral system notices.

### Regression coverage

- Updated core restore tests for:
  - queue-owned failed turns not auto-resuming
  - queued turns resuming through queue dispatch
  - stale `sending` rows moving to `error` on terminal SSE
  - stale `sending` rows moving to `error` when superseded by a newer message
  - mutation restore mode suppressing auto-resume
- Updated queue validation tests for:
  - no memory-based resend on restore
  - failed dispatch/no-response/preflight paths moving directly to `error`
  - no automatic retry/backoff replay after failure
- Updated message-edit-manager tests to assert edit resubmission uses the queue-backed submit path and that trimming a turn clears stale queue rows.
- Updated Electron IPC tests to assert edit/delete restore the chat in mutation mode.
- Updated queue-manager, send-message-tool, CLI, API, and restore validation tests to assert the queue-only user API split and that non-user dispatch does not create queue rows.

## Verification

Passed:

- `npx vitest run tests/core/auto-resume-sse-error-guard.test.ts tests/core/message-edit-manager.test.ts tests/core/restore-chat-validation.test.ts tests/electron/main/main-ipc-handlers.test.ts`
- `npx vitest run tests/core/queue-manager.test.ts`
- `npm run integration`
- `npx vitest run tests/core/auto-resume-sse-error-guard.test.ts tests/core/message-edit-manager.test.ts tests/core/restore-chat-validation.test.ts`
- `npx vitest run tests/core/queue-manager.test.ts tests/core/restore-chat-validation.test.ts tests/core/message-edit-manager.test.ts tests/core/send-message-tool.test.ts tests/cli/process-cli-input.test.ts tests/electron/main/main-ipc-handlers.test.ts tests/api/messages-nonstreaming-collection.test.ts`

## Result

- A terminally failed last user turn remains the canonical edit target.
- Restore-time replay no longer recreates the old failed prompt during edit/delete.
- Queue is the only automatic resume authority for user turns.
- Queue ownership is now explicit at the API boundary: only user turns enter queue persistence, and non-user messages dispatch immediately.
- Failed user turns no longer auto-retry in the background; retry is explicit.
- Obsolete queue rows are cleared when a turn is trimmed, and superseded stale sends do not replay.
- Error rows remain diagnostic; editability stays anchored to the user message row.
