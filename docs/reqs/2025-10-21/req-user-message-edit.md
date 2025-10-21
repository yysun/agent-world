# Requirements: User Message Edit

**Document ID**: REQ-MSG-EDIT-001  
**Date**: 2025-10-21  
**Status**: Draft  
**Priority**: High  

## Overview

Users must be able to edit any user message in an active chat session. When a message is edited:
1. All messages starting from that message (including the edited message itself) are **removed** from all agent memories
2. The edited message is **resubmitted** to the world as a new message
3. Agents respond through normal message routing

This is a **remove-and-resubmit** operation, not an update operation.

## Business Goals

1. **User Control**: Enable users to correct mistakes or refine their input without losing conversation context
2. **Conversation Branching**: Allow users to explore different conversation paths by editing previous messages
3. **Data Consistency**: Ensure all agent memories reflect the edited state accurately
4. **User Experience**: Provide clear feedback during edit operations

## Scope

### In Scope
- Editing any user message in the currently active chat session
- Removing all messages starting from the edited message (including the message itself)
- Removing messages from all agent memories in the world
- Resubmitting edited message to the world as a new message (with new messageId)
- Tracking and displaying partial failures during removal operations
- Warning users before removing messages (especially for large-scale removals >10 messages)
- Special handling for first message edits (conversation restart)

### Out of Scope
- Editing messages in archived or completed chat sessions
- Editing agent responses (only user messages)
- Soft delete or undo functionality (future enhancement)
- Tracking edit history or audit trails
- Multi-user conflict resolution

## Functional Requirements

### FR-1: Message Identification
**What**: Every message must have a unique, stable identifier.

**Requirements**:
- Each message must be uniquely identifiable across all agent memories
- Identifiers must persist across server restarts
- Identifiers must be generated consistently (server-side using nanoid(10))
- Existing messages without identifiers must be automatically upgraded (migration)
- **File Storage**: messageId stored as field in AgentMessage in memory.json
- **SQL Storage**: messageId stored as column in agent_memory table

**Success Criteria**:
- No duplicate message identifiers exist in either storage system
- Messages can be reliably located by identifier in file or SQL storage
- Migration from non-identified messages works transparently
- Both storage systems support messageId field

### FR-2: Edit Capability
**What**: Users must be able to edit the content of any user message in the active chat.

**Requirements**:
- Edit button visible on all user messages in active chat
- Edit interface allows multiline text editing
- User can save edited content or cancel the operation
- Only user messages (sender='human') can be edited
- Edit must preserve message metadata (timestamp, sender, chat ID)

**Success Criteria**:
- User can click edit button and modify message text
- Edited message displays immediately in UI
- Cancel restores original message text
- Non-user messages do not show edit button

### FR-3: Edit Validation
**What**: The system must validate edit operations before execution.

**Requirements**:
- Cannot edit message while agents are currently processing messages
- Cannot edit messages in non-active chat sessions
- Must verify message exists before editing
- Must verify message belongs to the user (sender='human')
- Must count messages that will be removed and warn user
- Must require explicit confirmation for large-scale removals (>10 messages)
- Must show preview: "This will remove the edited message plus N subsequent messages"
- Must show special warning for first message: "This is the first message. Editing will restart the conversation."

**Success Criteria**:
- Edit blocked with clear error if agents are processing
- Edit blocked with clear error if chat is not active
- Warning shown with accurate message count before removal
- Enhanced confirmation required for removals affecting >10 messages
- Clear indication when editing first message (restarts conversation)
- Appropriate error messages shown for each validation failure

### FR-4: Message Removal
**What**: All messages starting from the edited message (including the edited message itself) must be removed from all agent memories.

**Requirements**:
- Remove the edited message itself from all agent memories
- Remove all messages with timestamps >= the edited message's timestamp
- Removal must occur across all agents in the world
- Removal must only affect messages in the same chat session (same chatId)
- Track removal count per agent for reporting
- Use timestamp-based filtering for reliable ordering

**Success Criteria**:
- The edited message is removed from all agents
- All subsequent messages are removed from all agents
- Message count reflects total removed messages
- Only messages in the active chat are affected
- Messages in other chats are unaffected
- No orphaned or partial messages remain

### FR-5: Message Resubmission
**What**: After message removal completes, the edited message must be resubmitted to the world as a new message.

**Requirements**:
- Removal operation must complete successfully before resubmission
- Resubmission must use the SAME chatId as the original message
- Resubmission must generate a NEW messageId (server-assigned)
- Resubmission must be triggered automatically by the API endpoint after removal
- Resubmission must submit to the world (not directly to individual agents)
- Resubmission requires world session mode to be ON (currentChatId set)
- If session mode is OFF, return clear error: "Cannot resubmit: session mode is OFF"
- Message must go through normal world message routing (agents decide whether to respond)
- Resubmission must use the edited content, not the original content

**Success Criteria**:
- Removal completes before resubmission is triggered
- Resubmitted message appears in chat with new messageId
- Resubmitted message maintains chat context (same chatId)
- Session mode is verified before resubmission (error if OFF)
- Agents receive the edited message content through normal routing
- Agents generate new responses based on edited message
- New responses appear in chat interface incrementally
- Message flow matches normal chat behavior

### FR-6: Error Handling
**What**: The system must handle partial failures gracefully without rollback.

**Requirements**:
- Track which agents successfully updated and which failed
- Continue processing remaining agents even if some fail
- Report detailed error information per agent
- Persist error information for troubleshooting
- Allow manual retry of failed updates

**Success Criteria**:
- Failed agent updates are tracked with specific error messages
- Successful updates are not rolled back
- User sees which agents failed and why
- Retry mechanism available for failed agents

### FR-7: Race Condition Prevention
**What**: Edit operations must not conflict with ongoing agent processing.

**Requirements**:
- Detect when ANY agent in the world is processing messages (world.isProcessing flag)
- Block edit attempts while world.isProcessing flag is true
- Provide clear feedback when edit is blocked ("Agents are responding...")
- Automatically unblock when processing completes (flag set to false)
- Timeout after 30 seconds if processing flag stuck (with warning)

**Success Criteria**:
- No edits allowed during agent processing (world.isProcessing = true)
- User sees clear "processing" indicator with disabled edit button
- Edit becomes available after processing completes
- Timeout prevents indefinite blocking
- No data corruption from concurrent operations

### FR-8: User Feedback
**What**: Users must receive clear feedback during and after edit operations.

**Requirements**:
- Show confirmation dialog before removing messages: "This will remove X messages from Y agents. Continue?"
- For large-scale removals (>10 messages): Show enhanced warning with message list preview
- Display count of messages that will be removed (edited message + subsequent)
- Show progress indicator during removal operation: "Removing messages from X of Y agents..."
- Show immediate confirmation after removal: "Messages removed successfully"
- Show separate indicator during resubmission: "Resubmitting message to world..."
- Show agent responses appearing incrementally as they arrive
- Display success summary (agents processed, messages removed total)
- Display partial failure details with specific agent names and errors
- Provide retry option for failed agents

**Success Criteria**:
- User confirms removal before operation proceeds
- Confirmation shows accurate message count
- Enhanced warning displayed for large-scale removals
- Progress visible during multi-agent removal operation
- Removal completion confirmed before resubmission feedback
- Success message shows operation summary (X agents, Y messages removed)
- Error messages identify specific failed agents with actionable details
- Retry button available when failures occur

### FR-9: Data Persistence
**What**: Message removal and resubmission must persist across application restarts.

**Requirements**:
- Removed messages must be permanently deleted from disk storage
- Removed messages must not reappear after restart
- Resubmitted messages must save to disk storage
- Edit operations must complete before shutdown
- No data loss during removal operations

**Success Criteria**:
- Removed messages stay removed after server restart
- Resubmitted message visible after server restart with new messageId
- No partial removal states after restart (operation is atomic per agent)
- All agent files reflect final state (removed messages gone, new responses present)

## Non-Functional Requirements

### NFR-1: Performance
**What**: Message removal operations must complete in reasonable time. Agent response time is NOT included in these metrics.

**Requirements**:
- **Removal operation** with 10 agents: complete in < 500ms
- **Removal operation** with 50 agents: complete in < 2s with progress indicator
- **Resubmission** (sending to world): complete in < 100ms (synchronous operation)
- Agent response time is excluded from performance metrics (async, can take 30+ seconds)
- Edits with 50+ agents: show warning about operation time before proceeding
- No UI blocking during removal operations
- User sees immediate confirmation of removal, then responses arrive asynchronously

**Success Criteria**:
- Removal performance benchmarks met for specified agent counts
- Resubmission completes quickly (< 100ms)
- Progress indicator shows during longer removal operations
- User warned when removal operation may be slow (50+ agents)
- UI remains responsive throughout
- Agent responses appear incrementally without blocking UI

### NFR-2: Reliability
**What**: Edit operations must be reliable and predictable.

**Requirements**:
- Edit must succeed or fail atomically per agent
- No silent failures or data corruption
- All errors must be logged
- Failed operations must be retryable

**Success Criteria**:
- No partial agent updates without tracking
- All failures logged with details
- Error logs accessible for debugging
- Retry mechanism consistently works

### NFR-3: Data Integrity
**What**: Agent memories must remain consistent and valid.

**Requirements**:
- No orphaned messages after edit
- No duplicate messages after edit
- Message timestamps must be valid
- Chat ID references must be correct

**Success Criteria**:
- Agent memory validation passes after edit
- No dangling references or corrupted data
- All messages properly linked to chats
- Timestamp ordering maintained

### NFR-4: Usability
**What**: Edit feature must be intuitive and user-friendly.

**Requirements**:
- Edit button clearly visible and recognizable
- Edit interface easy to understand
- Confirmation dialogs clear and informative
- Error messages actionable and specific

**Success Criteria**:
- User can find and use edit without documentation
- Confirmation dialogs provide sufficient context
- Error messages guide user to resolution
- No confusion about edit behavior

## User Stories

### US-1: Correct Typo
**As a** user  
**I want to** edit a message to fix a typo  
**So that** the conversation makes sense and agents respond to the correct text  

**Acceptance Criteria**:
- User clicks edit button on message with typo
- User corrects the text
- User saves the edit
- Agents respond to the corrected message
- Original typo does not appear in any agent memory

### US-2: Refine Question
**As a** user  
**I want to** edit my question to be more specific  
**So that** I get better responses from agents  

**Acceptance Criteria**:
- User edits question to add more detail
- All previous responses to original question are removed
- Agents generate new responses based on refined question
- Conversation continues from refined question

### US-3: Explore Alternative Path
**As a** user  
**I want to** edit an earlier message to explore a different conversation direction  
**So that** I can see how agents would respond differently  

**Acceptance Criteria**:
- User edits message from middle of conversation
- All messages after edited message are removed
- Warning shows count of messages to be removed
- User confirms deletion
- Agents generate new responses from edited message forward

### US-4: Recover from Error
**As a** user  
**I want to** see which agents failed to update  
**So that** I can retry the failed updates  

**Acceptance Criteria**:
- Edit operation encounters failures
- UI shows which agents succeeded and which failed
- User sees specific error for each failed agent
- User clicks retry button
- Failed agents are updated successfully on retry

### US-5: Prevent Concurrent Edit
**As a** user  
**I want to** be prevented from editing while agents are responding  
**So that** I don't cause data conflicts or corruption  

**Acceptance Criteria**:
- User sends message
- Agents begin processing
- Edit button is disabled/shows processing state
- User sees clear indicator that processing is ongoing
- Edit button becomes available when processing completes

### US-6: Restart Conversation
**As a** user  
**I want to** edit the first message in a conversation  
**So that** I can restart the conversation with different context  

**Acceptance Criteria**:
- User clicks edit on first message in chat
- Warning clearly states: "This is the first message. Editing will restart the conversation."
- User confirms understanding that conversation context will be reset
- All messages removed including first message
- Resubmitted message becomes new conversation start
- Agents respond to resubmitted message as fresh conversation

## Constraints

### Technical Constraints
- Must work with existing file-based storage system
- Must integrate with current event-driven architecture
- Must maintain backward compatibility with existing message structure
- Must work within current frontend framework (AppRun)

### Business Constraints
- Feature must not break existing chat functionality
- Implementation must be completable in reasonable timeframe
- Must not require major architectural changes
- Testing must be comprehensive before release

### Operational Constraints
- Must work in single-user desktop application context
- Must handle up to 100 agents per world
- Must handle up to 1000 messages per chat
- Must work offline (no cloud dependencies)

## Assumptions

1. Users understand that editing messages removes subsequent responses
2. Users are running single-user instances (no multi-user conflicts)
3. File system has sufficient permissions for storage operations
4. Agent processing typically completes within reasonable time (< 30s)
5. Users will not attempt malicious operations
6. Disk space is sufficient for message storage
7. Most worlds have fewer than 50 agents

## Dependencies

### Internal Dependencies
- Agent storage system must support message updates
- Event system must support edit notifications
- Frontend must support edit UI components
- Message processing system must support resubmission

### External Dependencies
- File system access for storage operations
- No external API dependencies

## Success Metrics

### Functional Metrics
- 100% of user messages can be edited in active chat
- 100% of messages removed correctly (or failures tracked per agent)
- 100% of edited messages resubmitted successfully
- 0% data corruption incidents
- 0% removed messages reappearing after restart

### Performance Metrics
- 95% of edits complete within expected time
- < 2 seconds average edit time for 50 agents
- 0 UI blocking during edit operations

### User Experience Metrics
- 90% of users can complete edit without help
- < 5% user-reported edit failures
- 95% user satisfaction with edit feature

### Reliability Metrics
- 99% edit operation success rate
- 100% of failures properly logged
- 100% of failures retryable

## Risks

### High Priority Risks
1. **Data Inconsistency**: Partial failures leave agents in inconsistent state
   - Mitigation: Track all failures, provide retry mechanism
   
2. **Race Conditions**: Edit conflicts with agent processing
   - Mitigation: Lock messages during processing, block edits

3. **Data Loss**: Subsequent messages permanently deleted
   - Mitigation: Confirmation dialog, clear warning

### Medium Priority Risks
4. **Performance Issues**: Large worlds slow edit operations
   - Mitigation: Batch processing, progress indicators, warnings

5. **Migration Problems**: Existing messages fail to receive IDs
   - Mitigation: Graceful migration with error handling

### Low Priority Risks
6. **User Confusion**: Users don't understand edit behavior
   - Mitigation: Clear UI, confirmation dialogs, documentation

## Open Questions

1. Should there be a limit on how far back users can edit?
2. Should edit history be tracked for future undo feature?
3. Should there be a confirmation for edits with no subsequent messages?
4. How to handle very old messages in large conversations?
5. Should there be keyboard shortcuts for edit operations?

## Future Enhancements

### Phase 2 (Not Required for Initial Release)
- Soft delete with recovery capability
- Edit history and audit trail
- Undo/redo edit operations
- Visual diff showing what changed
- Message branching visualization
- Batch edit operations
- Edit templates or macros

### Phase 3 (Future Consideration)
- Multi-user edit conflict resolution
- Real-time collaboration on edits
- Edit permissions and access control
- Cloud sync for edit history
- Mobile app edit support

## Acceptance Criteria Summary

The message edit feature is considered complete when:

1. ✅ Users can edit any user message in active chat
2. ✅ All messages starting from edited message are removed (including edited message itself)
3. ✅ Removal operations track failures per agent (no rollback)
4. ✅ Edited messages are resubmitted successfully with new messageId
5. ✅ Resubmitted messages maintain chat context (same chatId)
6. ✅ Session mode is verified before resubmission
7. ✅ Race conditions are prevented (world.isProcessing flag)
8. ✅ Errors are handled gracefully with retry option
9. ✅ Performance meets benchmarks (removal only, excludes agent response time)
10. ✅ Changes persist across restarts (removals permanent, resubmissions saved)
11. ✅ Users receive clear feedback throughout (removal → resubmission → responses)
12. ✅ Large-scale removals (>10) require enhanced confirmation
13. ✅ First message edits show conversation restart warning
14. ✅ Test coverage exceeds 90%

## Approval

**Document Status**: Ready for Review  
**Next Steps**: Create implementation plan, obtain stakeholder approval  
**Target Release**: TBD
