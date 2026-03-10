# Done: Chat Title Idle-Only Trigger

**Date**: 2026-03-10  
**Type**: Reliability Simplification  
**Related Requirement**: `/.docs/reqs/2026/03/10/req-chat-title-idle-only-trigger.md`  
**Related Plan**: `/.docs/plans/2026/03/10/plan-chat-title-idle-only-trigger.md`

## Overview

Completed the chat-title trigger simplification by removing the human-message debounce path and making idle activity the only automatic title-generation boundary.

## Delivered

- Removed `scheduleNoActivityTitleUpdate(...)` and the debounce timer state from `core/events/title-scheduler.ts`.
- Removed human-message title scheduling from the combined persistence message handler in `core/events/persistence.ts`.
- Removed the standalone world-message title scheduling side effect from `core/events/subscribers.ts`.
- Preserved the existing idle-path safety rules:
  - chat-scoped in-flight deduplication keyed by `worldId:chatId`
  - in-memory default-title recheck before commit
  - storage compare-and-set title commit semantics
  - structured `chat-title-updated` system-event payload shape
- Fixed standalone runtime wiring discovered during CR so idle-only title generation still works when event persistence is unavailable:
  - `startWorld(...)` now binds the idle activity listener
  - queue responder refresh rebinds the idle activity listener
  - edit-resubmission fallback rebinds the idle activity listener

## User-Visible Outcome

- A human message alone no longer triggers automatic chat-title generation.
- An eligible idle activity event remains able to rename only the scoped target chat.
- Chats that never emit an eligible idle event now intentionally remain `New Chat`.

## Validation

Passed targeted unit coverage:

- `npm exec -- vitest run tests/core/events/post-stream-title.test.ts tests/core/events/subscription-listener-count.test.ts tests/core/subscription-refresh-title-listener.test.ts`

Passed integration coverage:

- `npm run integration`

Notes:

- Integration emitted a non-blocking `node-cron` sourcemap warning only; no failing tests.

## Primary Files Touched

- Core runtime:
  - `core/events/title-scheduler.ts`
  - `core/events/persistence.ts`
  - `core/events/subscribers.ts`
  - `core/subscription.ts`
  - `core/queue-manager.ts`
  - `core/message-edit-manager.ts`
- Tests:
  - `tests/core/events/post-stream-title.test.ts`
- Docs:
  - `/.docs/reqs/2026/03/10/req-chat-title-idle-only-trigger.md`
  - `/.docs/plans/2026/03/10/plan-chat-title-idle-only-trigger.md`

## Follow-Up Notes

- The product tradeoff accepted in AR remains in effect: human-only chats without an eligible idle event will keep the default title.
- No event payload contract changes were introduced for `chat-title-updated`.
