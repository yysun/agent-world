# Remove CRUD Events from Runtime

**Completed:** 2026-02-20  
**Requirement:** [req-remove-crud-events.md](../../reqs/2026-02-20/req-remove-crud-events.md)  
**Plan:** [plan-remove-crud-events.md](../../plans/2026-02-20/plan-remove-crud-events.md)

## Summary

Removed legacy CRUD event-channel usage from the runtime path and aligned core/server behavior with the plan target state.

CRUD event types and publishers are no longer part of the active runtime event contract, and stale forwarding remnants were cleaned up.

## Key Changes

### Core event contract

- `core/types.ts`
  - Removed `EventType.CRUD`.
  - Removed `WorldCRUDEvent` type usage from runtime payload mappings.

### Event publishers/persistence

- `core/events/publishers.ts`
  - Removed `publishCRUDEvent(...)`.
- `core/events/persistence.ts`
  - Removed CRUD subscription/cleanup handling in persistence listeners.

### Manager mutation paths

- `core/managers.ts`
  - Removed CRUD publication call sites from agent/chat mutation flows.

### SSE/runtime cleanup

- `server/sse-handler.ts`
  - Removed stale legacy event-channel listener/forwarding path so SSE wiring only tracks active message/sse/system/world channels.

### Tests

- Updated/validated affected tests in:
  - `tests/core/agent-auto-reply-runtime-sync.test.ts`
  - `tests/core/chatid-edit-isolation.test.ts`
  - `tests/core/prepare-messages-for-llm.test.ts`
  - `tests/core/events/post-stream-title.test.ts`
  - `tests/core/message-edit.test.ts`
  - `tests/web-domain/world-crud-refresh.test.ts`
  - `tests/web-domain/world-update-branch-chat.test.ts`

## Verification

- Reference scans:
  - No runtime matches for `EventType.CRUD`, `WorldCRUDEvent`, or `publishCRUDEvent`.
- Targeted tests:
  - `npx vitest run` on plan-related suites passed.
- Type/build checks:
  - `npm run check --silent` passed.

## Notes

- Existing historical persisted records with `type: 'crud'` are unaffected; this change removes active runtime emission/forwarding only.
