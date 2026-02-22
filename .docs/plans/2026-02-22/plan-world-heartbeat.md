# Plan: World Heartbeat

**Date:** 2026-02-22
**Req:** `.docs/reqs/2026-02-22/req-world-heartbeat.md`

---

## Architecture Overview

```mermaid
graph TD
    subgraph Electron Main Process
        WL[Workspace opens] --> LW[listWorlds()]
        LW --> HE{heartbeatEnabled?}
        HE -- yes --> EWS[ensureWorldSubscribed(worldId)]
        EWS --> HM[HeartbeatManager.start(worldId)]
        HM --> CRON[node-cron ScheduledTask]
        CRON --> TICK[tick fires]
        TICK --> CHK{isProcessing?\nor no currentChatId?}
        CHK -- yes --> SKIP[skip silently]
        CHK -- no --> PUB[publishMessage(world, prompt, 'world', currentChatId)]
        UW[updateWorld() called] --> RESTART[HeartbeatManager.restart(worldId)]
        RESTART --> CRON
        WC[Workspace closes] --> STOPALL[HeartbeatManager.stopAll()]
    end

    subgraph Renderer
        SP[Settings Panel] --> IPC1[heartbeat:list]
        IPC1 --> JL[Job list: world, interval, status]
        JL --> CTRL[Run / Pause / Stop buttons]
        CTRL --> IPC2[heartbeat:run / pause / stop]
    end
```

### New file: `core/heartbeat.ts`
Provides `startHeartbeat`, `stopHeartbeat`, `isValidCronExpression`. Not auto-invoked by core — callers decide when to use them.

### New file: `electron/main-process/heartbeat-manager.ts`
Wraps core heartbeat functions. Owns the per-world job registry (Map of worldId → task/status). The only caller of `core/heartbeat.ts`. API/web app does not use these functions.

### Dependency: `node-cron`
Added to **root `package.json`** and **`core/package.json`**. Electron inherits it through the core module.

### Multi-world subscriptions
At workspace load, the main process calls `ensureWorldSubscribed` for every world with `heartbeatEnabled=true`. This keeps world instances alive so heartbeat ticks can publish messages even when the renderer is viewing a different world.

---

## Phases

### Phase 1 — Dependencies
- [ ] Add `node-cron` and `@types/node-cron` to root `package.json`
- [ ] Add `node-cron` to `core/package.json`

---

### Phase 2 — Core Types (`core/types.ts`)
- [ ] Add three fields to `World` interface:
  ```ts
  heartbeatEnabled?: boolean;
  heartbeatInterval?: string | null;
  heartbeatPrompt?: string | null;
  ```
- [ ] Add same three fields to `CreateWorldParams`

> `UpdateWorldParams extends Partial<CreateWorldParams>` inherits automatically.
> No `_heartbeatCleanup` on `World` — lifecycle is managed by the Electron main process, not core.

---

### Phase 3 — Storage Layer (`migrations/` + `core/storage/sqlite-storage.ts`)
- [ ] Add `migrations/0015_add_world_heartbeat.sql`:
  ```sql
  -- Migration: Add world heartbeat configuration fields
  -- Version: 15
  -- Date: 2026-02-22
  ALTER TABLE worlds ADD COLUMN heartbeat_enabled INTEGER DEFAULT 0;
  ALTER TABLE worlds ADD COLUMN heartbeat_interval TEXT;
  ALTER TABLE worlds ADD COLUMN heartbeat_prompt TEXT;
  ```
- [ ] Update `saveWorld()` in `sqlite-storage.ts`:
  - Add `heartbeat_enabled`, `heartbeat_interval`, `heartbeat_prompt` to INSERT columns and `ON CONFLICT DO UPDATE SET` list
  - Bind `worldData.heartbeatEnabled ? 1 : 0`, `worldData.heartbeatInterval ?? null`, `worldData.heartbeatPrompt ?? null`
- [ ] Update `loadWorld()` SELECT:
  ```sql
  heartbeat_enabled as heartbeatEnabled,
  heartbeat_interval as heartbeatInterval,
  heartbeat_prompt as heartbeatPrompt
  ```
  Cast `heartbeatEnabled` to boolean after load: `Boolean(result.heartbeatEnabled)`
- [ ] Update `listWorlds()` SELECT with the same three aliases + boolean cast

---

### Phase 3 — Core Heartbeat Functions (`core/heartbeat.ts`)
New file. Provides scheduling primitives. Not auto-invoked anywhere in core.

- [ ] Create `core/heartbeat.ts`:
  ```ts
  export function isValidCronExpression(expr: string): boolean
  // Uses nodeCron.validate(expr)

  export function startHeartbeat(world: World): () => void
  // 1. Guard: heartbeatEnabled, valid interval, non-empty prompt
  // 2. Schedule via nodeCron.schedule(world.heartbeatInterval, async () => { ... })
  // 3. Tick: if world.isProcessing || !world.currentChatId → return
  // 4. publishMessage(world, world.heartbeatPrompt, 'world', world.currentChatId)
  // 5. Returns stop function: () => task.stop()

  export function stopHeartbeat(stopFn: () => void): void
  // Calls stopFn (the value returned by startHeartbeat)
  ```

> Core exports these functions. No code in core calls them. API/web app does not import or call them.

---

### Phase 4 — Heartbeat Manager (`electron/main-process/heartbeat-manager.ts`)
New file. Wraps core heartbeat functions with a job registry for multi-world lifecycle management.

- [ ] Create `electron/main-process/heartbeat-manager.ts`:

  ```ts
  import { startHeartbeat, stopHeartbeat, isValidCronExpression } from '@agent-world/core/heartbeat';

  // Job registry — keyed by worldId
  const jobs = new Map<string, { stopFn: () => void; status: 'running' | 'paused' | 'stopped'; worldName: string; interval: string }>();

  export async function startJob(world: World): Promise<void>
  // 1. Guard: heartbeatEnabled, call isValidCronExpression
  // 2. Stop existing job for worldId if any (prevent duplicates)
  // 3. const stopFn = startHeartbeat(world)
  // 4. jobs.set(worldId, { stopFn, status: 'running', worldName: world.name, interval: world.heartbeatInterval })

  export function pauseJob(worldId: string): void
  // task.stop() via stored stopFn; set status 'paused'
  // (node-cron ScheduledTask.stop() pauses without destroying)

  export function resumeJob(worldId: string): void
  // task.start(); set status 'running'

  export function stopJob(worldId: string): void
  // stopHeartbeat(stopFn); jobs.delete(worldId)

  export async function restartJob(world: World): Promise<void>
  // stopJob(world.id) then startJob(world)

  export function stopAll(): void
  // Iterate jobs, call stopHeartbeat on each, clear map

  export function listJobs(): JobStatus[]
  // Returns [{worldId, worldName, interval, status}]
  ```

---

### Phase 5 — Multi-World Subscriptions + Heartbeat Startup (`electron/main-process/`)
At workspace load, the main process must subscribe to all heartbeat-enabled worlds and start their jobs.

- [ ] Add `startHeartbeatJobsForWorkspace(deps)` helper in `ipc-handlers.ts` or a new module:
  - Calls `listWorlds()` to get all worlds with full config
  - For each world where `heartbeatEnabled === true`:
    - Calls `ensureWorldSubscribed(worldId)` to keep a live world instance
    - Calls `heartbeatManager.startJob(worldId, deps)`
  - Hook: call this from `loadWorldsFromWorkspace()` after the world list is resolved
    (note: `loadWorldsFromWorkspace` currently only stores `{id, name}`; use the full world list from `listWorlds()` before serialization)
- [ ] In `updateWorldConfig` IPC handler — add mapping for heartbeat fields before `updateWorld` is called:
  ```ts
  if (payload?.heartbeatEnabled !== undefined) {
    updates.heartbeatEnabled = Boolean(payload.heartbeatEnabled);
  }
  if (payload?.heartbeatInterval !== undefined) {
    updates.heartbeatInterval = String(payload.heartbeatInterval || '').trim() || null;
  }
  if (payload?.heartbeatPrompt !== undefined) {
    updates.heartbeatPrompt = String(payload.heartbeatPrompt || '').trim() || null;
  }
  ```
  After `updateWorld` succeeds, call `heartbeatManager.restartJob(worldId, deps)` (handles enable→disable, disable→enable, and interval/prompt changes)
- [ ] In `deleteWorkspaceWorld` — after `removeWorldSubscriptions(worldId)`, call `heartbeatManager.stopJob(worldId)`
- [ ] In `resetRuntimeSubscriptions()` (`realtime-events.ts`) — call `heartbeatManager.stopAll()` to clear all jobs when workspace closes

---

### Phase 6 — IPC Channels (`electron/main-process/ipc-handlers.ts` + `electron/shared/ipc-contracts.ts`)

New IPC channels for heartbeat job management:

- [ ] Add to `ipc-contracts.ts`:
  ```ts
  HEARTBEAT_LIST:  'heartbeat:list'   // → JobStatus[]
  HEARTBEAT_RUN:   'heartbeat:run'    // { worldId } → { ok }
  HEARTBEAT_PAUSE: 'heartbeat:pause'  // { worldId } → { ok }
  HEARTBEAT_STOP:  'heartbeat:stop'   // { worldId } → { ok }
  ```
- [ ] Add handlers in `ipc-handlers.ts`:
  - `heartbeat:list` → `heartbeatManager.listJobs()`
  - `heartbeat:run` → `heartbeatManager.resumeJob(worldId)` (or `startJob` if not yet started)
  - `heartbeat:pause` → `heartbeatManager.pauseJob(worldId)`
  - `heartbeat:stop` → `heartbeatManager.stopJob(worldId)` (runtime only, no world config write)
- [ ] Expose the four channels in `electron/preload/` desktop API bridge

---

### Phase 7 — Renderer: Form State (`electron/renderer/src/utils/app-helpers.ts`)
- [ ] Add heartbeat fields to `getDefaultWorldForm()`:
  ```ts
  heartbeatEnabled: false,
  heartbeatInterval: '',
  heartbeatPrompt: '',
  ```
- [ ] Add heartbeat fields to `getWorldFormFromWorld()`:
  ```ts
  heartbeatEnabled: Boolean(world?.heartbeatEnabled),
  heartbeatInterval: String(world?.heartbeatInterval || ''),
  heartbeatPrompt: String(world?.heartbeatPrompt || ''),
  ```

---

### Phase 8 — Renderer: Validation (`electron/renderer/src/utils/validation.ts`)
- [ ] Extend `validateWorldForm()`:
  - If `heartbeatEnabled` is true and `heartbeatPrompt` is empty → `"Heartbeat prompt is required when heartbeat is enabled."`
  - If `heartbeatEnabled` is true and `heartbeatInterval` is not a valid 5-field cron → `"Heartbeat interval must be a valid cron expression (e.g. */5 * * * *)."`
  - Client-side cron validation: regex `^(\S+\s){4}\S+$` + field-range check (full validation in main via `node-cron.validate`)
  - Include `heartbeatEnabled`, `heartbeatInterval`, `heartbeatPrompt` in returned `data`

---

### Phase 9 — Renderer: World Edit Form (`electron/renderer/src/components/RightPanelContent.tsx`)
- [ ] Add Heartbeat section to `panelMode === 'edit-world'` form, below Main Agent:

  ```
  ┌──────────────────────────────────────────────┐
  │ Heartbeat                    [toggle off / on]│
  ├──────────────────────────────────────────────┤
  │ (shown only when enabled)                    │
  │ Interval                                     │
  │ [*/5 * * * *                               ] │
  │  Standard 5-field cron format                │
  │                                              │
  │ Prompt                                       │
  │ [Message to send on each heartbeat         ] │
  └──────────────────────────────────────────────┘
  ```

- [ ] Toggle wired to `setEditingWorld(v => ({...v, heartbeatEnabled: !v.heartbeatEnabled}))`
- [ ] Interval and prompt conditionally rendered only when `editingWorld.heartbeatEnabled === true`
- [ ] All fields disabled when `updatingWorld || deletingWorld`

---

### Phase 10 — Renderer: Settings Panel Heartbeat Jobs (`electron/renderer/src/components/RightPanelContent.tsx` + hooks)
- [ ] Add `heartbeatJobs` state to `App.tsx` (or a new `useHeartbeatJobs` hook):
  ```ts
  const [heartbeatJobs, setHeartbeatJobs] = useState<JobStatus[]>([]);
  ```
- [ ] Load on settings panel open: `api.listHeartbeatJobs()` → `setHeartbeatJobs`
- [ ] Add Heartbeat Jobs section to `panelMode === 'settings'` in `RightPanelContent.tsx`:

  ```
  ┌────────────────────────────────────────────────────────┐
  │ Heartbeat Jobs                                         │
  ├──────────────┬─────────────┬────────────┬─────────────┤
  │ World        │ Interval    │ Status     │ Actions     │
  ├──────────────┼─────────────┼────────────┼─────────────┤
  │ My World     │ */5 * * * * │ ● running  │ Pause  Stop │
  │ Other World  │ 0 * * * *   │ ○ paused   │ Run    Stop │
  └──────────────┴─────────────┴────────────┴─────────────┘
  (empty state: "No heartbeat jobs configured.")
  ```

- [ ] Run / Pause / Stop buttons call `api.heartbeatRun(worldId)` / `api.heartbeatPause(worldId)` / `api.heartbeatStop(worldId)` then refresh the jobs list
- [ ] Status indicator: green dot for `running`, grey for `paused`/`stopped`

---

## File Change Summary

| File | Change |
|---|---|
| `package.json` | Add `node-cron`, `@types/node-cron` |
| `core/package.json` | Add `node-cron` |
| `core/types.ts` | Add 3 heartbeat fields to `World`, `CreateWorldParams` |
| `core/heartbeat.ts` | **New** — `startHeartbeat`, `stopHeartbeat`, `isValidCronExpression` |
| `migrations/0015_add_world_heartbeat.sql` | **New** — 3 `ALTER TABLE worlds ADD COLUMN` |
| `core/storage/sqlite-storage.ts` | Update `saveWorld`, `loadWorld`, `listWorlds` |
| `electron/main-process/heartbeat-manager.ts` | **New** — job registry wrapping core heartbeat functions |
| `electron/main-process/ipc-handlers.ts` | Heartbeat startup at workspace load; updateWorld restart; 4 new IPC handlers |
| `electron/shared/ipc-contracts.ts` | 4 new channel names |
| `electron/preload/` | Expose 4 new heartbeat IPC methods in desktop API bridge |
| `electron/renderer/src/utils/app-helpers.ts` | Heartbeat fields in form helpers |
| `electron/renderer/src/utils/validation.ts` | Heartbeat validation in `validateWorldForm` |
| `electron/renderer/src/components/RightPanelContent.tsx` | Heartbeat section in edit-world form + Heartbeat Jobs in settings |
| `electron/renderer/src/App.tsx` | `heartbeatJobs` state + `useHeartbeatJobs` wiring |

---

## AR Notes

- `node-cron` lives in core. Electron inherits it. API/web app does not call the heartbeat functions.
- Multi-world subscription at workspace load is additive — existing on-demand subscription still works for chat events; background subscriptions simply keep additional worlds alive for heartbeat.
- **`updateWorld` IPC handler requires explicit heartbeat field mapping** (lines 422-461 pattern). Fields are not auto-forwarded — each field must be explicitly mapped to `updates`.
- **`loadWorldsFromWorkspace` only stores `{id, name}`** — heartbeat startup must iterate the full `listWorlds()` result (with `heartbeatEnabled`) before serialization.
- **`resetRuntimeSubscriptions`** in `realtime-events.ts` is the correct workspace-close hook for `heartbeatManager.stopAll()`.
- Heartbeat job `restartJob` must handle all transitions: enabled→disabled (stop only), disabled→enabled (start), and config change while enabled (stop+start).
- `publishMessage` is called from the main process through the already-loaded world instance (from the subscription). No new IPC round-trip needed for the tick itself.
- Stopping a job via the settings panel is runtime-only; does not write `heartbeatEnabled=false` to storage. Permanent disable requires editing the world config.
