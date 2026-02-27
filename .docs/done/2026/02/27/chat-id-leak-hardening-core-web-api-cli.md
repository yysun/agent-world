# DD: Chat ID Leak Hardening (Core/Web/API/CLI)

**Date:** 2026-02-27  
**Status:** Completed (CR + implementation + targeted verification)  
**Related Context:** `.docs/done/2026/02/15/chat-id-leakage-contamination-protection.md`

## Summary

Completed a follow-up hardening pass for chat isolation across core + web/API/CLI paths.  
This closes remaining cross-chat exposure points where unscoped or mismatched events could be rendered or used as response payloads.

## CR Result

- Reviewed uncommitted delta for this leak fix scope (`core`, `server`, `web`, `cli`, tests).
- No remaining high-priority chat-leak issue was found in the patched paths after fixes.
- Electron scoped subscription routing remained intact; no additional Electron patch was required in this pass.

## Delivered

1. API non-streaming response scoping
- Hardened non-streaming `/messages` event collection in `server/api.ts`.
- Added chat-scope filtering for world/message/sse listeners used to build non-streaming response payloads.
- Prevents cross-chat message contamination in JSON response mode.

2. SSE log forwarding scoping
- Hardened `server/sse-handler.ts` realtime log forwarding.
- Added world-aware and chat-aware gating before forwarding `type='log'` SSE payloads.
- Prevents chat-scoped SSE clients from receiving foreign log events.

3. Web chat timeline scoping
- Hardened `web/src/utils/sse-client.ts` log ingestion:
  - when an active chat is selected, unscoped and mismatched logs are dropped.
- Hardened `web/src/pages/World.update.ts` system-event ingestion:
  - when an active chat is selected, unscoped and mismatched system events are dropped.

4. CLI event rendering scoping
- Hardened `cli/index.ts` listener routing with active-chat scope checks for:
  - message events
  - sse events (interactive + pipeline timeout listener)
  - system events
  - world channel events (tool/activity behavior with explicit scope rules)

5. Regression test update
- Updated web system refresh test behavior in `tests/web-domain/world-crud-refresh.test.ts` to match strict active-chat system-event scoping.

6. Core activity/title/continuation scoping hardening
- Hardened `core/activity-tracker.ts` to publish activity events with explicit `chatId` metadata.
- Hardened `core/events/subscribers.ts` idle-title flow to use event-scoped `chatId` (and ignore unscoped idle events), preventing cross-chat title updates after chat switches.
- Hardened `core/events/memory-manager.ts` continuation/system warning-error publication to always pass explicit target `chatId`.
- Hardened `core/events/orchestrator.ts` tool-execution system event publishing to always include explicit `chatId`.
- Added/updated core regression coverage for these chat-scope guarantees.

## Files Updated

- `server/api.ts`
- `server/sse-handler.ts`
- `core/activity-tracker.ts`
- `core/events/memory-manager.ts`
- `core/events/orchestrator.ts`
- `core/events/subscribers.ts`
- `web/src/utils/sse-client.ts`
- `web/src/pages/World.update.ts`
- `cli/index.ts`
- `tests/web-domain/world-crud-refresh.test.ts`
- `tests/core/events/memory-manager-continuation-guard.test.ts`
- `tests/core/events/post-stream-title.test.ts`
- `tests/core/events/orchestrator-chatid-isolation.test.ts`

## Verification Performed

Executed:

1. `npx vitest run tests/web-domain/world-crud-refresh.test.ts tests/web-domain/world-update-message-filter.test.ts tests/api/chat-route-isolation.test.ts tests/cli/process-cli-input.test.ts`
2. `npx vitest run tests/core/events/memory-manager-continuation-guard.test.ts tests/core/events/post-stream-title.test.ts tests/core/events/orchestrator-chatid-isolation.test.ts`

Result:

- 7 test files passed
- 34 tests passed
- 0 failed

## Notes

- This pass covered chat-leak protection in core runtime event routing and web/API/CLI client/server surfaces.
- There are other unrelated uncommitted workspace changes present outside this scoped fix set.
