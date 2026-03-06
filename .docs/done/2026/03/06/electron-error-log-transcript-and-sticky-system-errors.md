# Done: Electron Error Log Transcript and Sticky System Errors

**Date:** 2026-03-06
**Related:** [REQ](../../reqs/2026/03/06/req-electron-system-event-status-bar.md), [Plan](../../plans/2026/03/06/plan-electron-system-event-status-bar.md)

## Summary

Fixed the Electron regression where selected-chat backend error logs no longer appeared in the message list.

The renderer now:

- restores selected-chat `error`-level realtime log events into the transcript,
- keeps non-error log events in the diagnostics/logs panel only,
- continues routing `system` events to the status bar rather than the transcript,
- preserves `error`-kind system statuses until they are replaced or the user changes world/chat context,
- keeps non-error system statuses transient.

## Root Cause

Two renderer changes had combined to remove visible error feedback from the main chat flow:

1. realtime `type='log'` payloads were no longer inserted into chat message state, and
2. transcript rendering excluded all `log` / `logEvent` rows.

At the same time, continuation failures still published chat-scoped `system` error events, but those statuses auto-expired after 5 seconds, making them easy to miss.

## Delivered Changes

1. Restored transcript visibility for selected-chat error logs.
   - `electron/renderer/src/domain/chat-event-handlers.ts`
     - selected-chat realtime `log` payloads with `level='error'` are now converted into transcript messages.
     - existing suppression for redundant stream-error/log duplication is preserved.
   - `electron/renderer/src/domain/message-updates.ts`
     - log transcript rows now use stable log-derived IDs.
   - `electron/renderer/src/utils/message-utils.ts`
     - transcript filtering now allows only `error`-level log rows to render.

2. Kept system events in the status bar but made error statuses sticky.
   - `electron/renderer/src/domain/session-system-status.ts`
     - `error`-kind statuses now return `expiresAfterMs: null`.
     - non-error statuses still use the 5-second TTL.
   - `electron/renderer/src/App.tsx`
     - status-bar expiry scheduling now skips non-expiring error statuses.

## Regression Coverage

Added targeted renderer tests for:

- transcript filtering that allows `error`-level log rows and excludes non-error log rows,
- selected-chat realtime error-log ingestion into transcript state,
- persistent error system-status TTL behavior vs transient non-error system-status TTL behavior.

Updated tests:

- `tests/electron/renderer/app-utils-extraction.test.ts`
- `tests/electron/renderer/chat-event-handlers-domain.test.ts`
- `tests/electron/renderer/session-system-status.test.ts`

## Validation

Executed:

- `npx vitest run tests/electron/renderer/app-utils-extraction.test.ts tests/electron/renderer/chat-event-handlers-domain.test.ts tests/electron/renderer/session-system-status.test.ts tests/electron/renderer/working-status-bar.test.ts`
- `npm run integration`

Results:

- focused renderer suites passed: 55 tests
- integration suite passed: 24 tests

## Notes

- `system` events remain status-bar-only by design; they are not reintroduced into the transcript.
- A non-blocking sourcemap warning from `node-cron` still appeared during `npm run integration`.
