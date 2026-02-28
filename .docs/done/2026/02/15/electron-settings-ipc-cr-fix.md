# Electron Settings IPC and Directory Picker Refactor

**Date**: 2026-02-15  
**Type**: Bug Fix

## Overview
Completed a `CR` pass for the in-progress Electron settings/file-picker IPC work, fixed high-priority test regressions, and finalized the workspace directory-picking API split.

Primary outcome:
- Restored deterministic IPC route test coverage after adding new channels (`settings:get`, `settings:save`, `dialog:pickFile`).
- Added a pure directory picker flow (`pickDirectory`) and refactored workspace opening to use it.

## Implementation
- Updated IPC route unit mocks to include newly required handler dependencies:
  - `getSystemSettings`
  - `saveSystemSettings`
  - `openFileDialog`
- Extended canonical route-order assertions to include:
  - `settings:get`
  - `settings:save`
  - `dialog:pickFile`
- Extended payload routing assertions to verify new settings/dialog handlers are invoked.
- Updated IPC registration-order assertion so the final expected channel matches the new route tail (`dialog:pickFile`).
- Added dedicated `dialog:pickDirectory` channel and route wiring.
- Refactored main-process workspace open handler to accept an optional `directoryPath` and reuse the same folder-pick flow.
- Updated preload bridge + desktop API typing so:
  - `pickDirectory()` is a pure folder picker.
  - `openWorkspace(directoryPath?)` opens workspace state from an explicit path.
- Updated renderer workspace open flow to:
  1. call `pickDirectory()`
  2. pass selected path into `openWorkspace(...)`.
- Added compatibility normalization in renderer desktop API domain so old/new bridge variants still interoperate.

## Files Changed
- `electron/shared/ipc-contracts.ts`
- `electron/main-process/ipc-routes.ts`
- `electron/main-process/ipc-handlers.ts`
- `electron/main.ts`
- `electron/preload/bridge.ts`
- `electron/renderer/src/App.jsx`
- `electron/renderer/src/domain/desktop-api.js`
- `tests/electron/main/main-ipc-routes.test.ts`
- `tests/electron/preload/preload-bridge.test.ts`
- `tests/electron/renderer/desktop-api-domain.test.ts`

## Testing
- Focused verification:
  - `npm test -- tests/electron/main/main-ipc-routes.test.ts`
  - Result: pass
- Full suite verification:
  - `npm test`
  - Result: 76 test files passed, 770 tests passed.

## Related Work
- Electron settings + file-picker IPC channels added in:
  - `electron/shared/ipc-contracts.ts`
  - `electron/main-process/ipc-routes.ts`
  - `electron/main-process/ipc-handlers.ts`
  - `electron/main.ts`
  - `electron/preload/bridge.ts`
  - `electron/main-process/preferences.ts`
  - `electron/main-process/environment.ts`
- Workspace directory picker split and open-workspace delegation:
  - `dialog:pickDirectory` (pure folder picker)
  - `workspace:open` (workspace state/open operation with optional `directoryPath`)
