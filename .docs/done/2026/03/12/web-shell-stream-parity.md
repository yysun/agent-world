# Done: Web Shell Stream Parity

**Date:** 2026-03-12
**Related:** [REQ](../../reqs/2026/03/12/req-web-shell-stream-parity.md), [Plan](../../plans/2026/03/12/plan-web-shell-stream-parity.md)

## Summary

Completed the web-side shell streaming parity work so `shell_cmd` runtime output now renders through the tool message UI instead of a normal assistant streaming bubble, the orange running request card resolves to green `done` immediately when the tool completes, and later persisted tool messages do not duplicate the already-visible result.

## Key Changes

1. Shell assistant stdout SSE now routes through the web tool-stream path.
   - The web SSE client detects shell stdout assistant stream events (`messageId` ending in `-stdout`) and publishes them as tool-stream rows.
   - Shell tool metadata is preserved across live output, including `toolName`, `toolInput`, `command`, and `toolCallId`.
   - Running shell stream rows are attached to the existing request card instead of rendering as a second standalone tool card.

2. Live shell stream rows now finalize cleanly.
   - Terminal shell tool events end the matching live stdout/stderr tool rows so transient stream surfaces do not linger after completion.
   - Late `tool-start` events backfill command metadata onto already-visible live shell rows.
   - Shell `tool-result` and `tool-error` events now also synthesize a terminal `role: tool` completion row in the live web transcript so the merged request card can flip state before any refresh.

3. Web transcript reconstruction now handles more completed tool cases.
   - Tool request rows can merge reply-linked tool results in addition to direct `tool_call_id` matches.
   - Inline `Calling tool:` request rows without structured `tool_calls` can now resolve into the final completed tool card when the result is linked by reply.
   - Later persisted shell tool messages replace the synthetic live completion row by `tool_call_id` instead of leaving duplicate completion rows behind.

4. Live and completed text output now share the same bounded result viewport behavior.
   - Plain text tool output uses a compact scrollable viewport instead of expanding indefinitely.
   - Live tool rows reuse the same output surface styling as completed tool rows.

5. Active-chat safety and upstream event semantics were tightened during review.
   - Web tool lifecycle handlers now ignore tool events whose `chatId` does not match the selected chat, preventing background-chat completions from surfacing in the active transcript.
   - Core message publishing now preserves `world` and `system` sender roles while still forwarding enhanced live message metadata needed by the web client.

## Verification

- `npx vitest run tests/web-domain/shell-stream-web-parity.test.ts tests/web-domain/world-update-message-filter.test.ts tests/web-domain/tool-merge.test.ts tests/web-domain/message-content-tool-summary.test.ts tests/web-domain/tool-message-ui.test.ts tests/core/events/message-id-pregeneration.test.ts`
- `npm run integration`
- `npm run build --workspace=web`

## Notes

- `npm run integration` emitted the existing non-failing `node-cron` sourcemap warning.
- The web build still emits the existing `doodle.css/border.svg` runtime-resolution warning and the pre-existing Vite large-chunk warning.
