# DD: Remove Duplicated Runtime Tools

**Date:** 2026-04-24  
**Status:** Complete  
**Related REQ:** `.docs/reqs/2026/04/24/req-remove-duplicated-runtime-tools.md`  
**Related AP:** `.docs/plans/2026/04/24/plan-remove-duplicated-runtime-tools.md`

## Summary

Removed Agent World's duplicate public ownership of runtime-reserved built-in tools and converged active executable tool paths on the canonical `llm-runtime` resolver.

Completed changes include:
- non-LLM execution paths now resolve executable built-ins through `getRuntimeToolsForWorld(...)` instead of the mixed MCP registry surface,
- `core/mcp-server-registry.ts` now returns only MCP-discovered tools and no longer republishes runtime-reserved built-ins,
- rich built-ins (`shell_cmd`, `web_fetch`, `load_skill`, `write_file`) preserve Agent World host semantics through internal execution seams instead of public duplicate factory exports,
- module-specific unit coverage was retargeted away from deleted public factory wrappers,
- Electron now imports core through the public package boundary (`agent-world/core`) instead of a runtime path loader,
- the dedicated Electron core-module loader and runtime-copy preparation script were removed.

## Implemented Scope

### 1) Canonical runtime-backed executable resolution

Updated shared runtime execution so active tool execution no longer depends on `getMCPToolsForWorld(...)` for built-ins.

Delivered changes:
- `core/events/tool-action-runtime.ts` now resolves executable tools through `getRuntimeToolsForWorld(world)`.
- `core/events/memory-manager.ts` no longer prefetches mixed built-ins during pending-tool resume.
- restore/resume coverage now fails if the legacy mixed registry path is consulted.

### 2) MCP registry reduced to MCP-only responsibility

Removed public built-in construction from `core/mcp-server-registry.ts`.

Delivered changes:
- the registry now exposes only MCP-discovered tools,
- built-in ownership for reserved names is no longer split across `llm-runtime` and the MCP registry,
- registry tests now assert that built-ins are absent when no MCP servers are configured.

### 3) Rich built-ins preserved through host seams instead of duplicate factories

Kept Agent World product behavior for rich built-ins without keeping a second public built-in implementation under the same runtime-owned name.

Delivered changes:
- `core/shell-cmd-tool.ts` exposes `executeShellCmdWithHostSemantics(...)`,
- `core/web-fetch-tool.ts` exposes `executeWebFetchWithHostSemantics(...)`,
- `core/load-skill-tool.ts` exposes `executeLoadSkillWithHostSemantics(...)`,
- `core/file-tools.ts` exposes `executeWriteFileWithHostSemantics(...)` and the `ToolContext` type,
- `core/llm-runtime.ts` now overrides rich tool execution through these host seams while keeping `llm-runtime` as the public owner of reserved built-in names.

### 4) Duplicate-only public factory surface removed

Deleted the obsolete public duplicate factory exports and moved tests to local subjects over the host-semantics entrypoints.

Delivered changes:
- removed duplicate-only public wrappers from the rich tool modules,
- updated unit suites for `shell_cmd`, `web_fetch`, `load_skill`, and `write_file` to target the host seam directly,
- replaced duplicate-surface integration expectations with runtime-boundary assertions.

### 5) Electron moved off the loader and onto the public package boundary

Replaced Electron's runtime file-probing loader with direct dynamic imports from the packaged root module after env initialization.

Delivered changes:
- `electron/main.ts` now loads core APIs from `agent-world/core` after `.env` loading,
- `electron/main-process/message-serialization.ts` now loads HITL helpers from `agent-world/core`,
- `core/index.ts` now publicly exports the Electron-needed APIs that were previously reached through internal submodule loading,
- `electron/package.json` now depends on `agent-world` via `file:..`,
- root `package.json` now includes the packaged files needed for Electron package-mode consumption,
- removed `electron/main-process/core-module-loader.ts`,
- removed `scripts/prepare-electron-runtime.js`.

## Requirement Coverage

1. **REQ-1 single public owner for reserved built-ins:** implemented. Reserved names now resolve publicly through `llm-runtime`, not duplicate core factories.
2. **REQ-2 canonical execution path:** implemented for shared tool execution and pending-tool resume.
3. **REQ-3 duplicate registry registrations removed:** implemented. MCP registry no longer republishes public built-ins.
4. **REQ-4 preserve host semantics:** implemented for `shell_cmd`, `web_fetch`, `load_skill`, and `write_file` through internal execution seams.
5. **REQ-5 delete duplicate implementations/tests:** implemented for duplicate-only public factory surface and its direct tests.
6. **REQ-6 host-only tools remain separate:** preserved. `create_agent` and `send_message` remain explicit host extras.
7. **REQ-7 stop contract drift across duplicate surfaces:** implemented by routing executable built-ins through the runtime-owned surface plus host execution overrides.
8. **REQ-8 docs/tests updated:** implemented for runtime-boundary tests and this completion note; active docs now reflect the single-ownership model.

## Files in Scope

- `.docs/reqs/2026/04/24/req-remove-duplicated-runtime-tools.md`
- `.docs/plans/2026/04/24/plan-remove-duplicated-runtime-tools.md`
- `.docs/done/2026/04/24/remove-duplicated-runtime-tools.md`
- `core/llm-runtime.ts`
- `core/mcp-server-registry.ts`
- `core/events/tool-action-runtime.ts`
- `core/events/memory-manager.ts`
- `core/shell-cmd-tool.ts`
- `core/web-fetch-tool.ts`
- `core/load-skill-tool.ts`
- `core/file-tools.ts`
- `core/index.ts`
- `electron/main.ts`
- `electron/main-process/message-serialization.ts`
- `electron/package.json`
- `electron/package-lock.json`
- `package.json`
- `scripts/prepare-electron-runtime.js` (deleted)
- `electron/main-process/core-module-loader.ts` (deleted)
- targeted tests under `tests/core`, `tests/electron`, `tests/electron-e2e`, `tests/web-domain`, and `tests/web-e2e`

## Verification

### Commands / Runs

1. Focused runtime-boundary and module test slices during migration
2. `npm run build`
3. `npm test`
4. `npm run integration`
5. Focused `tests/core/package-contract.test.ts`
6. Follow-up `npm run build` after removing the Electron loader
7. `npm run dist:dir --prefix electron` was started to verify package mode after loader removal

### Results

- Runtime-boundary migration validation passed earlier in the story:
  - `npm run build`
  - `npm test`
  - `npm run integration`
- Focused package-boundary contract test passed after the Electron refactor.
- Follow-up full build passed after switching Electron to `agent-world/core` imports.
- Packaged Electron `dist:dir` verification did **not** complete in this session because the run was canceled before it finished.

## Notes

- Electron no longer needs a runtime path loader to find core files, but the package-mode proof is only partially validated in this session because the final `electron-builder --dir` run was canceled before completion.
- This done note records the delivered refactor accurately; if release confidence requires explicit packaged-app proof, rerun `npm run dist:dir --prefix electron` and record the result separately.