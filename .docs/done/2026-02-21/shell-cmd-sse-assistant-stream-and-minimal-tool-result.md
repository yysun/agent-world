# Done: Shell Cmd SSE Assistant Stream and Minimal Tool Result

**Date**: 2026-02-21  
**Context**: `CR + DD` pass for shell command streaming/result contract and Electron tool-stream UI behavior.

## Summary

Completed the shell command runtime/result split and renderer alignment:
- shell `stdout` now streams through assistant SSE (`start/chunk/end`) and is persisted once after execution completes,
- shell `stderr` remains on legacy `tool-stream`,
- LLM-facing `shell_cmd` result is minimal (status/exit semantics, no transcript body),
- Electron tool cards now preserve tool metadata, restore tool request rows, show command-aware running labels, and use unified dark output styling for stderr/stdout.

## Completed Scope

### Core shell execution contract
- Added minimal shell LLM result formatter:
  - `status`, `exit_code`, `timed_out`, `canceled`, optional `reason`.
- Added `llmResultMode` support and wired shell tool execution to use `minimal` mode in orchestrator and continuation contexts.
- Implemented split runtime streaming:
  - `stdout` -> assistant SSE `start/chunk/end` with `messageId: <toolCallId>-stdout`,
  - `stderr` -> legacy SSE `tool-stream`.
- Persisted only finalized stdout assistant message after command completion.
- Prevented continuation-token amplification by excluding persisted `*-stdout` assistant stream messages from historical LLM relevance filtering.

### Timeout and transport compatibility
- Extended timeout refresh logic in CLI/server SSE listeners to treat shell assistant stream activity (`start/chunk/end` + `toolName='shell_cmd'`) as keepalive input.
- Preserved compatibility with legacy `tool-stream` timeout behavior.

### Electron realtime + UI behavior
- Realtime serialization now preserves:
  - message `tool_calls` and `toolCallStatus`,
  - SSE `toolName` and `stream`.
- Renderer tool classification now treats assistant messages with `tool_calls` as tool-related.
- Restored tool-request header behavior from metadata (`⚙️ Tool request → shell_cmd`).
- Added shell command running label support:
  - `⚙️ Running command: <name>` when command metadata is available.
- Added command metadata propagation/backfill for tool-stream rows when tool-start metadata arrives.
- Unified stderr/stdout tool output card styling to dark background + light text.

## Key Files Updated

- `/Users/esun/Documents/Projects/agent-world/core/shell-cmd-tool.ts`
- `/Users/esun/Documents/Projects/agent-world/core/events/orchestrator.ts`
- `/Users/esun/Documents/Projects/agent-world/core/events/memory-manager.ts`
- `/Users/esun/Documents/Projects/agent-world/core/utils.ts`
- `/Users/esun/Documents/Projects/agent-world/server/api.ts`
- `/Users/esun/Documents/Projects/agent-world/server/sse-handler.ts`
- `/Users/esun/Documents/Projects/agent-world/cli/index.ts`
- `/Users/esun/Documents/Projects/agent-world/electron/main-process/message-serialization.ts`
- `/Users/esun/Documents/Projects/agent-world/electron/renderer/src/domain/chat-event-handlers.ts`
- `/Users/esun/Documents/Projects/agent-world/electron/renderer/src/streaming-state.ts`
- `/Users/esun/Documents/Projects/agent-world/electron/renderer/src/hooks/useStreamingActivity.ts`
- `/Users/esun/Documents/Projects/agent-world/electron/renderer/src/hooks/useChatEventSubscriptions.ts`
- `/Users/esun/Documents/Projects/agent-world/electron/renderer/src/components/MessageContent.tsx`
- `/Users/esun/Documents/Projects/agent-world/electron/renderer/src/utils/message-utils.ts`
- `/Users/esun/Documents/Projects/agent-world/tests/core/shell-cmd-format.test.ts`
- `/Users/esun/Documents/Projects/agent-world/tests/core/shell-cmd-integration.test.ts`
- `/Users/esun/Documents/Projects/agent-world/tests/core/would-agent-responded-filter.test.ts`
- `/Users/esun/Documents/Projects/agent-world/tests/electron/renderer/app-utils-extraction.test.ts`
- `/Users/esun/Documents/Projects/agent-world/tests/electron/renderer/streaming-state.test.ts`

## Validation Performed

- `npx vitest run tests/electron/renderer/streaming-state.test.ts tests/electron/renderer/app-utils-extraction.test.ts tests/core/shell-cmd-format.test.ts tests/core/shell-cmd-integration.test.ts tests/core/would-agent-responded-filter.test.ts`
- `npx tsc --noEmit --pretty false`

All commands above passed.

## CR Outcome

- No unresolved high-priority findings remain in the reviewed uncommitted scope.
- One robustness improvement was applied during CR:
  - backfill command/tool metadata on late `tool-start` events so shell tool-stream rows still resolve `Running command: <name>`.
