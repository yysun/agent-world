# Done: Web Event Handler Generator Flow

**Date**: 2026-03-11  
**Type**: Refactor Completion  
**Component**: `web` AppRun update flow  
**Related Docs**:
- `.docs/reqs/2026/03/11/req-web-event-handler-generator-flow.md`
- `.docs/plans/2026/03/11/plan-web-event-handler-generator-flow.md`

## Summary

Completed the scoped refactor to remove handler-to-handler `app.run(...)` chaining from the targeted web update flows.

The web update layer now uses direct async-generator composition for:

- send flow (`key-press` and `send-message`)
- system refresh flow (`handleSystemEvent`)
- chat creation flow (`create-new-chat`)

## Implemented Changes

- Added `sendMessageFlow(...)` as the shared async-generator flow for validation, optimistic send state, SSE startup, and error completion.
- Updated `key-press` to compose the send flow directly instead of dispatching `send-message` indirectly.
- Updated `send-message` to use the shared generator flow directly.
- Added `refreshWorldState(...)` to compose world rehydration from system-triggered refresh paths.
- Updated `handleSystemEvent` to use async-generator composition for refresh cases while preserving chat scoping and transient-message merge behavior.
- Updated `create-new-chat` to compose directly into `initWorld(...)` using the returned `chatId` instead of dispatching `initWorld` indirectly.
- Fixed a review-found regression so missing active chat now returns an error without inserting a transient optimistic user message.

## Tests Added or Updated

- Added `tests/web-domain/world-update-generator-flow.test.ts`
  - optimistic send state yields before SSE startup completion
  - missing active chat does not create an optimistic message
  - chat creation hydrates the created chat directly
- Updated `tests/web-domain/world-crud-refresh.test.ts`
  - adapted system-refresh assertions to the generator-composed handler shape

## Validation

Focused unit coverage passed with Node 22:

- `tests/web-domain/world-update-generator-flow.test.ts`
- `tests/web-domain/world-crud-refresh.test.ts`
- `tests/web-domain/world-update-edit-clears-hitl.test.ts`
- `tests/web-domain/world-update-chat-switch-hitl-replay.test.ts`
- `tests/web-domain/world-update-working-agent.test.ts`

Result: 5 test files passed, 16 tests passed.

## Notes

- Repo-wide `npm run check` remains blocked by a pre-existing unrelated TypeScript error in `server/sse-handler.ts` (`TS2349` at line 484).
- `npm run integration` was not run because this refactor did not change server/API transport contracts.
