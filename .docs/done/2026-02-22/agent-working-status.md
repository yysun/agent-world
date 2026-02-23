# Done: Agent Working Status — Centralized Global State

**Date:** 2026-02-22
**Branch:** agent-status-fix
**Commit:** 64db4d3
**Req:** `.docs/reqs/2026-02-22/req-agent-working-status.md`
**Plan:** `.docs/plans/2026-02-22/plan-agent-working-status.md`

---

## What Was Built

Replaced all ad-hoc status tracking in the Electron renderer with a centralized, event-driven status registry scoped per agent/chat/world.

### New Files

| File | Purpose |
|------|---------|
| `electron/renderer/src/domain/status-types.ts` | `WorkingStatus` type + `StatusRegistry` shape |
| `electron/renderer/src/domain/status-registry.ts` | Pure registry factory + singleton pub/sub store |
| `electron/renderer/src/domain/status-updater.ts` | Pure `applyEventToRegistry` reducer |
| `electron/renderer/src/hooks/useWorkingStatus.ts` | React bridge; subscribes to registry mutations |
| `electron/renderer/src/components/WorkingStatusBar.tsx` | Presentational status display (idle/working/complete) |
| `tests/electron/renderer/status-registry.test.ts` | 18 registry unit tests |
| `tests/electron/renderer/status-updater.test.ts` | 15 updater unit tests |

### Deleted Files

- `electron/renderer/src/components/StatusActivityBar.tsx` — replaced by WorkingStatusBar
- `electron/renderer/src/domain/status-bar.ts` — replaced by status-registry
- `tests/electron/renderer/status-bar-domain.test.ts` — tests for deleted module

### Key Changes

**Phase 1 — Clean Slate:**
Removed `isBusy`, `elapsedMs`, `activeTools`, `activeStreamCount`, `sessionActivity`, `pendingResponseSessionIds`, `onSessionResponseStateChange`, `publishStatusBarStatus`, all status-bar publisher calls, and three helper functions (`getAgentWorkPhaseText`, `buildInlineAgentStatusSummary`, `getProcessedAgentsStatusText`) from 8 files.

**Phase 2–3 — Registry + Updater:**
Pure functions only. Registry uses `Map<string, WorldStatusEntry>` keyed by worldId/chatId/agentId. Status is derived from `inFlightSse` and `inFlightTools` counters. Rollup: any child `working` → parent `working`; all `complete` → `complete`; else `idle`.

**Phase 6 — Event Wiring:**
- `chat-event-handlers.ts`: calls `updateRegistry(r => applyEventToRegistry(...))` after SSE, tool, and HITL events
- `agentName` threaded through HITL flow (`hitl.ts` → `hitl-tool.ts` → `serializeRealtimeSystemEvent`)
- `serializeRealtimeToolEvent` now includes `agentName` (was always null before)
- New `CHAT_GET_EVENTS` IPC channel for stored event replay on session switch

**Phase 6.2b — Chat Switch Replay:**
On `selectedSessionId` change: clears registry for the new chat (`clearChatAgents`), then fetches stored events via `api.getChatEvents` and replays SSE/tool events through `applyEventToRegistry` to reconstruct status.

**Phase 6.3 — World Roster Sync:**
Single `useEffect` on `[loadedWorld, sessions]` calls `syncWorldRoster` to non-destructively add/remove agents and chats in the registry after any CRUD operation.

**Phase 7 — WorkingStatusBar:**
Purely presentational. Shows `ActivityPulse` + per-agent `ThinkingIndicator` when `working`; static "Done" when `complete`; nothing when `idle`. Wired into `App.tsx` via `useWorkingStatus` hook.

---

## Test Results

- **956 tests passing**, 1 pre-existing failure (`shell-cmd-integration.test.ts` — unrelated)
- 33 new unit tests for registry and updater logic
- TypeScript passes clean (`tsc --noEmit`)
