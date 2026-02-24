# Electron Skill Settings Consistency and UX Alignment

**Date**: 2026-02-16  
**Type**: Bug Fix + UX Consistency

## Overview
Completed a multi-step reliability and UX alignment pass for Electron System Settings related to skill visibility and skill usage enforcement.

Primary outcomes:
- Added reliable global/project skill scope enforcement for both system-prompt injection and `load_skill` execution.
- Fixed persistence/runtime propagation so saved settings are respected after restart.
- Ensured message-send runtime always uses current settings snapshot to avoid stale env behavior.
- Aligned System Settings footer behavior with World/Agent panels (`Cancel`/`Save` semantics and disabled states).

## Implementation
- Added scope-aware skill registry APIs and metadata:
  - `getSkillsForSystemPrompt(...)`
  - `getSkillSourceScope(...)`
  - source scope typing (`global` / `project`)
- Updated prompt-building flow to:
  - honor `AGENT_WORLD_ENABLE_GLOBAL_SKILLS` and `AGENT_WORLD_ENABLE_PROJECT_SKILLS`
  - honor per-skill disabled lists (`AGENT_WORLD_DISABLED_GLOBAL_SKILLS`, `AGENT_WORLD_DISABLED_PROJECT_SKILLS`)
- Updated `load_skill` tool to reject disabled skills using the same settings model.
- Added shared env parser utility (`core/skill-settings.ts`) to remove duplicated parsing logic.
- Extended Electron settings persistence model with:
  - scope toggles
  - per-skill disabled ID lists
- Updated main-process env application (`applySystemSettings`) to include all skill-related flags/lists.
- Hardened startup behavior by reapplying persisted settings after `app.whenReady()`.
- Updated `chat:sendMessage` IPC path to apply the renderer’s current settings snapshot before publish.
- Extended `skill:list` IPC and renderer skill summaries with scope metadata and filtering support.
- Added grouped Global/Project skill toggle controls in System Settings and optimized per-row disabled checks.
- Aligned System Settings action UX with other panels:
  - `Cancel` now discards unsaved settings and closes panel
  - `Save` disables buttons while saving, shows `Saving...`, and closes panel on non-restart save success

## Files Changed
- `core/index.ts`
- `core/skill-registry.ts`
- `core/utils.ts`
- `core/load-skill-tool.ts`
- `core/skill-settings.ts`
- `electron/main.ts`
- `electron/main-process/environment.ts`
- `electron/main-process/preferences.ts`
- `electron/main-process/ipc-handlers.ts`
- `electron/main-process/ipc-routes.ts`
- `electron/shared/ipc-contracts.ts`
- `electron/preload/bridge.ts`
- `electron/renderer/src/App.jsx`
- `electron/renderer/src/components/AgentFormFields.jsx`
- `tests/core/prepare-messages-for-llm.test.ts`
- `tests/core/load-skill-tool.test.ts`
- `tests/core/skill-registry.test.ts`
- `tests/electron/main/main-ipc-handlers.test.ts`

## Testing
Focused suites executed with Node 22:
- `npm test -- tests/core/load-skill-tool.test.ts tests/core/prepare-messages-for-llm.test.ts tests/core/skill-registry.test.ts`
- `npm test -- tests/electron/main/main-ipc-handlers.test.ts tests/core/prepare-messages-for-llm.test.ts`
- `npm test -- tests/electron/main/main-ipc-handlers.test.ts`
- `npm test -- tests/electron/main/main-ipc-handlers.test.ts tests/core/prepare-messages-for-llm.test.ts tests/core/load-skill-tool.test.ts`

Result:
- All focused suites passed.
- Only pre-existing Vitest/sqlite mock warnings were observed (no failing assertions).

## Related REQ / AP Docs
- REQ: No dedicated REQ document was created for this iterative fix thread.
- AP: No dedicated AP document was created for this iterative fix thread.

## Notes
- Final cleanup removed an unused `getSkills` dependency from main IPC DI wiring to improve clarity with no behavior change.
