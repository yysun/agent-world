# Done: Cross-Client System Status Parity

**Date:** 2026-03-12
**Related:** [REQ](../../reqs/2026/03/12/req-cross-client-system-status-parity.md), [Plan](../../plans/2026/03/12/plan-cross-client-system-status-parity.md)

## Summary

Completed the selected-chat `system` event parity work so runtime status now follows one pushed contract across server transport, web, CLI, and Electron instead of being hidden, dropped, or partially normalized per client.

## Key Changes

1. Transport scoping was hardened for chat-scoped SSE streams.
   - Chat-scoped SSE subscriptions now forward only explicitly chat-scoped `system` events.
   - Unscoped `system` events no longer leak into selected-chat realtime views.

2. Web now has a visible selected-chat system status surface.
   - Hidden transcript-only ingestion of `system` events was removed.
   - Selected-chat system events now populate explicit web status state and render as a visible status banner above the transcript.
   - Existing queue-dispatch failure handling still escalates to the error overlay while preserving user-visible status text semantics.
   - Chat refresh/switch paths now retain status only when the world/chat context still matches.

3. CLI now renders system status in both modes.
   - Interactive mode prints selected-chat `system` events through the status-line-safe output path.
   - Pipeline mode prints selected-chat `system` events instead of silently discarding them.
   - Plain-text and structured payloads now share one normalization helper.

4. Electron selected-chat status handling was hardened for more real runtime payload shapes.
   - Main-process realtime serialization now supports plain-text/message-fallback `system` payloads.
   - Renderer status normalization now treats queue-dispatch failure text as persistent error status.
   - Existing status-bar rendering continues to show non-error selected-chat status as overlay-only while structured error-like system events still remain transcript-capable where already intended.

5. Regression coverage now exists at the transport and client display boundaries.
   - Added SSE handler tests for scoped `system` forwarding and unscoped rejection.
   - Added web state and visible-banner tests for selected-chat system status.
   - Added CLI formatter tests for plain-text, title-update, and queue-failure payloads.
   - Added Electron tests for plain-text system-event forwarding and status classification.

## Verification

- `npx vitest run tests/api/sse-handler.test.ts tests/web-domain/world-crud-refresh.test.ts tests/web-domain/world-chat-system-status.test.ts tests/cli/system-events.test.ts tests/electron/main/main-realtime-events.test.ts tests/electron/renderer/chat-event-handlers-domain.test.ts tests/electron/renderer/session-system-status.test.ts`
- `npx vitest run tests/electron/renderer/working-status-bar.test.ts tests/web-domain/world-chat-waiting-ui.test.ts`
- `npm run integration`

## Notes

- `npm run integration` emitted the existing non-failing `node-cron` sourcemap warning.
- I did not run live manual web/Electron smoke flows; verification here is automated plus transport/client boundary review.
