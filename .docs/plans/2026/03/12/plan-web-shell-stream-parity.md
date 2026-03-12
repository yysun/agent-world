# Plan: Web Shell Stream Parity

**Date:** 2026-03-12
**Related:** [REQ](../../../reqs/2026/03/12/req-web-shell-stream-parity.md)

## Implementation Plan

- [x] Route shell assistant SSE stdout (`start/chunk/end`) into the web tool-stream path.
- [x] Preserve shell tool metadata (`toolName`, `command`, `toolInput`) for live web tool rows and late tool-start backfill.
- [x] Finalize live shell stream rows when terminal tool events arrive.
- [x] Expand web tool-result merge logic to support reply-linked completion fallback.
- [x] Constrain live and completed text output to a shared bounded scroll viewport.
- [x] Upsert a terminal live shell completion row from `tool-result`/`tool-error` events so the merged request card flips to done/failed before refresh.
- [x] Replace synthetic live shell completion rows with the later persisted tool message by `tool_call_id` to avoid duplicate tool results.
- [x] Enforce active-chat scoping for web tool lifecycle events so background chat completions do not leak into the selected chat.
- [x] Preserve `world` and `system` sender roles in the core message publisher while extending live message metadata.
- [x] Add targeted web unit tests for shell stream state + merge behavior.
- [x] Run targeted vitest coverage, `npm run integration`, and web build verification.
