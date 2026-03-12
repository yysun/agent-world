# Plan: Built-in Tool Permission Levels

**Date**: 2026-03-12  
**REQ**: `.docs/reqs/2026/03/11/req-tool-permissions.md`  
**Branch**: `feature/tool-permissions`

---

## Architecture Note (Implemented)

> **Architecture pivot after AR:** `toolPermission` is stored as env key `tool_permission=<value>` inside `world.variables` (same pattern as `working_directory`) — no dedicated DB column, no schema migration, and no new API schema field. All tools read `getEnvValueFromText(world.variables, 'tool_permission') ?? 'auto'`; the frontend writes via `upsertEnvVariable` → `PATCH { variables: ... }`.

---

## Architecture Overview

```mermaid
flowchart TD
  subgraph Storage
    A[Migration 0017: worlds.tool_permission column]
    B[sqlite-storage.ts: saveWorld / loadWorld / listWorlds]
  end
  subgraph Core Types
    C[core/types.ts: World.toolPermission field]
    D[core/types.ts: CreateWorldParams / UpdateWorldParams]
  end
  subgraph Tool Dispatch
    E[core/file-tools.ts: write_file execute()]
    F[core/web-fetch-tool.ts: web_fetch execute()]
    G[core/shell-cmd-tool.ts: shell_cmd executeShellTool()]
    H[core/load-skill-tool.ts: load_skill script execution]
    I[core/create-agent-tool.ts: create_agent execute()]
  end
  subgraph Server
    J[server/api.ts: WorldUpdateSchema + serializeWorld + PATCH handler]
  end
  subgraph Web
    K[web/src/types/index.ts: World.toolPermission]
    L[web/src/api.ts: WorldPatchPayload + buildWorldPatchPayload]
    M[web/src/components/world-chat.tsx: dropdown + event]
    N[web/src/pages/World.update.ts: handler + state merge]
  end
  subgraph Tests
    O[tests/tool-permissions.test.ts: unit tests for all levels]
  end

  A --> B --> C
  C --> E & F & G & H & I
  C --> J
  J --> K --> L --> M --> N
  E & F & G & H & I --> O
```

---

## Phased Implementation Tasks

### Phase 1 — Core Type & Storage

> **Note:** Phase 1 was superseded by the architecture pivot. No DB column, no migration, no memory-storage changes needed. Only the `core/types.ts` file header was updated to document the approach.

- [x] **1.1** ~~Add `toolPermission` to `World` interface~~ → stored in `world.variables` as env key
- [x] **1.2** ~~Add to `CreateWorldParams`/`UpdateWorldParams`~~ → not needed
- [x] **1.3** ~~Create migration `0017`~~ → not needed (no DB column)
- [x] **1.4** ~~Update `sqlite-storage.ts`~~ → not needed
- [x] **1.5** ~~Update `memory-storage.ts`~~ → not needed

### Phase 2 — Tool Dispatch Enforcement

All changes read `getEnvValueFromText((context?.world as any)?.variables, 'tool_permission') ?? 'auto'`.

- [x] **2.1** `core/file-tools.ts` — `write_file`: blocks on `'read'` with error string
- [x] **2.2** `core/web-fetch-tool.ts` — `web_fetch`: blocks on `'read'` with JSON error
- [x] **2.3** `core/shell-cmd-tool.ts`: blocks on `'read'`; forces HITL on `'ask'` for every invocation
- [x] **2.4** `core/load-skill-tool.ts`: blocks script execution on `'read'` with inline note; `'ask'` covered by existing per-skill HITL approval before scripts run
- [x] **2.5** `core/create-agent-tool.ts`: blocks on `'read'`

### Phase 3 — REST API

> **Note:** No dedicated schema fields added. `variables` already exposed; tool_permission travels within it.

- [x] **3.1** ~~`WorldUpdateSchema`: add `toolPermission`~~ → not needed
- [x] **3.2** ~~`serializeWorld`: include `toolPermission`~~ → not needed
- [x] **3.3** ~~PATCH handler forward~~ → not needed; trailing comma fix only

### Phase 4 — Web Frontend

- [x] **4.1** ~~`web/src/types/index.ts` — `World.toolPermission`~~ → not needed (no field on `World`)
- [x] **4.2** ~~`web/src/api.ts` — `WorldPatchPayload.toolPermission`~~ → uses `variables` instead
- [x] **4.3** ~~`web/src/api.ts` — `buildWorldPatchPayload`~~ → not needed
- [x] **4.4** `web/src/components/world-chat.tsx`: accepts `toolPermission` prop; renders `<select class="composer-tool-permission-select">` after `.composer-project-button`; emits `set-tool-permission`
- [x] **4.5** `web/src/types/index.ts` — `WorldChatProps`: added `toolPermission?: 'read' | 'ask' | 'auto'`
- [x] **4.6** `web/src/pages/World.update.ts` — `set-tool-permission`: calls `upsertEnvVariable` → `api.updateWorld({ variables })`
- [x] **4.7** `web/src/pages/World.tsx`: derives `toolPermission` from `getEnvValueFromText(state.world?.variables, 'tool_permission')`

### Phase 5 — Unit Tests

- [x] **5.1** Created `tests/core/tool-permissions.test.ts` — 7 cases, all passing:
  - `write_file` at `read`: blocked
  - `write_file` at `auto`: proceeds (regression)
  - `web_fetch` at `read`: blocked JSON error
  - `shell_cmd` at `read`: blocked error result
  - `shell_cmd` at `ask`: forces HITL; denied → throws `not approved`
  - `create_agent` at `read`: blocked
  - `load_skill` at `read`: instructions returned, scripts blocked

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| `tool_permission` stored in `world.variables` (not a DB column) | Avoids migration; follows `working_directory` pattern; frontend already has `upsertEnvVariable`/`getEnvValueFromText` helpers |
| `toolPermission` defaults to `'auto'` (key absent → `?? 'auto'`) | REQ-6: must not break existing worlds |
| Read through `getEnvValueFromText(world.variables, 'tool_permission')` in each tool | Context `world` is already threaded; zero new architecture needed |
| `shell_cmd` at `ask` always routes to HITL regardless of risk tier | REQ-2 explicit: "bypassing its existing risk-tier `allow` path" |
| `create_agent` under `ask/auto` is unchanged (already HITL-gated) | REQ-2: "it already does; this stays active in Ask and Auto" |
| `load_skill` at `read`: instructions load, scripts blocked with inline note | REQ-2: "load_skill MUST load skill instructions into context but MUST block any script execution step" |
| `load_skill` at `ask`: covered by existing per-skill HITL before `executeSkillScripts` | The existing `requestToolApproval` gates the entire skill (incl. scripts) before execution proceeds |
| Dropdown emits `set-tool-permission` AppRun event | Consistent with existing project/folder pattern for UI actions |
| `variables` already present in `serializeWorld`/SSE world payloads | REQ-5: `tool_permission` key is automatically carried in all SSE world payloads |
| Electron mirrors web pattern exactly: `toolPermission` derived from `getEnvValueFromText`, written via `upsertEnvVariable` → `api.updateWorld` | Consistent pattern across both frontends; no IPC additions needed |

---

## Files Changed Summary

| File | Change Type |
|---|---|
| `core/types.ts` | Updated (header comment only) |
| `core/file-tools.ts` | Updated |
| `core/web-fetch-tool.ts` | Updated |
| `core/shell-cmd-tool.ts` | Updated |
| `core/load-skill-tool.ts` | Updated |
| `core/create-agent-tool.ts` | Updated |
| `server/api.ts` | Trailing comma fix |
| `web/src/types/index.ts` | Updated (`WorldChatProps` only) |
| `web/src/components/world-chat.tsx` | Updated |
| `web/src/pages/World.tsx` | Updated |
| `web/src/pages/World.update.ts` | Updated |
| `electron/renderer/src/components/ComposerBar.tsx` | Updated |
| `electron/renderer/src/hooks/useAppActionHandlers.ts` | Updated |
| `electron/renderer/src/App.tsx` | Updated |
| `electron/renderer/src/utils/app-layout-props.ts` | Updated |
| `tests/core/tool-permissions.test.ts` | New |

---

## Risk & Assumptions

- **Risk**: `shell_cmd` at `ask` level — existing tests that rely on `allow`-tier paths may fail. Mitigation: tests check for `auto` level (default), so existing tests are unaffected.
- **Assumption**: `context.world` is always non-null inside `execute()` when running inside the agent loop. The world reference is injected by `managers.ts` before tool dispatch.
- **Assumption**: Memory-storage (`memory-storage.ts`) is used in tests; it must also default `toolPermission` to `'auto'`.
- **Non-goal**: ~~Electron UI~~ — Electron dropdown implemented on 2026-03-12 using the same `world.variables` env key pattern.
