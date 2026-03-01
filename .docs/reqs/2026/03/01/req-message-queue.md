# REQ: User Message Queue

**Date:** 2026-02-16  
**Status:** Reviewed (AR Complete)  
**Focus:** Electron Desktop App

---

## Architecture Review Updates

### AR #3 — 2026-03-01 (Final)

1. **DB Persistence (not localStorage):** Queue messages are stored in the database, tied to chats. No timeout, no auto-clean, no stale-entry expiry.

2. **No Manual "Start" Required:** Queue processing is automatic — when a chat becomes active, the core checks for pending queued messages and processes them sequentially. This extends the existing `triggerPendingUserMessageResume` pattern in `core/managers.ts`.

3. **Consolidated with Existing Auto-Resume:** The existing behavior (auto-send last user message on chat load) is the same pattern as queue processing. A queued message is just a `user`-role message stored in the DB with `status='queued'`. Core already detects pending user messages and processes them — extending this to a sequential multi-message queue requires minimal new logic.

4. **Processing Chain:** After each queued message gets a full response, core checks whether another queued message follows it and auto-advances. The chain continues until no more queued messages remain. This is handled in `core/managers.ts` after each chat response completes.

5. **No localStorage:** All previous AR #1/#2 references to localStorage persistence, stale cleanup (24h), and JSON-serializable state requirements are superseded by DB storage.

6. **Supersedence Rule:** AR #3 supersedes AR #1/#2 implementation details where they conflict.

---

## Overview

Add a user message queue feature to the chat system that allows users to queue multiple messages and send them sequentially, one at a time. Queued messages are persisted in the database tied to the chat session. Processing starts automatically when the chat becomes active, extending the existing auto-resume mechanism. Users can manage the queue (edit, delete, pause, resume, stop) and see visual feedback on queue state.

## Problem Statement

Currently, users can only send messages one at a time and must wait for the response before sending another message to the same chat. This limits workflow efficiency when users want to:

1. Prepare a series of questions or tasks in advance
2. Continue working while messages are being processed
3. Batch-prepare messages when inspiration strikes
4. Manage the order and content of pending messages before they're sent

## Goals

1. **Queue Management**: Allow users to add multiple messages to a queue without sending them immediately
2. **Sequential Processing**: Send queued messages one at a time, waiting for each to complete before sending the next
3. **DB Persistence**: Queue survives app restarts — no data loss
4. **Auto-Processing on Chat Active**: Queue automatically starts when chat is loaded/selected (no manual "Start" needed)
5. **Queue Controls**: Provide pause, resume, and stop controls for queue processing
6. **Message Management**: Allow users to edit and delete messages while in queue
7. **Visual Feedback**: Show queue state and contents in the UI clearly

## Requirements

### Functional Requirements

#### FR-1: Message Queue Creation
- Users can add messages to a queue without immediately sending them
- Queue is associated with a specific chat session
- Multiple messages can be queued before processing begins
- Queued messages persist in the database — survive app restarts

#### FR-2: Queue Processing
- Queue processes messages one at a time, sequentially
- Each message is sent only after the previous message's **complete response** is finished
- **Multi-Agent Handling:** Queue waits for ALL agent responses to complete (not just primary agent)
- Processing uses the same mechanism as the existing single-message auto-resume (`triggerPendingUserMessageResume`)
- Once a message's response completes, core advances to the next queued message automatically
- **Auto-Retry:** Failed messages retry up to 3 times with exponential backoff before marking as error

#### FR-3: Queue Controls
- **Pause**: Temporarily halt queue processing after current message completes
- **Resume**: Continue from the paused position
- **Stop**: Cancel remaining queued messages (current message completes normally)
- **Retry**: Manually retry a failed message
- **Skip**: Skip a failed message and continue to next

#### FR-4: Message Editing in Queue
- Users can edit any queued message before it's sent
- When queue processing reaches a message that's being edited, queue automatically pauses
- Queue preserves position after edit is saved or cancelled

#### FR-5: Message Deletion from Queue
- Users can delete any queued message
- Queue advances correctly when current message is deleted during processing

#### FR-6: Queue UI Display
- Queue is visible in the UI when it contains messages
- Shows all queued messages in order with their status
- Indicates which message is currently being processed
- Shows queue state (processing, paused, stopped)
- Shows message count
- Queue panel hidden when no messages are queued

#### FR-7: Auto-Processing on Chat Active
- When a chat is loaded or selected, if it has queued messages, processing begins automatically
- Matches existing `restoreChat()` behavior that detects the last user message and resumes
- Consecutive queued user messages are detected and processed in order after each response

#### FR-8: Chat Switching Safety
- When user switches to a different chat with an active queue, queue is automatically paused
- No confirmation dialog blocking navigation (queue state is safe in DB)
- Queue resumes when user returns to that chat

#### FR-9: Multi-Session Queue Support
- Each chat session has its own independent queue
- Switching between chats shows the queue for the currently selected chat
- Queue state per chat persists in DB until explicitly cleared

### Non-Functional Requirements

#### NFR-1: User Experience
- Queue controls are intuitive and discoverable
- Visual feedback is immediate for all queue operations
- Error messages are clear and actionable

#### NFR-2: Performance
- Queue UI updates without lag
- Queue processing does not block UI interactions
- DB reads for queue state are fast (indexed by chat_id)

#### NFR-3: Data Integrity
- Queue state is consistent with actual message sending state
- No duplicate messages are sent
- Queue recovers gracefully from errors

#### NFR-4: Compatibility
- Queue feature integrates with existing message sending flow
- Does not break existing single-message send functionality
- Works with all existing chat features (edit, delete, branch)

## User Stories

### US-1: Queueing Multiple Messages
> As a user, I want to add multiple messages to a queue so that I can prepare a series of questions in advance.

**Acceptance Criteria:**
- User can compose and add messages to queue without sending
- Queue shows all added messages in order
- Queue persists across app restarts

### US-2: Processing Messages Sequentially
> As a user, I want the queue to process automatically when I open a chat so I don't have to manually start it.

**Acceptance Criteria:**
- Queue starts automatically when chat becomes active and has queued messages
- Each message waits for the full response before the next is sent
- Visual indicator shows which message is currently being processed

### US-3: Pausing and Resuming Queue
> As a user, I want to pause the queue so that I can review responses before continuing.

**Acceptance Criteria:**
- Pause halts queue after current message completes
- Resume continues from where queue was paused
- Queue state clearly shows paused status

### US-4: Editing Queued Messages
> As a user, I want to edit messages in the queue so that I can refine them before they're sent.

**Acceptance Criteria:**
- Any queued message can be edited inline
- Queue pauses automatically when reaching a message being edited
- Changes are preserved when edit is saved

### US-5: Deleting Queued Messages
> As a user, I want to remove messages from the queue so that I can skip questions that become irrelevant.

**Acceptance Criteria:**
- Any queued message can be deleted with one click
- Deleted message is immediately removed from queue display

### US-6: Safe Chat Switching
> As a user, I want to switch chats freely without losing my queued messages.

**Acceptance Criteria:**
- Switching chat pauses any active queue automatically
- Queued messages remain in DB and resume when chat is reactivated

## Edge Cases

1. **Send Failure**: Auto-retries up to 3 times with exponential backoff. After 3 failures, queue pauses and shows error with Retry/Skip options.

2. **App Restart with Active Queue**: Queue state is loaded from DB. Incomplete `status='sending'` rows are reset to `status='queued'`, and processing only resumes when the user activates that chat.

3. **Editing Message While Sending**: In-flight messages cannot be edited or deleted. UI disables edit/delete buttons for the sending message.

4. **Empty Queue**: UI hides queue panel when no messages are queued.

5. **Stop While Message Sending**: Current message send completes normally. `api.stopMessage()` is called for in-flight abort if needed. All subsequent queued messages are cancelled (status updated to 'cancelled' in DB).

6. **Multiple Queued Messages on Chat Load**: Core processes them in order, one pair (user+response) at a time, chaining automatically.

7. **World Switching**: Queue processing pauses. Queue state in DB is preserved per chat.

## Future Enhancements (Beyond MVP)

1. **Queue Templates**: Save common message queues as reusable templates
2. **Conditional Queue**: Queue messages with conditional logic
3. **Queue Scheduling**: Schedule queue to start at a specific time
4. **Drag-and-Drop Reordering**: Let users rearrange queue order
5. **Import/Export Queue**: Save queue to file or load from file

## Out of Scope

1. **Web App Implementation**: This REQ focuses only on the Electron desktop app
2. **Real-time Queue Collaboration**: Multiple users editing the same queue
3. **AI-Powered Queue Optimization**: Automatic reordering or merging of queue messages
4. **Cross-Device Sync**: Queue is local to the DB instance

## Dependencies

- `agent_memory` table schema (new `status` column via migration)
- Existing `triggerPendingUserMessageResume` in `core/managers.ts` (extension point)
- Existing `restoreChat()` flow (extension point for chain advancement)
- `api.sendMessage` / `api.stopMessage` IPC methods
- Core response-complete hook path in `core/managers.ts` for queue chaining

## Notes

- Queued messages are stored as `role='user'` in `agent_memory` with `status='queued'`
- Status lifecycle: `queued` -> `sending` -> `NULL` (processed successfully)
- Failure lifecycle: after retries exhausted, message is marked `status='error'`
- Stop/skip lifecycle: remaining queued items are marked `status='cancelled'`
- The existing single-message auto-resume is a special case of this queue (queue of length 1)
- Core handles sequential chaining; the renderer hook handles UI state and controls only
