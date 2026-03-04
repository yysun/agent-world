# REQ: Configurable World Heartbeat (Refreshed)

**Date:** 2026-03-04  
**Last Updated:** 2026-03-04 (AR applied)  
**Status:** Planned (refreshed to match current codebase architecture)

---

## Summary

Add a configurable heartbeat mechanism to worlds so a world can periodically publish a predefined message (`sender='world'`) into that world's active chat.

This refresh aligns the requirement with the current architecture (modular Electron main-process runtime, IPC route builder, preload bridge, and renderer hooks/utils).

---

## Problem

Some workflows require autonomous periodic prompts/status nudges without manual user input. The current codebase has no world-level scheduled heartbeat feature.

---

## Requirements (WHAT)

1. Each world must support heartbeat configuration with:
   - `heartbeatEnabled` (boolean)
   - `heartbeatInterval` (cron expression)
   - `heartbeatPrompt` (message text)
2. When heartbeat is enabled and configuration is valid, heartbeat ticks must publish one message into that world's active chat.
3. Heartbeat-emitted messages must use `sender='world'`.
4. Heartbeat messages must go through the same world message flow as normal world messages (message event + persistence path), not a side channel.
5. If heartbeat is disabled, no scheduled heartbeat messages are emitted.
6. If a world has no active chat at tick time, that tick emits nothing.
7. Heartbeat behavior must remain world-scoped; changes in one world must not affect other worlds.
8. Heartbeat configuration must be updateable after world creation.
9. Invalid heartbeat config must not produce malformed or undefined runtime behavior.
10. Runtime lifecycle must be safe across workspace switches and world deletion (no orphan schedulers).
11. Runtime run/pause/stop controls (if exposed in settings) must affect scheduler state only; permanent enable/disable remains world config.

---

## Acceptance Criteria

- Given a world with `heartbeatEnabled=true`, valid interval, and prompt, when a tick occurs and `currentChatId` exists, one message is emitted with `sender='world'` and configured prompt content.
- Given `heartbeatEnabled=false`, no heartbeat messages are emitted.
- Given `heartbeatEnabled=true` but no active chat at tick time, no heartbeat message is emitted.
- Given two worlds with different heartbeat configs, each world emits according to only its own config.
- Given heartbeat config is updated, subsequent ticks reflect updated enablement/interval/prompt.
- Given workspace runtime reset or world deletion, associated heartbeat jobs stop cleanly.

---

## Assumptions

- Heartbeat scheduling runs in Electron main process runtime, not in renderer.
- Cron expression contract for this feature is strict 5-field format (minute hour dom month dow).
- UTC/local-time interpretation follows runtime defaults; no timezone selection is introduced in this scope.
- Heartbeat message publication uses existing world-scoped event emitters and persistence flow.

---

## AR Decisions (Options and Tradeoffs)

1. Scheduler location:
   - Option A: Electron main process.
   - Option B: Core library auto-runtime.
   - Decision: Option A.
   - Tradeoff: tighter coupling to desktop runtime, but avoids hidden behavior for API/web consumers and matches existing subscription lifecycle controls.
2. Runtime controls model:
   - Option A: Run/Pause/Stop controls mutate persisted world config.
   - Option B: Run/Pause/Stop are runtime-only controls.
   - Decision: Option B.
   - Tradeoff: potential state drift between config and runtime state, but safer for temporary operational control and aligns with settings-panel intent.
3. Tick behavior under contention:
   - Option A: queue missed ticks while world is busy/no chat.
   - Option B: drop skipped ticks.
   - Decision: Option B.
   - Tradeoff: simpler deterministic behavior and no backlog bursts, but missed ticks are not replayed.
4. Cron validation authority:
   - Option A: UI-only validation.
   - Option B: UI pre-validation plus authoritative main-process validation.
   - Decision: Option B.
   - Tradeoff: duplicate checks, but prevents invalid runtime schedules and malformed emission behavior.

---

## Affected Areas (WHAT, not HOW)

| Area | Required Change |
|---|---|
| `core/types.ts` | Add heartbeat fields to `CreateWorldParams` and `World` |
| `migrations/` | Add heartbeat migration after current `0015` baseline |
| `core/storage/sqlite-storage.ts` | Persist/load/list heartbeat fields |
| `core/events` path usage | Heartbeat publish must use normal `publishMessage(..., 'world', chatId)` path |
| `core/` exports | Expose heartbeat scheduling helpers from public core API |
| `electron/main-process` | Add heartbeat job manager + world subscription startup integration |
| `electron/main-process/ipc-handlers.ts` | Map heartbeat fields in `world:update`, startup/restart/stop flows |
| `electron/main-process/ipc-routes.ts` | Add heartbeat runtime-control channels if settings controls are supported |
| `electron/shared/ipc-contracts.ts` | Add heartbeat IPC constants and payload/response typing |
| `electron/preload/bridge.ts` | Expose heartbeat IPC methods |
| `electron/renderer/src/utils/app-helpers.ts` | Add heartbeat fields to world form helpers |
| `electron/renderer/src/utils/validation.ts` | Heartbeat input validation |
| `electron/renderer/src/components/RightPanelContent.tsx` | Add heartbeat section in edit-world + optional jobs section in settings |
| `electron/renderer/src/App.tsx` | Include heartbeat fields in unsaved-change detection |

---

## Out of Scope

- Web app (`web/`) heartbeat UX.
- Backfill/replay of missed ticks while runtime is offline.
- Per-chat heartbeat targeting beyond world `currentChatId`.
- Heartbeat policy changes for agent reply behavior.

---

## Notes

- Current codebase uses modular main-process layers (`ipc-handlers.ts`, `ipc-routes.ts`, `realtime-events.ts`, `workspace-runtime.ts`), so heartbeat design must follow that separation.
- Current world serialization (`serializeWorldInfo`) is explicit/whitelisted; heartbeat fields must be included intentionally.
- Current world update IPC path maps fields explicitly; heartbeat fields must be added explicitly.
- Runtime startup for heartbeat must be idempotent; repeated handler entrypoints must not create duplicate scheduled jobs.
