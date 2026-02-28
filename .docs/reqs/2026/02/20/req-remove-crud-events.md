# REQ: Remove CRUD Events

## Summary
Remove CRUD events from the runtime event model so entity create/update/delete operations are no longer published as a dedicated event stream.

## Problem Statement
The system currently defines and emits CRUD events (`type: 'crud'`) in core runtime flows, and persists those events. These events are not consumed by the active frontend realtime pipelines, creating an unnecessary event category and maintenance overhead.

## Goals
- Remove CRUD as a first-class runtime event type.
- Ensure runtime behavior remains correct for world, agent, and chat operations after CRUD event removal.
- Keep existing message, SSE, world/tool, system, and activity event behaviors unchanged.

## Non-Goals
- Redesigning frontend CRUD UX.
- Changing existing world/agent/chat REST or IPC command semantics.
- Backfilling or migrating historical documentation unrelated to this scope.

## Requirements (WHAT)
1. The runtime event type set must no longer include a CRUD event channel.
2. CRUD event payload types/interfaces must be removed from the typed event map used by runtime emission/subscription.
3. World/agent/chat mutation operations must not emit CRUD events.
4. Event persistence setup must not subscribe to, persist, or clean up CRUD event listeners.
5. Any runtime publisher API dedicated to CRUD events must be removed.
6. No new persisted events may be written with `type: 'crud'` after this change.
7. Existing non-CRUD realtime event delivery must continue to work without regression.
8. Tests and type checks must pass with CRUD event support removed.

## Acceptance Criteria
- Searching the codebase for `EventType.CRUD` returns no runtime usage.
- Searching the codebase for `publishCRUDEvent` returns no runtime usage.
- Runtime event listeners/subscriptions only include supported non-CRUD channels.
- Project tests/type checks relevant to event pipelines complete successfully.
