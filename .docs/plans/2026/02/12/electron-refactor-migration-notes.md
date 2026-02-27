# Electron Refactor Migration Notes

**Date**: 2026-02-12  
**Scope**: Main + Preload TypeScript migration, module extraction, and Electron test reorganization.

## What Changed

### Runtime Entrypoints
- Electron main package entry now points directly to compiled TS output:
  - `electron/package.json` -> `main: dist/main.js`
- Main and preload source entries are now TypeScript:
  - `electron/main.ts`
  - `electron/preload.ts`
- Transitional wrapper entries were removed:
  - `electron/entry/main-entry.ts`
  - `electron/entry/preload-entry.ts`

### Main-Process Modularization
- Extracted main-process orchestration modules:
  - `electron/main-process/ipc-registration.ts`
  - `electron/main-process/ipc-routes.ts`
  - `electron/main-process/window-paths.ts`
  - `electron/main-process/lifecycle.ts`

### Preload Modularization + Contracts
- Extracted preload modules:
  - `electron/preload/bridge.ts`
  - `electron/preload/invoke.ts`
  - `electron/preload/payloads.ts`
- Shared IPC contracts:
  - `electron/shared/ipc-contracts.ts`

### Renderer Orchestration Extraction
- Extracted renderer domain orchestration from `App.jsx`:
  - `electron/renderer/src/domain/desktop-api.js`
  - `electron/renderer/src/domain/message-updates.js`
  - `electron/renderer/src/domain/chat-event-handlers.js`
- Renderer bridge types:
  - `electron/renderer/src/types/desktop-api.ts`
  - `electron/renderer/src/types/global.d.ts`

### Electron Test Layout
- Reorganized by runtime layer:
  - `tests/electron/main/`
  - `tests/electron/preload/`
  - `tests/electron/renderer/`
- Layout guide:
  - `tests/electron/README.md`

## Verification Commands

### Confirmed Passing in Current Environment
- `npm run check`
- `npm run main:build --prefix electron`
- targeted `tsc --noEmit` checks for:
  - Electron runtime modules
  - Reorganized Electron tests

### Environment-Limited in Current Shell
- `npm test`
- targeted `npm test -- <electron test files>`

Reason: local shell runs Node `v14.17.3`, while current Vitest toolchain requires newer syntax/runtime support.

## Recommended Final Verification (Node >= 20)

1. `npm test -- tests/electron/main/main-ipc-routes.test.ts tests/electron/preload/preload-bridge.test.ts tests/electron/renderer/activity-state.test.ts`
2. `npm test`
3. `npm run electron:start` (or `npm run electron:dev`) and manually verify:
- world/session load and selection
- message send and streaming lifecycle
- tool stream rendering and activity status
- message edit/delete behavior

## Contributor Notes

- Keep preload/main channel strings sourced from `electron/shared/ipc-contracts.ts`.
- For new renderer orchestration logic, prefer `electron/renderer/src/domain/*` rather than expanding `App.jsx` directly.
- For new Electron tests, place by layer first (`main`, `preload`, `renderer`) and then by feature.
