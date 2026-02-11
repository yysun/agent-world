# Requirement: CLI Tool Stream Display & Timeout Extension

## Overview
Fix two bugs preventing the CLI from properly handling long-running tool commands (e.g., `codex exec`) that produce streaming output via `shell_cmd`:

1. **Tool streaming output not displayed** — real-time stdout/stderr from `shell_cmd` is invisible in the CLI.
2. **Idle timeout fires prematurely** — the `WorldActivityMonitor` timeout is fixed and does not reset when streaming data arrives, causing "Timed out waiting for world to become idle" errors during active tool execution.

## Goals
- Stream tool output (stdout/stderr) to the CLI console in real time
- Keep the idle-wait timeout alive as long as the tool is producing output
- Apply to both interactive and pipeline CLI modes

## Functional Requirements

### REQ-1: Propagate `toolName` and `stream` fields through `publishSSE`
- `publishSSE()` must include `toolName` and `stream` fields from the incoming `Partial<WorldSSEEvent>` data in the constructed SSE event object.
- Without these fields, the CLI's `handleToolStreamEvents` filter (`eventData.toolName === 'shell_cmd'`) silently drops all tool-stream events.

### REQ-2: Extend idle timeout on tool-stream data
- `WorldActivityMonitor` must provide an `extendTimeout()` method that resets the main timeout for all active waiters to their original duration.
- The `noActivityTimeout` must also be cleared when streaming data arrives.

### REQ-3: Wire SSE listener to call `extendTimeout` on tool-stream events
- In interactive mode, the SSE event listener must call `activityMonitor.extendTimeout()` when a `tool-stream` event arrives.
- In pipeline mode, a dedicated SSE listener must be attached solely for timeout extension on `tool-stream` events (pipeline mode otherwise skips SSE).

## Non-Functional Requirements
- Backwards compatible — streaming callbacks remain optional; non-streaming tool executions unaffected.
- No new dependencies.
- Existing tests must continue to pass.

## Constraints
- The `IdleWaiter` interface must store `timeoutMs` so `extendTimeout` can reset with the correct duration.
- Pipeline mode must not render tool-stream output to console (only extend timeout), since pipeline disables streaming display.

## Acceptance Criteria
- [ ] `publishSSE` includes `toolName` and `stream` in emitted events
- [ ] CLI displays real-time stdout/stderr from `shell_cmd` tool calls in interactive mode
- [ ] Long-running tool commands (e.g., `codex exec`) do not trigger "Timed out waiting for world to become idle"
- [ ] Pipeline mode extends timeout on tool-stream data without rendering output
- [ ] All existing tests pass (`tsc --noEmit`, `vitest run`)
- [ ] File headers updated with change dates

## Affected Files
- `core/events/publishers.ts` — REQ-1
- `cli/index.ts` — REQ-2, REQ-3
