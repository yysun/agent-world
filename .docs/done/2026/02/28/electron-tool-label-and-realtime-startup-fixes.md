# Done: Electron Tool Label Resolution + Realtime Startup Export Interop

**Date**: 2026-02-28
**Type**: Bug Fix / Stability + UX Correctness

## Summary

Two Electron issues were fixed:

1. Tool cards could show a mismatched tool label (for example `list_files` or `grep`) while the args/result clearly belonged to `shell_cmd`.
2. Electron startup could fail with:
   - `SyntaxError: ... does not provide an export named 'createRealtimeEventsRuntime'`

The first issue was a renderer tool-name resolution bug. The second was a main-process module export-shape interop fragility.

## Root Causes

### 1) Tool label mismatch in transcript cards

The message list logic resolved tool names by scanning prior assistant messages too aggressively for tool-call metadata. For assistant tool-request rows without a direct `tool_call_id`, this could incorrectly inherit the previous tool name.

### 2) Realtime runtime import startup failure

Electron main used a strict named import path for realtime runtime creation. If the compiled module shape drifted (named/default interop differences), startup could hard-fail before UI load.

## Changes

### `electron/renderer/src/utils/message-utils.ts`

- Added shared helper: `resolveToolNameForMessage(...)`.
- Updated precedence order:
  1. direct tool metadata on the row,
  2. current message `tool_calls` (critical fix),
  3. linked parent assistant row,
  4. prior assistant rows only when a concrete `toolCallId` exists,
  5. `Calling tool: ...` text fallback.

This prevents assistant `shell_cmd` requests from inheriting older `list_files`/`grep` names.

### `electron/renderer/src/components/MessageListPanel.tsx`

- Replaced local tool-name resolver with shared `resolveToolNameForMessage(...)` from `message-utils`.

### `tests/electron/renderer/app-utils-extraction.test.ts`

- Added targeted regression test:
  - `prefers current assistant tool_calls name over previous assistant rows`
- Verifies both assistant request row and corresponding tool result resolve to `shell_cmd` in mixed-tool history.

### `electron/main-process/module-interop.ts`

- Added runtime-safe export resolver:
  - supports `module.createRealtimeEventsRuntime`
  - supports `module.default.createRealtimeEventsRuntime`
  - supports `module.default` as function

### `electron/main.ts`

- Switched realtime runtime loading to dynamic import + interop resolver.
- Added explicit runtime error if no factory can be resolved.

### `tests/electron/main/main-module-interop.test.ts`

- Added targeted tests for all supported export shapes and invalid module input.

## Validation

Executed and passed:

- `npx vitest run tests/electron/renderer/app-utils-extraction.test.ts`
- `npx vitest run tests/electron/main/main-module-interop.test.ts`
- `npx vitest run tests/electron/main/main-realtime-events.test.ts`
- `npm run check --prefix electron`
- `npm run main:build --prefix electron`

## Outcome

- Tool cards now consistently show the correct tool name (`shell_cmd` in the reported case).
- Electron main no longer depends on a single fragile module export shape for realtime runtime bootstrapping.
