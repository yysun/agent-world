# Electron Refactor Phase 1 Baseline and Safety Harness

**Date**: 2026-02-12  
**Related Plan**: [plan-electron-modular-typescript-refactor.md](./plan-electron-modular-typescript-refactor.md)

## Purpose

Capture behavior-critical baselines, current test coverage status, and migration checkpoint/rollback criteria before structural TypeScript and module-boundary refactors.

## Baseline Behavior-Critical Flows

### Flow A: Electron Launch + Workspace Bootstrap
- Entry loads environment variables from candidate `.env` paths.
- Workspace selection comes from `--workspace` arg, saved preference, or default `~/agent-world`.
- Workspace storage variables are configured before world APIs are used.
- Main window loads renderer URL in dev and built files in packaged/start flow.

### Flow B: Session Message Send Path
- Renderer calls preload bridge `sendMessage(payload)`.
- Preload routes to `ipcRenderer.invoke('chat:sendMessage', payload)`.
- Main handler publishes message and returns send result to renderer.

### Flow C: Realtime Stream/Event Path
- Renderer subscribes with `chat:subscribeEvents` and subscription ID.
- Main forwards chat events on `chat:event` channel.
- Renderer state modules process start/chunk/end/error without cross-session leakage.

### Flow D: Tool/Activity Status Path
- Renderer activity state tracks tool start/progress/result/error lifecycle.
- Busy indicator depends on active streams + active tools.
- Elapsed timer starts/stops with activity lifecycle.

## Existing Electron Test Coverage (Before Structural Refactor)

### Existing Coverage
- `tests/electron/streaming-state.test.ts`
  - Stream lifecycle, chunk batching, flush semantics, error/end cleanup.
- `tests/electron/activity-state.test.ts`
  - Tool lifecycle, busy aggregation, elapsed timer behavior.

### Gap Identified
- No preload bridge smoke/regression coverage for exposed API wiring and listener cleanup.

### Coverage Added in Phase 1
- `tests/electron/preload-bridge.test.ts`
  - Ensures `agentWorldDesktop` API exposure exists and is stable.
  - Verifies invoke wiring for send/subscribe/unsubscribe channels.
  - Verifies `onChatEvent` listener forwarding + cleanup.

## Migration Checkpoints

### Checkpoint 1 (Phase 2 Complete)
- TS build/runtime path for Electron entry layers is configured.
- Electron starts successfully in dev/start flows using mapped outputs.
- No regressions in preload bridge smoke tests.

### Checkpoint 2 (Phase 3 Complete)
- Main entry converted to TS with same IPC channel behavior.
- Message send and subscription flows verified.
- Existing renderer state tests still pass.

### Checkpoint 3 (Phase 4 Complete)
- Preload entry converted to TS and bridge contract is typed.
- Bridge API compatibility with renderer is preserved.
- Preload bridge regression tests pass with TS entry.

### Checkpoint 4 (Phase 5/6 Complete)
- Renderer orchestration split with no UI behavior regressions.
- Electron tests reorganized by layer/feature without lost assertions.

## Rollback Criteria

Rollback or pause migration when any of the following is true:
- Electron fails to launch in dev or start flow after entry-layer changes.
- IPC contract changes break renderer calls or event subscription flow.
- Streaming/activity regressions appear in test or manual smoke checks.
- Test reorganization removes behavior assertions without equivalent replacements.

## Rollback Strategy

- Keep entrypoint migration and module extraction in small commits.
- Revert only the last migration slice that introduced failure.
- Re-run focused Electron test subset before resuming.
