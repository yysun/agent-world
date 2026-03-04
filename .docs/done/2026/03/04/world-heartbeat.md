# Done: World Heartbeat

**Date:** 2026-03-04  
**Req:** `.docs/reqs/2026-03-04/req-world-heartbeat.md`  
**Plan:** `.docs/plans/2026-03-04/plan-world-heartbeat.md`

## Summary

Implemented world heartbeat as a persisted world-level feature with Electron runtime job management, strict cron validation, and renderer form support.

## Completed Scope

- Added heartbeat world fields to core model:
  - `heartbeatEnabled`
  - `heartbeatInterval`
  - `heartbeatPrompt`
- Added migration `migrations/0016_add_world_heartbeat.sql`.
- Persisted heartbeat fields in SQLite world save/load/list paths.
- Added core heartbeat scheduler module `core/heartbeat.ts`:
  - strict 5-field cron validation
  - guarded start/stop helpers
  - tick publish as sender `world`
- Exported heartbeat helpers via `core/index.ts`.
- Added Electron main heartbeat manager `electron/main-process/heartbeat-manager.ts`.
- Integrated heartbeat manager into main runtime:
  - startup/list world reconciliation
  - world update restart behavior
  - world delete stop behavior
  - runtime reset stop-all behavior
- Added heartbeat IPC routes/contracts/handlers:
  - `heartbeat:list`
  - `heartbeat:run`
  - `heartbeat:pause`
  - `heartbeat:stop`
- Extended preload bridge with heartbeat methods.
- Extended renderer world edit form and validation for heartbeat fields.
- Extended world serialization for renderer round-trip.

## Tests Added/Updated

- Added `tests/core/heartbeat.test.ts`.
- Updated storage tests for heartbeat persistence:
  - `tests/core/storage/sqlite-storage.test.ts`
- Updated IPC handler/route coverage:
  - `tests/electron/main/main-ipc-handlers.test.ts`
  - `tests/electron/main/main-ipc-routes.test.ts`
- Updated preload bridge coverage:
  - `tests/electron/preload/preload-bridge.test.ts`
- Updated renderer utility validation coverage:
  - `tests/electron/renderer/app-utils-extraction.test.ts`
- Updated queue-path-aligned tests:
  - `tests/cli/process-cli-input.test.ts`
  - `tests/api/messages-nonstreaming-collection.test.ts`
  - `tests/core/storage/storage-factory.test.ts`
- Stabilized Electron renderer/main test harness for node vitest environment:
  - virtual `react`/JSX runtime/electron mocks
  - hoisted mock factories for vitest mock hoisting safety

## Verification

Executed and passed:

1. `npm run test`
  - Result: `157 passed` test files, `1266 passed` tests.
2. `npm run integration`
  - Result: `3 passed` integration files, `24 passed` tests.

## CR Notes

Code review of current uncommitted changes found no high-priority correctness/security regressions after final test validation.

## Follow-up

- Optional backlog item from plan remains:
  - Settings-panel runtime controls for heartbeat job list/run/pause/stop UI.
