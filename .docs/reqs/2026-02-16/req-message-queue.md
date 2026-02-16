# REQ: User Message Queue

**Date:** 2026-02-16  
**Status:** Reviewed (AR Complete)  
**Focus:** Electron Desktop App

---

## Architecture Review Updates

**Review Date:** 2026-02-16

### Key Clarifications from AR

1. **Multi-Agent Response Handling:** Queue waits for ALL pending agent responses to complete before advancing to the next message. This ensures full conversation coherence across multi-agent scenarios.

2. **Queue Persistence:** Upgraded from "optional enhancement" to MVP requirement. Queue state persists via localStorage to prevent data loss on app refresh.

3. **Cancellation Support:** Added AbortController mechanism for clean cancellation of in-flight message sends when user stops queue or switches chats.

4. **Auto-Retry Logic:** Queue includes exponential backoff retry (max 3 attempts) for failed messages before marking as error.

---

## Overview

Add a user message queue feature to the chat system that allows users to queue multiple messages and send them sequentially, one at a time. The queue should be manageable with controls for pause, resume, and stop operations. Users should be able to edit and delete messages in queue, and receive confirmation when switching chats with an active queue.

## Problem Statement

Currently, users can only send messages one at a time and must wait for the response before sending another message to the same chat. This limits workflow efficiency when users want to:

1. Prepare a series of questions or tasks in advance
2. Continue working while messages are being processed
3. Batch-prepare messages when inspiration strikes
4. Manage the order and content of pending messages before they're sent

## Goals

1. **Queue Management**: Allow users to add multiple messages to a queue without sending them immediately
2. **Sequential Processing**: Send queued messages one at a time, waiting for each to complete before sending the next
3. **Queue Controls**: Provide pause, resume, and stop controls for queue processing
4. **Message Management**: Allow users to edit and delete messages while in queue
5. **Auto-Pause on Edit**: Automatically pause queue processing when a message being edited is reached
6. **Chat Switching Safety**: Confirm with user when switching chats that have an active/paused queue
7. **Visual Feedback**: Show queue state and contents in the UI clearly

## Requirements

### Functional Requirements

#### FR-1: Message Queue Creation
- Users can add messages to a queue without immediately sending them
- Queue is associated with a specific chat session
- Multiple messages can be queued before starting queue processing
- Queued messages persist across app sessions (optional enhancement)

#### FR-2: Queue Processing
- Queue processes messages one at a time, sequentially
- Each message is sent only after the previous message's **complete response** is finished
- **Multi-Agent Handling:** Queue waits for ALL agent responses to complete (not just primary agent)
- Processing respects the current sending mechanism (calls `api.sendMessage`)
- Once a message is sent and response completes, message is removed from the queue
- Queue automatically advances to the next message after current message's full response
- **Auto-Retry:** Failed messages retry up to 3 times with exponential backoff before marking as error

#### FR-3: Queue Controls
- **Start**: Begin processing the queue from the first unsent message
- **Pause**: Temporarily halt queue processing (current message completes, , uses AbortController if available)
- **Retry**: Manually retry a failed message (appears on error state)
- **Skip**: Skip a failed message and continue to next (appears on error statenext message does not start)
- **Resume**: Continue queue processing from the paused position
- **Stop**: Cancel all remaining queued messages (current message completes)

#### FR-4: Message Editing in Queue
- Users can edit any message while it's in the queue
- When queue processing reaches a message that's being edited, queue automatically pauses
- Queue remains paused until user explicitly resumes it
- Queue preserves position after message edit is saved or cancelled

#### FR-5: Message Deletion from Queue
- Users can delete any message from the queue
- If current message is deleted during processing, queue automatically advances to next message
- Queue state updates immediately when messages are deleted

#### FR-6: Queue UI Display
- Queue is visible in the UI when it contains messages
- Shows all queued messages in order
- Indicates which message is currently being processed
- Shows queue state (idle, running, paused, stopped)
- Provides visual controls for start/pause/resume/stop
- Shows message count (e.g., "3 messages in queue")

#### FR-7: Chat Switching with Active Queue
- When user switches to a different chat while a queue is active or paused, show confirmation dialog
- Dialog options:
  - **Continue Queue Later**: Pause the queue and switch chats (queue remains for later)
  - **DiscaQueue State Persistence (UPGRADED TO MVP)
- Queue state persists to localStorage automatically
- Queue survives app refresh/restart
- Failed persistence doesn't block queue operations (graceful degradation)
- Queue recovered from localStorage on app mount if available
- Stale queue entries (>24 hours) are cleaned up on loa
#### FR-8: Multi-Session Queue Support (Optional Enhancement)
- Each chat sessionncan have its own independent queue
- Switching between chats shows the queue for the currently selected chat
- Queue state per chat persists until explicitly cleared

### Non-Functional Requirements

#### NFR-1: User Experience
- Queue controls are intuitive and discoverable
- Visual feedback is immediate for all queue operations
- Error messages are clear and actionable
- Queue state transitions are smooth and predictable

#### NFR-2: Performance
- Adding messages to queue is instant
- Queue UI updates without lag, network errors)
- **Queue state persists via localStorage** (automatic save/load)
- Corrupted localStorage state falls back to empty queue gracefully
- Queue processing does not block UI interactions

#### NFR-3: Data Integrity
- Queue state is consistent with actual message sending state
- No duplicate messages are sent
- Queue recovers gracefully from errors (e.g., send failures)

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
- Queue persists while user performs other actions

### US-2: Processing Messages Sequentially
> As a user, I want the queue to send messages one at a time so that each message gets a complete response before the next one is sent.

**Acceptance Criteria:**
- Queue sends only one message at a time
- Next message waits for current message's response to complete
- Visual indicator shows which message is currently being processed

### US-3: Pausing and Resuming Queue
> As a user, I want to pause the queue so that I can review responses before continuing.

**Acceptance Criteria:**
- Pause button stops queue after current message completes
- Resume button continues from where queue was paused
- Queue state clearly shows "paused" status

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
- Queue count updates automatically

### US-6: Safe Chat Switching
> As a user, I want to be warned when switching chats with an active queue so that I don't accidentally lose my prepared messages.
auto-retries up to 3 times with exponential backoff. After 3 failures, queue pauses and shows error with Retry/Skip options.

2. **App Restart with Active Queue**: Queue state is loaded from localStorage. Queues in 'running' status reset to 'paused' to avoid automatic sending without user confirmation.

3. **Editing Message While Sending**: If a message is already being sent (in-flight), it cannot be edited or deleted. UI disables edit/delete buttons for sending messages.

4. **Empty Queue**: UI hides queue panel when no messages are queued.

5. **Rapid Chat Switching**: Each chat's queue state is preserved independently in localStorage with chatId as key.

6. **Stop While Message Sending**: Current message send is aborted via AbortController if supported, otherwise completes normally. All subsequent messages are discarded.

7. **Multiple Start Clicks**: Starting an already-running queue has no effect (idempotent operation). Button is disabled while running.

8. **Multi-Agent Response Completion**: Queue waits for ALL pending agents to complete (monitors `pendingResponseSessionIds`), not just primary agent.

9. **localStorage Quota Exceeded**: Queue operations continue in-memory. Persistence fails silently with console warning. User notified via status bar.

10. **Stale Queue Recovery**: On app load, queue entries older than 24 hours are automatically cleared to prevent confusion from very old queued messages.dited or deleted

4. **Empty Queue**: UI hides queue panel when no messages are queued

5. **Rapid Chat Switch (Beyond MVP)

1. **Queue Templates**: Save common message queues as reusable templates
2. **Conditional Queue**: Queue messages with conditional logic (e.g., "send if previous response contains X")
3. **Queue Scheduling**: Schedule queue to start at a specific time
4. **Queue Sharing**: Share queue configuration with other users
5. **Queue Analytics**: Track queue usage patterns and completion rates
6. **Database Persistence**: Migrate from localStorage to database for better reliability and cross-device sync
7. **Multi-Chat Queue**: Process queues across multiple chat sessions simultaneously
8. **Drag-and-Drop Reordering**: Let users rearrange queue order
9. **Import/Export Queue**: Save queue to file or load from file
2. Queue controls (pause/resume/stop) respond within 100ms
3. Message edit (For MVP)

1. **Web App Implementation**: This REQ focuses only on the Electron desktop app (web app may follow in future sprint)
2. **Real-time Queue Collaboration**: Multiple users editing the same queue
3. **AI-Powered Queue Optimization**: Automatic reordering or merging of queue messages
4. **Database Persistence**: Using database instead of localStorage (localStorage sufficient for MVP)
5. **Cross-Device Sync**: Syncing queue across multiple devices (localStorage is local only)
1. **Queue Templates**: Save common message queues as reusable templates
2. **Conditional Queue**: Queue messages with conditional logic (e.g., "send if previous response contains X")
3. **Queue Scheduling**: Schedule queue to start at a specific time
4. **Queue Sharing**: Share queue configuration with other users
5. **Queue Analytics**: Track queue usage patterns and completion rates
6. **Persist Queue to Storage**: Save queue state to database for recovery across app restarts
7. **Multi-Chat Queue**: Process queues across multiple chat sessions simultaneously

## Out of Scope

1. **Web App Implementation**: This REQ focuses only on the Electron desktop app
2. **Real-time Queue Collaboration**: Multiple users editing the same queue
3. **AI-Powered Queue Optimization**: Automatic reordering or merging of queue messages
4. **Queue Export**: Exporting queue messages to external formats

## Dependencies

- Existing `api.sendMessage` IPC method
- Current chat session state management
- Message sending completion detection mechanism
- Confirmation dialog UI component (may need to create)

## Notes

- Queue processing should respect existing concurrent chat support (per-session sending state)
- Queue UI should follow existing Electron app design patterns
- Consider using React state management or a dedicated queue manager module
- Message queue state should be separate from the main message list state
