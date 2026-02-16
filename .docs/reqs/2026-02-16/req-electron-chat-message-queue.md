# Requirement: Electron chat user message queue

## Overview
Add a user-message queue to the Electron chat UI so users can continue typing/sending while prior requests are still processing. Queued messages are dispatched one-by-one and removed after each successful send.

## Goals
- Allow uninterrupted user input during active chat processing.
- Ensure deterministic, sequential dispatch of queued user messages per chat session.
- Give users full queue control (pause, resume, stop/discard, edit, delete).
- Prevent accidental queue execution when switching between chats.

## Functional Requirements
1. The Electron chat composer must support enqueuing user messages when the selected chat is currently processing or already has queued items.
2. Queue processing must be per-chat-session (no shared/global queue across chats).
3. Messages in a chat queue must be sent strictly one-by-one in FIFO order.
4. After a queued message is sent successfully, it must be removed from that chat queue.
5. Queue controls must include:
   - `Pause`: stop dispatching new queued items, keep queue contents.
   - `Resume`: continue dispatching queued items from the current queue position.
   - `Stop`: halt queue execution immediately for the chat.
   - `Discard`: clear all queued items for the chat.
6. Queue state must be visible in the Electron UI for the selected chat, including:
   - Current queue status (`running`, `paused`, `stopped`, `idle`)
   - Ordered queued messages
   - Which message (if any) is currently being dispatched
7. Users must be able to edit queued messages before they are dispatched.
8. Users must be able to delete queued messages before they are dispatched.
9. If the queue processor reaches a message currently in edit mode, queue processing must pause automatically and wait for user action (save/cancel/resume).
10. When user selects a different chat session and that selected chat has a non-empty queue, the UI must prompt for confirmation:
   - `Continue queue` (keep and continue existing queue behavior)
   - `Discard queue` (clear queued items before entering chat)
11. Queue operations must surface clear status feedback in the existing Electron status/notification patterns.

## Behavioral Rules
- Queue dispatch must only target the currently selected world and the queue’s owning chat session.
- Queue actions in one chat must not affect queues in other chats.
- Edit/delete must be disallowed for the message currently in-flight dispatch.
- Queue state transitions must be explicit and deterministic.

## Non-Functional Requirements
- Scope is Electron frontend only (`electron/renderer`), with integration to existing desktop bridge APIs as needed.
- Existing chat send/stop/edit/delete features must continue to work for non-queued flows.
- UX should remain minimal and consistent with current desktop styling and controls.

## Constraints
- Do not implement this in `web/`.
- Do not introduce unrelated workflow changes outside queue behavior.
- Keep requirements focused on product behavior (`WHAT`), not internal implementation details (`HOW`).

## Acceptance Criteria
- [ ] Users can submit multiple messages while chat is active, and messages are queued for that chat.
- [ ] Queued messages dispatch sequentially in FIFO order.
- [ ] Successfully dispatched queued messages are removed from queue.
- [ ] Queue can be paused and resumed without losing queued items.
- [ ] Queue can be stopped and discarded.
- [ ] Queue UI is visible and shows status + ordered items.
- [ ] Users can edit queued messages before dispatch.
- [ ] Users can delete queued messages before dispatch.
- [ ] Queue auto-pauses when it reaches a message currently being edited.
- [ ] Selecting a chat with an existing queue prompts user to continue or discard.
- [ ] Choosing discard clears queue for that chat; choosing continue preserves queue.

## Suggested Additions to Complete the Story
- Add a per-chat unsent-queue badge in the session list (e.g., queued count).
- Add retry handling for failed queued sends (`retry item` / `retry all failed`).
- Persist queue state across renderer refresh/reload to avoid losing unsent user intent.
- Add telemetry/log events for queue lifecycle transitions (enqueue, pause, resume, stop, discard, sent, failed).
