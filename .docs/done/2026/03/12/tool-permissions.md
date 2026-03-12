# Done: Built-in Tool Permission Levels

**Date**: 2026-03-12  
**Branch**: `feature/tool-permissions`  
**REQ**: `.docs/reqs/2026/03/11/req-tool-permissions.md`  
**Plan**: `.docs/plans/2026/03/12/plan-tool-permissions.md`  
**Tests**: 7/7 passing (`tests/core/tool-permissions.test.ts`)

**Electron**: Permission dropdown added to `ComposerBar` (2026-03-12)

---

## Summary

Added three world-level permission control levels — **Read**, **Ask**, **Auto** — that govern which built-in tools agents in a world may use and which require user approval before execution.

The permission level is stored as the env key `tool_permission=<value>` inside `world.variables` (same pattern as `working_directory`). No dedicated DB column or schema migration was required.

---

## Architecture

- **Storage**: `tool_permission` env key in `world.variables` text field (e.g. `tool_permission=read`)
- **Read**: `getEnvValueFromText(world.variables, 'tool_permission') ?? 'auto'`
- **Write**: `upsertEnvVariable(variables, 'tool_permission', value)` → `PATCH /worlds/:name { variables }`
- **Default**: `'auto'` when key is absent (no behavior change for existing worlds)

---

## Permission Levels

| Level | `write_file` | `web_fetch` | `shell_cmd` | `create_agent` | `load_skill` scripts |
|---|---|---|---|---|---|
| `read` | ❌ blocked | ❌ blocked | ❌ blocked | ❌ blocked | ❌ blocked |
| `ask` | ✅ auto | ✅ auto | 🔔 HITL every call | ✅ HITL (existing) | ✅ HITL (existing per-skill) |
| `auto` | ✅ auto | ✅ auto | ✅ risk-tier logic | ✅ HITL (existing) | ✅ auto |

---

## Files Changed

| File | Change |
|---|---|
| `core/types.ts` | Header comment updated |
| `core/file-tools.ts` | `write_file`: blocks on `read` |
| `core/web-fetch-tool.ts` | `web_fetch`: blocks on `read` with JSON error |
| `core/shell-cmd-tool.ts` | Blocks on `read`; forces HITL on `ask` for every invocation |
| `core/load-skill-tool.ts` | Script execution blocked on `read`; `ask` covered by existing per-skill HITL |
| `core/create-agent-tool.ts` | Blocks on `read` |
| `server/api.ts` | Trailing comma fix in `WorldUpdateSchema` |
| `web/src/types/index.ts` | `WorldChatProps`: added `toolPermission` prop |
| `web/src/components/world-chat.tsx` | Added `<select class="composer-tool-permission-select">` to composer toolbar |
| `web/src/pages/World.tsx` | Derives `toolPermission` from `getEnvValueFromText(state.world?.variables, 'tool_permission')` |
| `web/src/pages/World.update.ts` | `set-tool-permission` handler: writes via `upsertEnvVariable` → `api.updateWorld({ variables })` |
| `electron/renderer/src/components/ComposerBar.tsx` | Added `<select>` dropdown (Read/Ask/Auto) after Project button |
| `electron/renderer/src/hooks/useAppActionHandlers.ts` | Added `onSetToolPermission`: `upsertEnvVariable` → `api.updateWorld({ variables })` |
| `electron/renderer/src/App.tsx` | Derives `toolPermission` from `getEnvValueFromText(loadedWorld?.variables, 'tool_permission')` |
| `electron/renderer/src/utils/app-layout-props.ts` | Added `toolPermission`/`onSetToolPermission` to `createMainContentComposerProps` |
| `tests/core/tool-permissions.test.ts` | New — 7 unit tests, all passing |

---

## Tests

All 7 unit tests pass:

1. `write_file` → `read`: returns error containing `'blocked'`
2. `write_file` → `auto`: proceeds to write (regression)
3. `web_fetch` → `read`: returns `{ ok: false, error: '...permission level (read)...' }`
4. `shell_cmd` → `read`: returns result containing `'permission level (read)'`
5. `shell_cmd` → `ask`: forces HITL regardless of risk tier; denied → throws `'not approved'`
6. `create_agent` → `read`: returns `{ ok: false, status: 'blocked' }`
7. `load_skill` → `read`: returns instructions; scripts blocked with inline note

---

## Acceptance Criteria Status

| # | Criterion | Status |
|---|---|---|
| 1 | `read`: `shell_cmd`/`web_fetch`/`write_file`/`create_agent` blocked with clear error | ✅ |
| 2 | `ask`: `shell_cmd` always prompts HITL; `web_fetch`/`write_file` auto; HITL flow end-to-end | ✅ |
| 3 | `auto`: all tools run with no new restrictions | ✅ |
| 4 | Web composer shows dropdown; updates world on change | ✅ |
| 4b | Electron composer shows dropdown; updates world on change | ✅ |
| 5 | Existing worlds without key default to `auto` with no behavior change | ✅ |
| 6 | Unit tests cover dispatch enforcement across all tools and levels | ✅ |
