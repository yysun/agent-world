# REQ: Auto-resume pending last message on chat load

**Last Updated:** 2026-02-25

## Summary
When a chat is loaded/restored, the system must automatically continue any pending final turn so the user does not need to manually re-trigger execution.

## Problem
After loading an existing chat, the final message can be left in a pending state:
- The last message is a user message that has not yet been submitted to the model.
- The last message is a tool call request that has not yet invoked the tool.

In both cases, users currently need to manually intervene, which breaks continuity and can cause confusion.

## Requirements (WHAT)
1. On chat load/restore, inspect the last message in the loaded chat.
2. If the last message is a user message that is pending submission, submit it automatically.
3. If the last message is a tool call request that is pending execution, invoke the tool automatically.
4. Auto-resume behavior must run once per chat-load event for the currently loaded chat.
5. The behavior must preserve existing message order and existing event history semantics.
6. If there is no pending actionable last message, do nothing.

## Acceptance Criteria
- Given a loaded chat whose final message is a pending user message, when the chat is restored, then that message is automatically submitted without manual user action.
- Given a loaded chat whose final message is a pending tool call request, when the chat is restored, then that tool call is automatically executed without manual user action.
- Given a loaded chat whose final message is already completed/non-actionable, when the chat is restored, then no new submission/tool execution is triggered.
- Auto-resume on load does not duplicate execution for a single load event.

## Out of Scope
- Changes to model/tool business logic unrelated to load-time auto-resume.
- New UI controls, prompts, or retry flows beyond automatic continuation on load.

## Notes
This REQ defines expected behavior only and intentionally does not prescribe implementation details.

## Implementation Status
- Implemented in core-driven chat restore/activation flow.
- Pending user-last and pending assistant tool-call-last cases are auto-resumed with per-load dedupe guards.
