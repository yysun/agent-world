# CLI Tool Stream Display & Timeout Extension

**Date**: 2026-02-11
**Type**: Bug Fix

## Overview
Fixed two bugs preventing the CLI from displaying real-time streaming output from shell commands (especially AI commands like `codex exec`, `gemini`, `copilot`) and preventing premature idle timeout during long-running tool execution.

## Root Cause
Three independent issues combined to make tool streaming invisible in the CLI:

1. **AI command path bypassed streaming entirely** — In `orchestrator.ts`, AI commands (`codex`, `gemini`, `copilot`) have a special code path that calls `executeShellCommand()` directly, bypassing the tool's `execute()` function. This meant no `onStdout`/`onStderr` callbacks were set up, so no `tool-stream` SSE events were ever emitted.

2. **`publishSSE` dropped critical fields** — The `publishSSE()` function in `publishers.ts` constructed the `WorldSSEEvent` object without including `toolName` and `stream` fields. The CLI's `handleToolStreamEvents` filter checks `eventData.toolName === 'shell_cmd'`, so events without `toolName` were silently dropped.

3. **Fixed idle timeout with no extension** — `WorldActivityMonitor` used a fixed timeout that could not be reset when streaming data arrived, causing "Timed out waiting for world to become idle" errors during active tool execution.

## Implementation

### Fix 1: AI Command Streaming Callbacks (`core/events/orchestrator.ts`)
Added `onStdout` and `onStderr` callbacks to the `executeShellCommand()` call in the AI command path. These callbacks call `publishSSE()` with `type: 'tool-stream'`, matching the pattern used by normal tool execution in `shell-cmd-tool.ts`.

### Fix 2: SSE Field Propagation (`core/events/publishers.ts`)
Added `toolName: data.toolName` and `stream: data.stream` to the `WorldSSEEvent` object constructed in `publishSSE()`.

### Fix 3: Timeout Extension (`cli/index.ts`)
- Added `timeoutMs` field to `IdleWaiter` interface to store original timeout duration
- Added `extendTimeout()` method to `WorldActivityMonitor` that resets main timeout and clears `noActivityTimeout` for all active waiters
- Wired SSE listener in interactive mode to call `extendTimeout()` on `tool-stream` events
- Added pipeline mode SSE listener solely for timeout extension (no output rendering)

## Files Changed
| File | Change |
|------|--------|
| `core/events/orchestrator.ts` | Added streaming callbacks to AI command `executeShellCommand()` call |
| `core/events/publishers.ts` | Added `toolName` and `stream` fields to `publishSSE` event construction |
| `cli/index.ts` | Added `extendTimeout()` method, `timeoutMs` to `IdleWaiter`, SSE listeners for both modes |

## Testing
- TypeScript compiles clean (`tsc --noEmit`)
- 24 tests pass: 8 shell-cmd streaming tests, 3 post-stream-title tests, 13 message-id tests
- All existing tests unaffected (backwards compatible — streaming callbacks remain optional)

## Related Work
- Requirement: [.docs/reqs/2026-02-11/req-cli-tool-stream-timeout.md](../../reqs/2026-02-11/req-cli-tool-stream-timeout.md)
