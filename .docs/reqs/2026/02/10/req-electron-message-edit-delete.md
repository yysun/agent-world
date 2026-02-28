# Requirement: User Message Edit and Delete in Electron App

**Date**: 2026-02-10  
**Status**: New  
**Type**: Feature Parity

## Overview

Implement user message edit and delete functionality in the Electron desktop app, following the same patterns and behavior established in the web app. This ensures feature parity and consistent user experience across both platforms.

## Goals

- Enable users to edit their own messages in the Electron app
- Enable users to delete messages and all subsequent conversation
- Match web app UX patterns exactly for consistency
- Maintain backend API integration (DELETE → POST approach)
- Preserve optimistic UI updates and error handling

## Functional Requirements

### Message Edit Feature

**REQ-1: Edit Button Display**
- Show edit button (pencil icon) only on user messages (role='user', sender='human'/'HUMAN')
- Position edit button next to message timestamp
- Disable edit button until message has backend messageId (prevents premature edits)
- Show hover state for edit button

**REQ-2: Edit Mode**
- Clicking edit button enters edit mode for that message
- Replace message display with textarea containing current message text
- Show Save and Cancel buttons below textarea
- Textarea should be similar size/style to composer
- Focus textarea on edit mode entry

**REQ-3: Edit Cancellation**
- Cancel button closes edit mode without changes
- Escape key also cancels edit
- Returns to normal message display

**REQ-4: Edit Submission**
- Save button triggers edit submission
- Validates edited text is not empty
- Checks for active chat session
- Checks for session mode enabled (currentChatId)
- Stores backup in localStorage before deletion
- Optimistically removes edited message and all subsequent messages from UI
- Calls DELETE API to remove messages from backend
- Calls POST API to resubmit edited message (reuses SSE streaming)
- Shows error if DELETE or POST fails
- Clears localStorage backup on success

**REQ-5: Edit Error Handling**
- Handle 423 Locked: "World is processing, try again"
- Handle 404 Not Found: "Message already deleted"
- Handle 400 Bad Request: "Only user messages can be edited"
- Handle POST failure: "Messages removed but resubmission failed"
- Restore messages on DELETE error
- Show error message to user

### Message Delete Feature

**REQ-6: Delete Button Display**
- Show delete button (X icon) on user messages
- Position delete button next to edit button
- Show hover state (red color)
- Only show on messages with messageId

**REQ-7: Delete Confirmation**
- Clicking delete shows confirmation modal/dialog
- Modal displays: "Delete this message and all responses after it?"
- Shows message preview (first 100 chars)
- Provides Cancel and Delete buttons
- Clicking outside modal or pressing Escape cancels

**REQ-8: Delete Execution**
- Delete button in modal triggers deletion
- Validates message has messageId and chatId
- Validates current chat exists
- Calls DELETE API endpoint
- Removes message and subsequent messages from UI
- Reloads world data to get updated messages
- Rebuilds message list from agent memory (with deduplication)

**REQ-9: Delete Error Handling**
- Show inline error message if deletion fails
- Handle partial failures (some agents failed)
- Display which agents failed if applicable
- Close modal after error

## Non-Functional Requirements

### Performance
- Edit/delete operations should feel instant with optimistic updates
- API calls should timeout appropriately (use existing defaults)
- UI should not freeze during operations

### Reliability
- localStorage backup ensures edit recovery
- Error states properly revert optimistic changes
- Network failures handled gracefully

### Usability
- Match web app UX exactly (same button positions, styles, flows)
- Clear visual feedback for all states (loading, error, success)
- Keyboard shortcuts work as expected (Escape to cancel, Enter to save if not multiline)

### Maintainability
- Follow React hooks patterns used in App.jsx
- Reuse existing API functions
- Use existing styling tokens (Tailwind classes)
- Add clear comments explaining the two-phase edit flow

## Constraints

- Must use existing backend API endpoints (no new endpoints)
- Must follow React functional component patterns (no classes)
- Must integrate with existing SSE streaming system
- Must maintain existing message deduplication logic
- Must preserve markdown rendering for messages

## Acceptance Criteria

- [ ] Edit button appears on user messages only
- [ ] Edit button disabled until messageId exists
- [ ] Clicking edit enters edit mode with textarea
- [ ] Cancel exits edit mode without changes
- [ ] Save validates input and session state
- [ ] Edit creates localStorage backup before deletion
- [ ] Edit removes subsequent messages optimistically
- [ ] Edit calls DELETE then POST APIs
- [ ] Edit clears backup on success
- [ ] Edit shows appropriate errors on failure
- [ ] Delete button appears on user messages
- [ ] Delete shows confirmation modal/dialog
- [ ] Delete modal allows cancellation
- [ ] Delete calls API and reloads world
- [ ] Delete handles errors appropriately
- [ ] Both features work in all chat sessions
- [ ] UI matches web app styling and positioning
- [ ] Keyboard shortcuts work (Escape, Enter)

## Dependencies

- Existing DELETE /worlds/:worldName/messages/:messageId API
- Existing POST /messages API (sendChatMessage)
- Existing getWorld() API for reloading after delete
- localStorage for edit backup
- React state management (useState hooks)

## Success Metrics

- Users can edit their messages successfully
- Users can delete messages and subsequent conversation
- Edit/delete operations complete without errors in normal scenarios
- Error cases show appropriate user-friendly messages
- Feature behavior matches web app exactly

## References

- Web App Implementation: `web/src/domain/editing.ts`
- Web App Implementation: `web/src/domain/deletion.ts`
- Web App Update Handlers: `web/src/pages/World.update.ts`
- Electron Main App: `electron/renderer/src/App.jsx`

## Notes

- The edit feature uses a two-phase approach: DELETE (removes messages) → POST (resubmits edited content)
- This reuses existing SSE streaming infrastructure for agent responses
- localStorage backup provides recovery if POST fails after successful DELETE
- Message deduplication handles multi-agent scenarios (only first agent shown for user messages)
- Both features require active session mode (currentChatId) to function
