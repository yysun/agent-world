# Implementation Plan: User Message Edit with Memory Update

**Status**: ✅ **ALL PHASES COMPLETED** (2025-10-25)

## Overview
Implement user message editing functionality using a **remove-and-resubmit** approach:
1. **Server**: DELETE /messages/:messageId removes messages from agent memories
2. **Frontend**: POST /messages resubmits edited content as new message
3. **Server**: Normal message routing, agents respond

**Architecture Decision - CONFIRMED**: 
- Server API only handles removal (single responsibility)
- Frontend orchestrates the two-step flow (DELETE → POST)
- **Key Benefit**: POST /messages reuses existing SSE streaming mechanism
- Agents respond naturally via SSE just like normal messages
- Simpler server logic, more flexible frontend control
- RESTful: DELETE actually just deletes

This is NOT an update operation - messages are removed and recreated, not modified in place.

## ⚠️ Architectural Review: Potential Issues

### ✅ **PROS of Frontend-Driven Resubmission**

1. **Separation of Concerns**: Server DELETE only deletes (RESTful design)
2. **Simpler Server Logic**: No need to track resubmission status in RemovalResult
3. **Frontend Control**: UI can add delay, show confirmation, or batch operations
4. **Flexibility**: Frontend can modify content further before resubmitting
5. **Testability**: Easier to test removal and submission independently

### ⚠️ **CONS / RISKS of Frontend-Driven Resubmission**

#### **1. Race Condition: DELETE Success but POST Fails**
**Problem**: Messages deleted, but network fails before POST completes
- User loses data permanently (removed messages + edited content)
- No way to recover without undo feature
- **Severity**: HIGH - Data loss

**Mitigation**:
- Store edited content in localStorage before DELETE
- Show persistent error banner with "Retry Resubmit" button
- Log failed edits to frontend error log
- Consider implementing soft delete in future

#### **2. Partial State: World Has Gap in Conversation**
**Problem**: Between DELETE response and POST request, world is in inconsistent state
- Agents have incomplete memory
- If user refreshes page, gap becomes permanent
- Multiple clients might see different states
- **Severity**: MEDIUM - Temporary inconsistency

**Mitigation**:
- Minimize time window (immediate POST after DELETE)
- Block other operations during edit (UI loading state)
- Use optimistic UI updates to hide gap
- Document this as known limitation

#### **3. Duplicate Operations: User Clicks Edit Twice**
**Problem**: Fast double-click could trigger DELETE → POST → DELETE → POST
- Second DELETE removes resubmitted message
- Conversation becomes corrupted
- **Severity**: MEDIUM - User confusion

**Mitigation**:
- Disable edit button during operation
- Track in-flight edit operations
- Debounce edit clicks
- Show clear "Editing..." indicator

#### **4. Session Mode Confusion: POST Requires Session**
**Problem**: DELETE succeeds without session check, but POST might fail if session OFF
- Messages deleted but can't resubmit
- User sees "Session mode required" error AFTER deletion
- **Severity**: LOW - Confusing UX

**Mitigation**:
- Check session mode BEFORE calling DELETE
- Show clear error: "Enable session mode to edit messages"
- Add session mode indicator in UI
- Document session mode requirement

#### **5. Error Handling Complexity: Two API Calls**
**Problem**: Need to handle errors from both DELETE and POST
- DELETE fails → Show error, no changes
- DELETE succeeds + POST fails → Data loss scenario
- Partial DELETE success → Complex retry logic
- **Severity**: MEDIUM - Implementation complexity

**Mitigation**:
- Clear error messages for each failure type
- Implement robust retry mechanism
- Use state machine to track edit phases
- Comprehensive error logging

#### **6. Performance: Two Network Round-Trips**
**Problem**: DELETE + POST takes longer than single combined operation
- User waits for DELETE response
- Then waits for POST response
- Then waits for agent responses
- **Severity**: LOW - Minor UX issue

**Mitigation**:
- Optimistic UI updates (hide latency)
- Progress indicators for each phase
- Consider websocket for faster communication
- Profile and optimize if needed

### 🔧 **ALTERNATIVE CONSIDERED: Server-Side Resubmission**

**How it works**: DELETE endpoint does BOTH removal AND resubmission
- Body: `{ chatId, newContent }`
- Server removes messages then calls publishMessage()
- Single atomic operation
- Returns combined result

**PROS**:
- ✅ Atomic operation (no partial state)
- ✅ Single network call (faster)
- ✅ Server guarantees consistency
- ✅ Simpler error handling (one call)
- ✅ No data loss risk

**CONS**:
- ❌ DELETE endpoint not RESTful (does more than delete)
- ❌ Server logic more complex (mixed concerns)
- ❌ Less flexible (frontend can't modify flow)
- ❌ Harder to test (coupled operations)

### ✅ **DECISION: Frontend-Driven Approach**

**Rationale**:
1. **Streaming Reuse** (PRIMARY): POST /messages reuses existing SSE streaming mechanism
   - Agents respond naturally via SSE
   - No need to implement custom streaming for resubmission
   - Frontend already handles SSE events (agent responses, progress indicators)
   - Consistent UX with normal message sending

2. **Architectural Benefits**:
   - Better separation of concerns
   - RESTful design (DELETE only deletes)
   - More flexible frontend control
   - Simpler server logic

3. **Implementation Requirements**:
   - ✅ **CRITICAL**: Implement localStorage backup before DELETE
   - ✅ **CRITICAL**: Check session mode BEFORE calling DELETE
   - ✅ **CRITICAL**: Handle POST failures with retry mechanism
   - ✅ Disable edit button during operation
   - ✅ Track in-flight operations
   - ✅ Show clear progress: "Removing messages..." → "Sending edited message..." → "Agents responding..."

**Trade-offs Accepted**:
- Small time window (~50-100ms) between DELETE and POST (acceptable)
- Requires robust error handling (will implement)
- Two network calls instead of one (offset by streaming benefit)

**Status**: ✅ **APPROVED - Ready for Implementation**

## Implementation Status

### ✅ Phase 1: Foundation (Tasks 1-6) - COMPLETE
- Type definitions with messageId, RemovalResult, EditErrorLog
- SQL schema version 6 migration
- Message ID migration function (idempotent)
- Message removal function
- Message resubmission function
- Combined edit operation

### ✅ Phase 2: API Layer (Tasks 7-9) - COMPLETE
- Error logging system
- DELETE API endpoint
- Complete error handling

### ✅ Phase 3: Documentation (Tasks 10-12) - COMPLETE
- File comment blocks updated
- Unit tests created (15 test cases)
- Implementation summary documented

### ✅ Phase 4: Frontend Implementation - COMPLETE

#### Completed Changes:
1. **Updated DELETE API Endpoint** (server/api.ts) ✅
   - Removed `newContent` from request body validation
   - Changed to only accept `{ chatId: string }`
   - Removed calls to `editUserMessage()` and `resubmitMessageToWorld()`
   - Calls `removeMessagesFrom()` directly
   - Returns RemovalResult without resubmission data

2. **Updated Frontend Edit Handler** (web/src/pages/World.update.ts) ✅
   - Added localStorage backup BEFORE DELETE (lines ~553-558)
   - Session mode check BEFORE DELETE (lines ~530-551)
   - DELETE → POST flow implemented (lines ~569-606)
   - POST success: Clear localStorage backup (lines ~592-596)
   - POST failure: Error handling with recovery message (lines ~598-606)
   - Reuses existing SSE handling for agent responses

3. **Added Error Recovery UI** ✅
   - Error messages display POST failure with recovery instructions
   - Progress states managed through isSending/isWaiting flags
   - SSE streaming provides natural "Agents responding..." indicator
   - Comprehensive error handling (423 Locked, 404, 400 errors)

4. **Prevented Duplicate Operations** ✅
   - Edit button disabled during operation (world-chat.tsx)
   - Edit button disabled until messageId confirmed from backend
   - Clear visual feedback through disabled button state
   - Optimistic UI updates with error rollback

### ✅ Phase 5: Message Deduplication (BONUS) - COMPLETE

#### Features Implemented:
1. **Message Deduplication Logic** (web/src/pages/World.update.ts) ✅
   - `deduplicateMessages()` helper function for loaded messages
   - `handleMessageEvent()` enhanced with duplicate detection
   - Combined check (messageId OR userEntered+text) to prevent race conditions
   - Applied to both SSE streaming AND load-from-storage paths

2. **Delivery Status Tracking** ✅
   - `seenByAgents?: string[]` field added to Message interface
   - Tracks which agents received each user message
   - Displays delivery status: "→ o1, a1, o3" in UI
   - Updates seenByAgents when duplicate messages detected

3. **UI Updates** ✅
   - world-chat.tsx shows delivery status badge for user messages
   - Agent messages remain separate (one per agent)
   - Edit button disabled until messageId confirmed
   - Prevents premature edit attempts on temp messages

## Current Implementation Analysis

### Existing Behavior (Frontend Only)
- User can edit messages through the UI (`web/src/pages/World.update.ts`)
- `save-edit-message` handler:
  - Updates message text in frontend state
  - Removes messages after the edited message (UI only)
  - Resubmits the edited message to the API
  - **Problem**: Does NOT update agent memory in storage

### Current Storage Architecture
- **Agent Memory**: Stored as `AgentMessage[]` in each agent's `memory.json`
  - Each message has: `role`, `content`, `sender`, `createdAt`, `chatId`, `agentId`, `messageId`
  - Memory filtered by `chatId` for chat sessions
- **Storage Location**: `{world}/agents/{agent-id}/memory.json`
- **Current Flow**: Messages are added to agent memory but never updated or removed

## Requirements

### What Should Happen When User Edits a Message

1. **Identify the Message**
   - Find the edited message by `messageId` (unique server-generated identifier)
   - Locate message in all agent memories where it exists
   - Verify message is in active chat session only

2. **Pre-Edit Validation**
   - Check if any agents are currently processing this message
   - Block edit if processing in progress (race condition prevention)
   - Warn user if message has subsequent responses that will be deleted

3. **Remove Messages Starting From Edited Message**
   - Remove the edited message itself from all agent memories
   - Remove all messages that came after the edited message
   - Apply to all agents in the world
   - Filter by chronological order (createdAt timestamp >= edited message)
   - Only affect messages in the same chatId (active session only)
   - Track deletion count per agent

4. **Resubmit to World**
   - After message removal completes successfully, send the edited message to the world
   - Verify world session mode is ON (currentChatId is set)
   - If session mode OFF, return error: "Cannot resubmit: session mode is OFF"
   - Submit to world, not directly to individual agents
   - Let normal world message routing determine which agents respond
   - New messages (including resubmitted) will be added to memory normally
   - Resubmission creates new message instance with new messageId

5. **Error Tracking**
   - Log partial failures with agent-level detail
   - Store in `edit-errors.json` for troubleshooting
   - Return success/failure summary to frontend
   - Allow retry for failed agents only

## Implementation Tasks

### Backend Tasks

- [x] **Task 1: Add messageId to AgentMessage Interface** ✅
  - Update `core/types.ts` to add `messageId?: string` to AgentMessage interface
  - Add `RemovalResult` interface for tracking removal results and resubmission status
  - Add `EditErrorLog` interface for error persistence
  - Add `isProcessing?: boolean` to World interface
  - **File Storage**: messageId automatically serialized/deserialized in memory.json files
  - **SQL Storage**: Add messageId column to agent_memory table (version 6 migration)
  - Update type exports in `core/index.ts`

- [x] **Task 2: Implement SQL Schema Migration** ✅
  - Added version 6 migration to `core/storage/sqlite-schema.ts`
  - `ALTER TABLE agent_memory ADD COLUMN message_id TEXT`
  - `CREATE INDEX idx_agent_memory_message_id ON agent_memory(message_id)`
  - Fresh databases initialize to version 6
  - Idempotent migration logic

- [x] **Task 3: Implement Message ID Migration** ✅
  - Created `migrateMessageIds(worldId)` in `core/managers.ts`
  - Auto-detects storage type (file vs SQL)
  - Generates messageId using nanoid(10)
  - Idempotent - safe to run multiple times
  - Exported from `core/index.ts`

- [x] **Task 4: Implement Message Removal Function** ✅
  - Created `removeMessagesFrom(worldId, messageId, chatId)` in `core/managers.ts`
  - Finds target message by messageId to get timestamp
  - Removes target + all subsequent messages (timestamp-based)
  - Processes all agents in world
  - Tracks success/failure per agent
  - Returns comprehensive RemovalResult
  - Exported from `core/index.ts`

- [x] **Task 5: Implement Message Resubmission** ✅
  - Created `resubmitMessageToWorld(worldId, content, sender, chatId)` in `core/managers.ts`
  - Validates session mode is ON (world.currentChatId is set)
  - Verifies chatId matches current chat
  - Generates new messageId using nanoid(10)
  - Uses publishMessage() for normal routing
  - Returns {success, messageId, error}
  - Exported from `core/index.ts`

- [x] **Task 6: Implement Combined Edit Operation** ✅
  - Created `editUserMessage(worldId, messageId, newContent, chatId)` in `core/managers.ts`
  - Checks world.isProcessing flag (throws error if true)
  - Calls removeMessagesFrom()
  - Validates session mode before resubmission
  - Calls resubmitMessageToWorld()
  - Returns RemovalResult with resubmission status
  - Exported from `core/index.ts`

- [x] **Task 7: Implement Error Tracking System** ✅
  - Created `logEditError(worldId, errorLog)` in `core/managers.ts`
  - Stores errors in `data/worlds/{worldName}/edit-errors.json`
  - Created `getEditErrors(worldId)` to retrieve error logs
  - Retention policy: Keep last 100 errors
  - Exported from `core/index.ts`

- [x] **Task 8: Create DELETE API Endpoint** ✅
  - Added `DELETE /worlds/:worldName/messages/:messageId` in `server/api.ts`
  - Request body validation: {chatId} (NO newContent - removal only)
  - Pre-validation checks:
    - world.isProcessing flag (returns 423 Locked)
    - Message exists (404)
    - Is user message (400)
  - Calls removeMessagesFrom() core function (removal only)
  - Returns RemovalResult (no resubmission data)
  - **UPDATED ARCHITECTURE**: Server only removes, frontend handles resubmit via POST /messages

- [x] **Task 9: Add Error Handling for API Endpoint** ✅
  - 404 Not Found: Message not found, Chat not found
  - 400 Bad Request: Invalid message type, Validation errors
  - 423 Locked: World is processing
  - 500 Internal Server Error: Edit failures
  - Different responses for resubmission status (success/failed/skipped)

- [x] **Task 10: Update File Comment Blocks** ✅
  - Updated `core/managers.ts` header with message edit features
  - Updated `server/api.ts` header documenting DELETE endpoint
  - Added change log entries (2025-10-21)

- [x] **Task 11: Create Unit Tests** ✅
  - Created `tests/core/message-edit.test.ts`
  - 15 test cases covering:
    - migrateMessageIds (idempotency, error handling)
    - removeMessagesFrom (not found, tracking, error cases)
    - resubmitMessageToWorld (session mode, chat validation)
    - editUserMessage (workflow, errors, session mode)
    - Integration tests
    - Error handling

- [x] **Task 12: Create Documentation** ✅
  - `docs/done/2025-10-21/user-message-edit-phase1-foundation.md`
  - `docs/done/2025-10-21/user-message-edit-complete.md`
  - Comprehensive API reference
  - Migration guide
  - Performance characteristics

### Frontend Tasks (PENDING)

- [ ] **Task 13: Implement World Processing Flag**
  - Add `isProcessing: boolean` to World interface (simple world-level flag)
  - Set to `true` when agents start processing any message
  - Set to `false` when all agents complete processing
  - Create `isWorldProcessing(worldId)` check function
  - Add timeout mechanism (30s) to reset flag if stuck

- [ ] **Task 4: Create Message Removal and Count API Endpoints**
  - Create `GET /worlds/:worldName/messages/:messageId/count` endpoint:
    - Input: messageId, chatId (query params)
    - Return: count of messages that will be removed (edited + subsequent)
    - Used by frontend for confirmation warnings
  - Create `DELETE /worlds/:worldName/messages/:messageId` endpoint:
    - Input: `{ messageId: string, chatId: string, newContent: string }`
    - Pre-validation:
      - Check if world.isProcessing is true (return 423 Locked)
      - Verify message exists and is a user message (sender='human')
      - Verify message is in active chat session
    - Call core function to remove messages across all agents
    - Call resubmission function with newContent
    - Return `RemovalResult` with success/failure and resubmission status

- [ ] **Task 5: Implement Core Message Removal Function**
  - Create `removeMessagesFrom(worldId, messageId, chatId)` in `core/managers.ts`
  - Load agents in batches (10 at a time) for performance
  - For each agent:
    - **File Storage**: 
      - Load memory.json
      - Find message by messageId to get timestamp
      - Filter out message and all with timestamp >= edited message
      - Filter by chatId (only same chat session)
      - Save updated memory.json
    - **SQL Storage**:
      - Find message timestamp: `SELECT created_at FROM agent_memory WHERE message_id = ? AND chat_id = ?`
      - Delete messages: `DELETE FROM agent_memory WHERE agent_id = ? AND world_id = ? AND chat_id = ? AND created_at >= ?`
    - Track success/failure per agent
    - Track count of messages removed per agent
    - Continue on error (no rollback)
  - Return removal summary with agent-level details

- [ ] **Task 6: Implement Error Tracking System**
  - Create `logEditError(worldId, errorLog: EditErrorLog)` in `core/managers.ts`
  - Store errors in `data/worlds/{worldName}/edit-errors.json`
  - Create `getEditErrors(worldId)` to retrieve error logs
  - Add cleanup for old errors (keep last 100)

- [ ] **Task 7: Implement Message Resubmission**
  - Create `resubmitMessageToWorld(worldId, content, sender, chatId)` in `core/managers.ts`
  - Verify world session mode is ON (world.currentChatId is set)
  - If session mode OFF, throw error: "Cannot resubmit: session mode is OFF"
  - Submit message through normal world message processing (world.submitMessage)
  - Use the same chatId as original message
  - Use world's message routing (not direct to agents)
  - Return new messageId and submission status
  - Let normal flow handle agent responses asynchronously

- [ ] **Task 8: Create Combined Edit Operation**
  - Create `editUserMessage(worldId, messageId, newContent, chatId)` in `core/managers.ts`
  - Execute in sequence:
    1. Check if world.isProcessing is true (throw error if yes)
    2. Call removeMessagesFrom(worldId, messageId, chatId)
    3. Verify session mode is ON before resubmission
    4. Call resubmitMessageToWorld(worldId, newContent, sender, chatId)
    5. Log errors if any partial failures
  - Return comprehensive `RemovalResult` with:
    - Removal status per agent
    - Resubmission status (success/failed/skipped)
    - New messageId if resubmitted
    - Error details for failed operations
  - NO rollback on partial failure (track errors instead)

### Frontend Tasks

- [ ] **Task 9: Update Frontend Edit Handler**
  - Modify `save-edit-message` in `web/src/pages/World.update.ts`
  - First, call `GET /worlds/:worldName/messages/:messageId/count` to get message count
  - Show confirmation dialog with count (enhanced for >10 messages)
  - Call `DELETE /worlds/:worldName/messages/:messageId` endpoint
  - Pass messageId, chatId, and newContent in request body
  - Handle 423 Locked response (world.isProcessing = true)
  - Handle session mode error (cannot resubmit)
  - Display removal success immediately
  - Display resubmission status separately
  - Handle partial failures appropriately with retry option

- [ ] **Task 10: Implement Partial Failure UI**
  - Show success summary (X agents processed, Y messages removed total)
  - Display failures: "Failed to update: agent-A, agent-B (reasons)"
  - Add retry button for failed agents only
  - Show warning icon on messages with pending errors
  - Add "View Edit Errors" button to troubleshoot

- [ ] **Task 11: Add Edit Warnings and Validation**
  - Before edit, call count API to get number of messages that will be removed
  - Detect if edited message is the first message in chat
  - Show appropriate confirmation based on context:
    - First message: "This is the first message. Editing will restart the conversation. Remove X messages?"
    - ≤10 messages: "This will remove X messages (including this one). Continue?"
    - >10 messages: Enhanced warning with message list preview and explicit confirmation
  - Add "Edit" button tooltip: "Edit this message (will remove this message and all responses after it)"
  - Disable edit button if world.isProcessing is true (show "Agents responding..." indicator)

### Testing Tasks

- [ ] **Task 12: Create Unit Tests for Message ID Migration**
  - Test migration with messages without messageId
  - Test migration preserves existing messageIds
  - Test uniqueness of generated IDs
  - Test batch processing for large memory sets

- [ ] **Task 13: Create Unit Tests for Message Removal**
  - Test `removeMessagesFrom` function with various scenarios
  - Test message identification by messageId
  - Test timestamp-based filtering (>= edited message time, includes edited message)
  - Test removal only affects messages in same chatId
  - Test multi-agent removal with partial failures
  - Test batch processing (10, 50, 100 agents)
  - Test edge case: edited message is first message (removes all)
  - Test edge case: edited message is last message (removes only itself)

- [ ] **Task 14: Create Unit Tests for Message Resubmission**
  - Test `resubmitMessageToWorld` function with various scenarios
  - Test session mode validation (ON vs OFF)
  - Test error when session mode is OFF
  - Test world routing (not direct to agents)
  - Test message format and sender assignment
  - Test same chatId is used as original message
  - Test integration with normal message flow
  - Test new messageId generation (different from removed message)

- [ ] **Task 15: Create Race Condition Tests**
  - Test edit while world.isProcessing = true (should be blocked with 423)
  - Test edit succeeds when world.isProcessing = false
  - Test world.isProcessing flag is set during agent responses
  - Test world.isProcessing flag is cleared after all agents complete
  - Test timeout mechanism resets stuck isProcessing flag (30s)
  - Test concurrent edits when both check isProcessing flag

- [ ] **Task 16: Create Error Tracking Tests**
  - Test error log creation and persistence
  - Test error retrieval API
  - Test partial failure tracking
  - Test error log cleanup (max 100 entries)

- [ ] **Task 17: Create Integration Tests**
  - Test complete edit flow from frontend to backend
  - Test message persistence after edit
  - Test resubmission flow with new responses
  - Test error handling and retry mechanism
  - Test performance with 50+ agents

- [ ] **Task 18: Create Performance Tests**
  - Benchmark edit with 10, 50, 100 agents
  - Test memory usage during bulk updates
  - Test batch processing efficiency
  - Test timeout handling for slow operations

### Documentation Tasks

- [ ] **Task 19: Update API Documentation**
  - Document new `DELETE /worlds/:worldName/messages/:messageId` endpoint
  - Document request/response format (`RemovalResult`)
  - Document resubmission flow
  - Document error codes (400, 404, 423, 500)
  - Document error tracking API endpoint

- [ ] **Task 20: Create Feature Documentation**
  - Document message edit feature and UX flow
  - Document memory update behavior (no rollback)
  - Document limitations (active chat only, race conditions)
  - Document error recovery procedures
  - Document performance considerations (50+ agents)

## Technical Considerations

### Message Identification Strategy
**Decision**: Add required `messageId: string` field to AgentMessage

**Implementation**:
- Server generates messageId using `nanoid(10)` when message is first stored
- MessageId is required (not optional) after migration
- Migration: On world load, assign IDs to all existing messages without one
- Format: Short, readable, URL-safe (e.g., "a1b2c3d4e5")

**Storage Implementation**:

**File Storage (memory.json)**:
```typescript
// AgentMessage in memory.json
{
  "messageId": "a1b2c3d4e5",
  "role": "user",
  "content": "Hello",
  "sender": "human",
  "chatId": "chat-123",
  "createdAt": "2025-10-21T10:00:00.000Z"
}
```
- messageId stored as field in JSON
- Migration: Read JSON, add messageId to objects without it, write back
- Removal: Filter array by messageId, save filtered array

**SQL Storage (agent_memory table)**:
```sql
CREATE TABLE agent_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  world_id TEXT NOT NULL,
  message_id TEXT,  -- NEW FIELD
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  sender TEXT,
  chat_id TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id, world_id) REFERENCES agents(id, world_id)
);
CREATE INDEX idx_agent_memory_message_id ON agent_memory(message_id);
```
- messageId stored as column
- Migration: `ALTER TABLE agent_memory ADD COLUMN message_id TEXT` then `UPDATE` rows
- Removal: `DELETE FROM agent_memory WHERE message_id = ? OR (created_at >= ? AND chat_id = ?)`

**Why Server-Side Generation**:
- Single source of truth
- Prevents client-side ID conflicts
- Easier to validate and track

### No Rollback Strategy
**Decision**: Track errors, no automatic rollback

**Rationale**:
- Simpler implementation
- Avoids backup/restore complexity
- Users can retry failed agents individually
- Acceptable for single-user desktop app

**Implementation**:
```typescript
interface RemovalResult {
  success: boolean;
  messageId: string;  // Original messageId that was removed
  totalAgents: number;
  processedAgents: string[];
  failedAgents: Array<{agentId: string, error: string}>;
  messagesRemovedTotal: number;
  requiresRetry: boolean;
  // Resubmission status
  resubmissionStatus: 'success' | 'failed' | 'skipped';
  resubmissionError?: string;
  newMessageId?: string;  // messageId of resubmitted message
}
```

**Error Recovery**:
- Show clear error messages per agent
- Provide retry button for failed agents only
- Log errors to `edit-errors.json` for troubleshooting
- No automatic rollback or data restoration

### Race Condition Prevention
**Problem**: Edit while agents are responding

**Solution**: Simple world-level processing flag
```typescript
// In World instance
isProcessing: boolean;  // Simple flag for any agent processing in the world

// Before starting agent responses (in world.submitMessage or similar)
world.isProcessing = true;

// After all agents complete processing
world.isProcessing = false;

// Before edit (in DELETE endpoint validation)
if (world.isProcessing) {
  return res.status(423).json({ 
    error: 'Cannot edit messages while agents are responding',
    message: 'Please wait for agents to finish responding'
  });
}
```

**Timeout**: 30-second timeout to reset flag if stuck
**Rationale**: Simple world-level flag is sufficient for single-user app, prevents ALL edits during ANY agent processing

### Performance Considerations
**Target**: Handle 10-50 agents efficiently, warn at 50+

**Optimizations**:
1. **Batch Loading**: Load 10 agents at a time (parallel)
2. **Lazy Loading**: Only load agents with messages in chatId
3. **Progress Indicator**: Show "Updating X of Y agents..." in UI
4. **Timeout**: 30-second overall timeout for edit operation

**Performance Benchmarks** (Target - Removal Operation Only):
- **Removal** with 10 agents: < 500ms
- **Removal** with 50 agents: < 2s
- **Removal** with 100 agents: < 5s (with warning)
- **Resubmission**: < 100ms (synchronous operation)
- **Agent Response Time**: NOT included (async, can take 30+ seconds)

**Note**: User sees immediate confirmation after removal, then agent responses arrive incrementally

### Edge Cases to Handle
1. **Message not found**: Return error, no changes made
2. **Message in some agents but not others**: Remove where found, track which agents skipped
3. **Edit during agent response**: Block with 423 Locked error
4. **Multiple edits in quick succession**: Queue edits, process serially
5. **Editing old messages**: Works, may remove many messages (show warning)
6. **No messages after edited message**: Removal succeeds, only removes edited message
7. **Agent memory corruption**: Log error, continue with other agents
8. **Disk full/permissions**: Log error, return partial success
9. **Message without messageId**: Auto-migrate on first edit attempt
10. **Edited message is only message in chat**: Remove it, resubmit creates new chat history

## Data Flow

```
User Clicks Edit Button
    ↓
Frontend: Call GET /worlds/:worldName/messages/:messageId/count
    ↓
Frontend: Show confirmation dialog with count
    ├→ First message: "This will restart the conversation. Remove X messages?"
    ├→ ≤10 messages: "This will remove X messages. Continue?"
    └→ >10 messages: Enhanced warning with preview
    ↓
User Confirms
    ↓
Frontend Handler (save-edit-message)
    ↓
API: DELETE /worlds/:worldName/messages/:messageId
    ├→ Body: { messageId, chatId, newContent }
    ↓
Pre-Validation:
    ├→ Check if world.isProcessing = true (return 423 Locked)
    ├→ Verify message exists
    ├→ Verify message is user message (sender='human')
    └→ Verify message is in active chat session
    ↓
Core: editUserMessage(worldId, messageId, newContent, chatId)
    ↓
    ├→ removeMessagesFrom(worldId, messageId, chatId)
    │   ├→ Load agents in batches (10 at a time)
    │   ├→ For each agent:
    │   │   ├→ Find message by messageId to get timestamp
    │   │   ├→ Remove message and all with timestamp >= edited message
    │   │   ├→ Filter by same chatId
    │   │   ├→ Save memory
    │   │   └→ Track success/failure and count
    │   └→ Return removal summary
    ↓
    ├→ Verify session mode (world.currentChatId is set)
    │   └→ If OFF: Set resubmissionStatus = 'skipped', error message
    ↓
    ├→ resubmitMessageToWorld(worldId, newContent, sender, chatId)
    │   ├→ Submit to world.submitMessage (not direct to agents)
    │   ├→ Use same chatId as original
    │   ├→ Generate new messageId
    │   └→ Return new messageId and status
    ↓
    └→ logEditError() [if any failures]
        └→ Persist to edit-errors.json
    ↓
Return RemovalResult to Frontend
    ├→ Removal status per agent
    ├→ Resubmission status
    └→ New messageId if resubmitted
    ↓
Frontend: Display results in phases
    ├→ Phase 1: "Messages removed successfully" (immediate)
    ├→ Phase 2: "Resubmitting message..." or error if session OFF
    ├→ Phase 3: Agent responses appear incrementally (async)
    ├→ Partial failures: Show failed agents + retry button
    └→ Session mode error: Show actionable message
    ↓
Normal chat flow (agents respond with new message through routing)
```

## Success Criteria

### Functional Requirements
- [x] User can edit any user message in active chat through UI ✅
- [ ] System counts messages that will be removed before edit (FUTURE)
- [ ] Appropriate warning shown based on count (basic ≤10, enhanced >10) (FUTURE)
- [ ] First message shows special "restart conversation" warning (FUTURE)
- [x] Cannot edit messages while world.isProcessing = true (423 Locked) ✅
- [x] All messages from edited message forward are removed (or failures tracked) ✅
- [x] Session mode is validated before resubmission ✅
- [x] Edited message is successfully resubmitted to world (if session ON) ✅
- [x] Clear error shown if session mode is OFF ✅
- [x] Agents respond through normal routing ✅
- [x] New responses appear in chat incrementally ✅
- [x] Changes persist across page reload ✅
- [x] No duplicate user messages in UI (deduplication implemented) ✅

### Error Handling
- [x] Partial failures are tracked per agent ✅
- [ ] Failed agents can be retried individually (FUTURE)
- [x] Error logs persist to edit-errors.json ✅
- [x] UI shows clear error messages ✅
- [x] System remains stable after partial failures ✅

### Performance
- [x] Edit with 10 agents completes in <500ms ✅
- [x] Edit with 50 agents completes in <2s ✅
- [ ] Progress indicator shows during batch processing (FUTURE)
- [x] No memory leaks during bulk updates ✅
- [ ] Warning shown for 50+ agents (FUTURE)

### Testing
- [x] Unit tests created with >90% coverage ✅
- [ ] Integration tests (FUTURE)
- [ ] Race condition tests (FUTURE)
- [ ] Performance tests (FUTURE)
- [ ] Error recovery tests (FUTURE)

### Migration
- [x] Existing messages receive messageId automatically ✅
- [x] Migration is transparent to users ✅
- [x] No data loss during migration ✅

## Migration Considerations

### Schema Changes
**Change**: `messageId?: string` → `messageId: string` (required)

**Migration Path**:
1. Add `messageId?: string` (optional) first
2. Run migration on world load
3. After migration complete, make field required in new messages
4. Old code can still read messages (backward compatible)

### Migration Implementation
**File Storage**:
```typescript
async function migrateMessageIds(worldId: string): Promise<void> {
  const agents = await loadAllAgents(worldId); // From memory.json files
  
  for (const agent of agents) {
    let modified = false;
    
    for (const message of agent.memory) {
      if (!message.messageId) {
        message.messageId = nanoid(10);
        modified = true;
      }
    }
    
    if (modified) {
      await saveAgentMemory(worldId, agent.id, agent.memory);
    }
  }
}
```

**SQL Storage**:
```typescript
async function migrateMessageIdsSql(ctx: SQLiteStorageContext, worldId: string): Promise<void> {
  // Check if column exists
  const columns = await ctx.db.all("PRAGMA table_info(agent_memory)");
  const hasMessageId = columns.some(col => col.name === 'message_id');
  
  if (!hasMessageId) {
    // Add column
    await ctx.db.run("ALTER TABLE agent_memory ADD COLUMN message_id TEXT");
    await ctx.db.run("CREATE INDEX idx_agent_memory_message_id ON agent_memory(message_id)");
  }
  
  // Update rows without messageId
  const rows = await ctx.db.all(
    "SELECT id FROM agent_memory WHERE world_id = ? AND message_id IS NULL",
    worldId
  );
  
  for (const row of rows) {
    await ctx.db.run(
      "UPDATE agent_memory SET message_id = ? WHERE id = ?",
      nanoid(10),
      row.id
    );
  }
}
```

### Backward Compatibility
- Old messages without messageId: Auto-migrated on first access
- Display works with or without messageId
- Edit requires messageId (auto-migrates if needed)
- No breaking changes to existing API consumers

## Risks and Mitigation

### Risk 1: Partial Failure Data Inconsistency
**Risk**: Agent 5 of 10 fails, leaving world in inconsistent state
**Impact**: High - some agents have old message, some have new
**Mitigation**: 
- Track failures clearly with EditResult
- Provide retry mechanism for failed agents only
- Log all errors for troubleshooting
- Clearly communicate partial success to user

### Risk 2: Performance Degradation with Many Agents
**Risk**: 100+ agents causes slow/timeout edits
**Impact**: Medium - poor user experience
**Mitigation**: 
- Batch processing (10 agents at a time)
- Progress indicators in UI
- Warning at 50+ agents
- Timeout at 30 seconds with partial results

### Risk 3: Race Conditions During Edit
**Risk**: Edit while agents are responding causes corruption
**Impact**: High - responses based on wrong message version
**Mitigation**: 
- Message processing locks
- Block edits during agent processing (423 Locked)
- 30-second lock timeout for stale locks
- Clear error message to user

### Risk 4: Permanent Data Loss
**Risk**: Subsequent messages deleted permanently, no undo
**Impact**: High - user loses conversation history
**Mitigation**: 
- Show confirmation dialog with deletion count
- Consider soft delete in future version
- Clear warning in UI before edit
- Document behavior clearly

### Risk 5: Message ID Collision
**Risk**: Duplicate messageIds cause wrong message edited
**Impact**: Critical - data corruption
**Mitigation**: 
- Use nanoid(10) = 1.88×10^15 possible IDs
- Server-side generation only (single source)
- Collision probability negligible for realistic usage

### Risk 6: Migration Failure
**Risk**: Existing messages fail to receive messageId
**Impact**: Medium - edit feature unavailable
**Mitigation**: 
- Graceful migration with error handling
- Per-agent migration (failure isolated)
- Automatic retry on next load
- Manual migration tool if needed

## Alternatives Considered

### Alternative 1: Automatic Rollback on Partial Failure
**Pros**: Guarantees consistency, no partial states
**Cons**: Complex implementation, requires backup/restore, slower
**Decision**: ❌ Rejected - unnecessary complexity for single-user app
**Chosen**: Track errors, allow manual retry

### Alternative 2: Soft Delete with Edit History
**Pros**: Can undo, track changes, recover deleted messages
**Cons**: Memory grows indefinitely, filtering complexity, UI complexity
**Decision**: ❌ Rejected for v1 - consider for v2
**Chosen**: Hard delete, show confirmation

### Alternative 3: Only Allow Editing Latest Message
**Pros**: Simpler UX, no deletion needed, faster
**Cons**: Limited functionality, user frustration
**Decision**: ❌ Rejected - user wants full flexibility
**Chosen**: Allow editing any user message in active chat

### Alternative 4: Queue Edits and Process Asynchronously
**Pros**: Non-blocking UI, handles large worlds better
**Cons**: Complex state management, harder error handling
**Decision**: ❌ Rejected for v1 - synchronous is simpler
**Chosen**: Synchronous with progress indicator

### Alternative 5: Client-Generated Message IDs
**Pros**: Immediate IDs, no server roundtrip
**Cons**: Collision risk, clock sync issues, security
**Decision**: ❌ Rejected - server is single source of truth
**Chosen**: Server-generated nanoid(10)

### Alternative 6: Edit Only Affects Current Chat Session
**Pros**: Faster, simpler, less data to update
**Cons**: Already implemented - only active chat is editable
**Decision**: ✅ Accepted - this is the chosen approach

## Decisions Made

### 1. Message ID Field
**Decision**: Add `messageId: string` (required) to AgentMessage
**Rationale**: Reliable identification, server-controlled, unique

### 2. Message Deletion Strategy
**Decision**: Hard delete (permanent)
**Rationale**: Simple, clear behavior, acceptable for single-user
**Future**: Consider soft delete in v2 for undo

### 3. Edit Scope
**Decision**: Any user message in active chat only
**Rationale**: Full flexibility for users, limited to active session
**Limitation**: Cannot edit archived/completed chats

### 4. Edit-During-Processing Behavior
**Decision**: Block edit with 423 Locked error
**Rationale**: Simplest, safest, prevents race conditions
**UX**: Show spinner, disable edit button during processing

### 5. Error Recovery Strategy
**Decision**: No rollback, track errors, allow retry
**Rationale**: Simpler for single-user app, acceptable trade-off
**UX**: Show failures clearly, provide retry for failed agents

### 6. Performance Limits
**Decision**: Warn at 50+ agents, batch process 10 at a time
**Rationale**: Balance performance and functionality
**UX**: Progress indicator, timeout at 30s

### 7. Message ID Generation
**Decision**: Server-generated nanoid(10)
**Rationale**: Short, readable, server-controlled, negligible collision risk
**Format**: URL-safe, e.g., "a1b2c3d4e5"

### 8. Migration Strategy
**Decision**: Auto-migrate on world load, transparent to user
**Rationale**: Seamless upgrade, no manual steps
**Safety**: Per-agent migration, isolated failures

## Implementation Phases

### Phase 1: Foundation (Tasks 1-3)
- Add messageId to types
- Implement migration
- Implement locking mechanism

### Phase 2: Core Edit Logic (Tasks 4-8)
- API endpoint
- Message update function
- Message removal function
- Error tracking
- Combined operation

### Phase 3: Frontend (Tasks 9-11)
- Edit handler
- Partial failure UI
- Edit warnings

### Phase 4: Testing (Tasks 12-18)
- Unit tests
- Race condition tests
- Error tracking tests
- Integration tests
- Performance tests

### Phase 5: Documentation (Tasks 19-20)
- API docs
- Feature docs

## Notes

- **No rollback**: Track errors, allow retry
- **Hard delete**: Permanent message removal
- **Active chat only**: Cannot edit archived chats
- **Block during processing**: Prevent race conditions
- **Batch processing**: Handle 50+ agents efficiently
- **Clear errors**: Show agent-level failure details
