# Done: Built-in Tool Permission Levels

**Date**: 2026-03-12  
**Branch**: `feature/tool-permissions`  
**REQ**: `.docs/reqs/2026/03/11/req-tool-permissions.md`  
**Plan**: `.docs/plans/2026/03/12/plan-tool-permissions.md`  
**Tests**: 16/16 passing (`tests/core/tool-permissions.test.ts`)

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
| `read` | ❌ blocked | ✅ allowed | ❌ blocked | ❌ blocked | ❌ blocked |
| `ask` | 🔔 HITL every call | ✅ allowed | 🔔 HITL every call | ✅ HITL (existing) | ✅ HITL (existing per-skill) |
| `auto` | ✅ auto | ✅ auto | ✅ risk-tier logic | ✅ HITL (existing) | ✅ auto |

---

## Files Changed

| File | Change |
|---|---|
| `core/types.ts` | Header comment updated |
| `core/file-tools.ts` | `write_file`: blocks on `read`, HITL on `ask`, automatic on `auto` |
| `core/web-fetch-tool.ts` | `web_fetch`: remains allowed at `read`/`ask`/`auto` (existing private-network approval flow unchanged) |
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
| `tests/core/tool-permissions.test.ts` | Expanded — 16 unit tests, all passing |

---

## Tests

All 16 unit tests pass:

1. `write_file` → `read`: returns a blocked error
2. `write_file` → `ask`: requires HITL approval before writing
3. `write_file` → `auto`: proceeds to write
4. `web_fetch` → `read`: remains allowed
5. `web_fetch` → `ask`: remains allowed
6. `web_fetch` → `auto`: remains allowed
7. `shell_cmd` → `read`: returns a blocked error result
8. `shell_cmd` → `ask`: forces HITL regardless of risk tier
9. `shell_cmd` → `auto`: keeps low-risk automatic execution
10. `shell_cmd` → `auto` risky path: still requires approval
11. `create_agent` → `read`: returns `{ ok: false, status: 'blocked' }`
12. `create_agent` → `ask`: keeps approval flow
13. `create_agent` → `auto`: keeps approval flow
14. `load_skill` → `read`: returns instructions; scripts blocked with inline note
15. `load_skill` → `ask`: requires per-skill approval before scripts run
16. `load_skill` → `auto`: runs referenced scripts without extra approval

---

## Acceptance Criteria Status

| # | Criterion | Status |
|---|---|---|
| 1 | `read`: `shell_cmd`/`write_file`/`create_agent` blocked; `web_fetch` allowed; blocked calls return clear errors | ✅ |
| 2 | `ask`: `write_file`/`shell_cmd` always prompt HITL; `web_fetch` auto; HITL flow end-to-end | ✅ |
| 3 | `auto`: all tools run with no new restrictions | ✅ |
| 4 | Web composer shows dropdown; updates world on change | ✅ |
| 4b | Electron composer shows dropdown; updates world on change | ✅ |
| 5 | Existing worlds without key default to `auto` with no behavior change | ✅ |
| 6 | Unit tests cover dispatch enforcement across all tools and levels | ✅ |
