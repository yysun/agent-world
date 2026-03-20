# Done: World Env Skill Registry Resolution

**Date:** 2026-03-19
**Req:** [req-world-env-skill-registry.md](../../reqs/2026/03/19/req-world-env-skill-registry.md)
**Plan:** [plan-world-env-skill-registry.md](../../plans/2026/03/19/plan-world-env-skill-registry.md)

## Summary

Completed the world-scoped skill-registry path resolution change and the follow-up Project-button fix.

Project-scope skill discovery now resolves from the active world's `variables` text instead of `AGENT_WORLD_WORKSPACE_PATH` / `AGENT_WORLD_DATA_PATH`, with `homedir()` fallback when `working_directory` is absent.

Electron skill-list refresh is now world-scoped:

- renderer requests `skill:list` with `worldId`
- main loads the authoritative world
- main passes that world's `variables` text into core skill-registry sync/filter logic

The Project button now opens the folder picker at the loaded world's existing `working_directory` without changing the existing `openWorkspace(directoryPath)` contract.

## Implemented Changes

### Core skill registry

- Added `worldVariablesText` support to `syncSkills()` and `getSkillsForSystemPrompt()` option handling.
- Removed `AGENT_WORLD_WORKSPACE_PATH` and `AGENT_WORLD_DATA_PATH` from default project-root resolution in `core/skill-registry.ts`.
- Added `working_directory` parsing from world `variables`.
- Changed missing-path fallback from `process.cwd()` to `homedir()`.
- Updated agent-skill prompt assembly in `core/utils.ts` to refresh skill roots against the active world's `variables`.

### Electron skill-list flow

- Replaced renderer-supplied `projectPath` scoping with `worldId` scoping in the shared IPC contract.
- Updated main-process `skill:list` handling to read `world.variables` and pass them into core skill-registry APIs.
- Updated renderer `useSkillRegistry()` to refresh by loaded-world identity rather than workspace/project path props.
- Ensured project-folder selection persists `working_directory` into `world.variables` and refreshes the skill registry after a successful update.
- Ensured world-switch-driven refresh follows the loaded world path.

### Project button contract fix

- Restored `openWorkspace(directoryPath)` to direct-path behavior.
- Added optional `defaultPath` support to `pickDirectory(defaultPath?)`.
- Updated the Project-button flow to use `pickDirectory(currentWorkingDirectory)` and accept picker results via `directoryPath`.
- Added Electron dialog compatibility helpers in main-process IPC handlers so build/test interop stays stable.

## Verification

Ran and passed:

- `npm test -- tests/core/skill-registry.test.ts tests/core/prepare-messages-for-llm.test.ts tests/electron/main/main-ipc-handlers.test.ts tests/electron/preload/preload-bridge.test.ts tests/electron/renderer/app-action-handlers-project-select.test.ts tests/electron/renderer/use-skill-registry.test.ts`
- `npm run integration`
- `npm run build`
- `npm test -- tests/electron/main/main-ipc-handlers.test.ts tests/electron/main/main-ipc-routes.test.ts tests/electron/preload/preload-bridge.test.ts tests/electron/renderer/app-action-handlers-project-select.test.ts`
- `npm run main:build --prefix electron`

## Outcome

- Skill-registry project scope now follows `world.variables` rather than removed process-wide workspace/data env vars.
- Project-folder changes and world switches refresh the skill registry against the correct world context.
- The Project button again opens the folder picker and starts at the current world cwd when available.
