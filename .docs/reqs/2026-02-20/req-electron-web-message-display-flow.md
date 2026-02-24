# REQ: Align Electron Message Display Flow with Web (Items 1, 2, 3, 5)

## Summary
Align the Electron chat UX with the web app for message box timing and working indicator visibility so users get the same perceived responsiveness and status clarity.

## Problem Statement
Electron and web currently differ in how they present user messages, assistant streaming start, streaming continuity, and working indicators. These differences make Electron feel less responsive and less explicit about in-progress work.

## Goals
- Match web behavior for user message rendering timing.
- Match web behavior for assistant message box creation at stream start.
- Match web streaming continuity behavior from start through finalization.
- Match web working indicator visibility across the full pending lifecycle.

## Non-Goals
- Redesigning message visual style, avatars, or markdown formatting.
- Changing backend transport/event schemas.
- Modifying unrelated tool-output rendering behavior outside the targeted items.

## Requirements (WHAT)
1. When a user submits a message in Electron, a user message box must appear immediately in the chat timeline without waiting for backend round-trip confirmation.
2. Electron must reconcile the optimistic user message with the backend-confirmed message so duplicate permanent user messages are not left in the timeline.
3. When assistant streaming starts, Electron must show an assistant message box immediately, before the first content chunk arrives.
4. While streaming is in progress, incoming stream chunks must update the same in-progress assistant message box instead of creating fragmented or duplicate boxes.
5. When streaming completes, the in-progress assistant box must transition cleanly to the finalized assistant message state with no duplicate final assistant messages.
6. Electron must show a working indicator from request submission until the response lifecycle is complete (success, stop, or error).
7. The working indicator must remain visible throughout active streaming/tool-response periods and must not disappear mid-response solely due to phase transitions.
8. If response processing ends due to cancellation or failure, the working indicator must clear promptly and consistently.
9. Reconciliation logic must correctly handle back-to-back user submissions with identical text without collapsing distinct sends into one message or leaving duplicates.
10. Optimistic user messages that are not yet backend-confirmed must not expose destructive/editing actions that require a persisted backend message identity.

## Acceptance Criteria
- Submitting a message shows a user bubble immediately in Electron.
- Backend confirmation does not leave duplicate user bubbles.
- Assistant bubble appears at stream start even with delayed first chunk.
- Stream chunks progressively update one assistant in-progress bubble.
- Stream end/final message does not produce duplicate assistant bubbles.
- Working indicator is visible for the full pending lifecycle and clears on completion/stop/error.
- Two consecutive user messages with identical text remain distinct and reconcile cleanly.
- Pending optimistic user messages do not expose edit/delete actions until confirmed.
