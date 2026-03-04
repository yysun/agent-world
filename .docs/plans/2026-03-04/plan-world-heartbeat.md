# Plan: World Heartbeat (Refreshed for Current Architecture)

**Date:** 2026-03-04  
**Last Updated:** 2026-03-04 (AR applied)  
**Req:** `.docs/reqs/2026-03-04/req-world-heartbeat.md`

---

## Current Baseline (March 2026)

- Heartbeat world fields are not present in `core/types.ts`.
- Latest migration is `migrations/0015_add_message_queue.sql`; heartbeat migration must use next number.
- SQLite world persistence currently stores: `id/name/description/turn_limit/main_agent/chat_llm_provider/chat_llm_model/current_chat_id/mcp_config/variables`.
- Electron main process now uses modular runtime files:
  - `electron/main-process/ipc-handlers.ts`
  - `electron/main-process/ipc-routes.ts`
  - `electron/main-process/realtime-events.ts`
  - `electron/main-process/workspace-runtime.ts`
- Renderer world forms come from:
  - `electron/renderer/src/utils/app-helpers.ts`
  - `electron/renderer/src/utils/validation.ts`
  - `electron/renderer/src/components/RightPanelContent.tsx`
  - Unsaved-change checks in `electron/renderer/src/App.tsx`

---

## AR Findings and Resolutions

1. High: startup trigger ambiguity can create missing jobs or duplicate jobs.
  - Finding: heartbeat startup tied only to one IPC path is fragile.
  - Resolution: add a single idempotent startup entry in main runtime flow; guard with per-workspace initialization flag + per-world dedupe.
2. High: pause/resume design must keep resumable task handles.
  - Finding: storing only `stopFn` cannot support true resume semantics.
  - Resolution: manager stores scheduler task handles and explicit status, with `pause`/`resume` mapped to task lifecycle operations.
3. High: renderer cannot round-trip heartbeat fields unless explicitly serialized.
  - Finding: `serializeWorldInfo` is explicit whitelist.
  - Resolution: include heartbeat fields in world serialization and unsaved-change comparison surfaces.
4. Medium: cron contract mismatch risk.
  - Finding: library validation may permit formats outside product contract.
  - Resolution: enforce strict 5-field policy in validation layer before scheduler registration.
5. Medium: update/delete race risk with in-flight ticks.
  - Finding: config update and delete can overlap with scheduled callback execution.
  - Resolution: manager uses per-world operation sequencing (mutex/serialization) and ignores stale callbacks after stop/restart.

---

## Architecture Snapshot

```mermaid
graph TD
    subgraph Electron Main Process
        WS[workspace-runtime ensureCoreReady] --> IHD[ipc-handlers load/list worlds]
        IHD --> HE{world heartbeatEnabled?}
        HE -- yes --> SUB[realtime-events ensureWorldSubscribed(worldId)]
        SUB --> HBM[heartbeat-manager startOrRestart(world)]
        HBM --> CRON[node-cron ScheduledTask]
        CRON --> TICK[tick]
        TICK --> CHK{isProcessing or no currentChatId}
        CHK -- yes --> SKIP[skip tick]
        CHK -- no --> PUB[publishMessage(world, prompt, 'world', chatId)]
        UPD[world:update IPC] --> HBM
        DEL[world:delete IPC] --> STOP[heartbeat-manager stop(worldId)]
        RST[realtime reset / workspace switch] --> STOPALL[heartbeat-manager stopAll]
    end

    subgraph Renderer
        EWF[Edit World Form] --> IPCU[world:update]
        SET[Settings Panel Jobs] --> HBIPC[heartbeat:list/run/pause/stop]
    end
```

---

## Phase 1 - Dependencies

- [ ] Add `node-cron` to root `package.json`.
- [ ] Add `@types/node-cron` to root `devDependencies` (if needed by TS usage).
- [ ] Add `node-cron` to `core/package.json`.

---

## Phase 2 - Core Types

- [ ] Update `core/types.ts`:
  - Add to `CreateWorldParams`:
    - `heartbeatEnabled?: boolean`
    - `heartbeatInterval?: string | null`
    - `heartbeatPrompt?: string | null`
  - `UpdateWorldParams` inherits via `Partial<CreateWorldParams>`.
  - Add same fields to `World`.

---

## Phase 3 - Storage + Migration

- [ ] Create `migrations/0016_add_world_heartbeat.sql`:
  - `ALTER TABLE worlds ADD COLUMN heartbeat_enabled INTEGER DEFAULT 0;`
  - `ALTER TABLE worlds ADD COLUMN heartbeat_interval TEXT;`
  - `ALTER TABLE worlds ADD COLUMN heartbeat_prompt TEXT;`
- [ ] Update `core/storage/sqlite-storage.ts`:
  - Add heartbeat fields to world `INSERT ... ON CONFLICT` and bindings.
  - Add aliases in `loadWorld` + `listWorlds` selects.
  - Cast `heartbeatEnabled` to boolean on read.
- [ ] Update storage tests in `tests/core/storage/sqlite-storage.test.ts` for persistence/readback of new fields.

---

## Phase 4 - Core Heartbeat Scheduling Module

- [ ] Add `core/heartbeat.ts` with:
  - `isValidCronExpression(expr: string): boolean`
  - `startHeartbeat(world: World): StopHandle`
  - `stopHeartbeat(handle: StopHandle): void`
- [ ] Tick behavior:
  - Guard `heartbeatEnabled`, valid cron, non-empty prompt.
  - Enforce strict 5-field cron contract before scheduling.
  - Skip when `world.isProcessing` or no `currentChatId`.
  - Publish via `publishMessage(world, prompt, 'world', currentChatId)`.
- [ ] Export from `core/index.ts`.
- [ ] Add focused unit tests under `tests/core/` for:
  - valid/invalid cron checks
  - skip paths (no chat / processing)
  - sender and content on publish path

---

## Phase 5 - Electron Heartbeat Manager

- [ ] Add `electron/main-process/heartbeat-manager.ts`.
- [ ] Maintain per-world job registry with status (`running` | `paused` | `stopped`).
- [ ] Store resumable scheduler task handles (not only stop callbacks).
- [ ] Provide manager API:
  - `startJob(world)`
  - `restartJob(world)`
  - `pauseJob(worldId)`
  - `resumeJob(worldId)`
  - `stopJob(worldId)`
  - `stopAll()`
  - `listJobs()`
- [ ] Manager must deduplicate world jobs and guard invalid configs.
- [ ] Serialize per-world manager operations to avoid restart/delete/tick races.

---

## Phase 6 - Main-Process Runtime Integration

- [ ] In `electron/main-process/ipc-handlers.ts`:
  - Add heartbeat field mapping to `updateWorkspaceWorld` payload normalization.
  - After successful world update, call manager restart logic.
  - On world delete, stop heartbeat job after removing subscriptions.
  - Add startup helper to scan worlds and start heartbeat-enabled jobs.
- [ ] Startup helper requirements:
  - Iterate full `listWorlds()` data (not only `id/name` list for renderer).
  - `ensureWorldSubscribed(worldId)` before starting each heartbeat job.
- [ ] Startup helper must be idempotent for repeated IPC/runtime entrypoints.
- [ ] In workspace/runtime reset path, call `heartbeatManager.stopAll()` so workspace switches do not leak jobs.

---

## Phase 7 - IPC Contracts + Routes

- [ ] Extend `electron/shared/ipc-contracts.ts`:
  - Add channels:
    - `HEARTBEAT_LIST: 'heartbeat:list'`
    - `HEARTBEAT_RUN: 'heartbeat:run'`
    - `HEARTBEAT_PAUSE: 'heartbeat:pause'`
    - `HEARTBEAT_STOP: 'heartbeat:stop'`
  - Add payload/result typings.
- [ ] Wire channels in `electron/main-process/ipc-routes.ts` and `MainIpcHandlers` interface.
- [ ] Implement corresponding handlers in `ipc-handlers.ts`.

---

## Phase 8 - Preload Bridge

- [ ] Extend `electron/preload/bridge.ts` and `DesktopApi` contract:
  - `listHeartbeatJobs()`
  - `runHeartbeat(worldId)`
  - `pauseHeartbeat(worldId)`
  - `stopHeartbeat(worldId)`
- [ ] Keep payload shape consistent with existing route helpers and invoke wrappers.

---

## Phase 9 - Renderer Integration

- [ ] Update `electron/renderer/src/utils/app-helpers.ts`:
  - Add heartbeat fields to `getDefaultWorldForm()`.
  - Populate heartbeat fields in `getWorldFormFromWorld()`.
- [ ] Update `electron/main-process/message-serialization.ts` (`serializeWorldInfo`) to include heartbeat fields so renderer receives and preserves values.
- [ ] Update `electron/renderer/src/utils/validation.ts`:
  - If heartbeat enabled: require prompt and validate strict 5-field cron expression format.
- [ ] Update `electron/renderer/src/components/RightPanelContent.tsx`:
  - Add Heartbeat section to `panelMode === 'edit-world'`.
  - Conditionally render interval/prompt when enabled.
  - Respect `updatingWorld || deletingWorld` disabled states.
- [ ] Update `electron/renderer/src/App.tsx` unsaved-change detection to include heartbeat fields.
- [ ] Optional settings panel section:
  - List runtime heartbeat jobs and provide Run/Pause/Stop controls.

---

## Phase 10 - Tests and Verification

- [ ] Add/update targeted unit tests (1-3 per affected boundary), including:
  - `tests/core/storage/sqlite-storage.test.ts` (world heartbeat persistence)
  - `tests/electron/main/main-ipc-handlers.test.ts` (world update/delete/startup behavior)
  - `tests/electron/main/main-ipc-routes.test.ts` (new route wiring)
  - `tests/electron/preload/preload-bridge.test.ts` (new bridge methods)
  - `tests/electron/renderer/app-utils-extraction.test.ts` (form defaults + validation)
- [ ] Run `npm run test`.
- [ ] Run `npm run integration` (required for API/runtime path changes).

---

## Implementation Notes / Pitfalls

- `updateWorkspaceWorld` currently whitelists fields explicitly; heartbeat fields are not auto-forwarded.
- `serializeWorldInfo` is explicit and must include new fields or renderer cannot hydrate them.
- `loadWorldsFromWorkspace` currently returns only `{ id, name }`; startup heartbeat scan must use full world rows before serialization.
- `publishMessage` now enforces required chatId resolution; heartbeat tick must always pass/resolve a valid `currentChatId`.
- Keep world-level event isolation by using existing world subscription/runtime boundaries (`realtime-events.ts`).
