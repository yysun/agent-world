# Architecture Plan: Message Threading with replyToMessageId

**Date:** 2025-10-25  
**Feature:** Add message threading support to track reply relationships  
**Status:** 📋 Planning Phase - **REVISED after Architecture Review**

---

## Overview

Implement `replyToMessageId` field to create explicit message threading relationships. This enables accurate detection of which messages are replies vs. memory-only incoming messages, supporting features like conversation threading, reply tracking, and analytics.

### Goals
- ✅ Accurate reply detection (no timestamp heuristics)
- ✅ Backward compatible (existing data continues to work)
- ✅ Progressive enhancement (new messages get threading)
- ✅ Foundation for threading UI and analytics
- ✅ **Runtime validation to prevent circular references**
- ✅ **Clear threading semantics for multi-agent scenarios**

---

## Architecture Review Summary

**Status:** ✅ Approved with mandatory revisions  
**Review Date:** 2025-10-25

**Critical Issues Fixed:**
1. 🔴 **Circular reference logic** in Section 3.1 (incoming messages should NOT set replyToMessageId)
2. 🔴 **Message ID validation** - added runtime checks and contract documentation
3. ⚠️ **Type safety** - added validation helpers and clear JSDoc

**Key Changes:**
- Corrected threading semantics: Only assistant/response messages set replyToMessageId
- Added validation helpers to prevent circular references and orphaned threads
- Enhanced JSDoc with clear examples and threading rules
- Added edge case tests for circular refs, orphans, and multi-level threading
- Added minimal visual thread indicator for Phase 1

**Timeline Revised:** 11-17 hours (was 9-14 hours)

---

## Architecture Components

### 1. Type System Changes

#### 1.1 Core Type Definition (`core/types.ts`)
- [ ] Add `replyToMessageId?: string` to `AgentMessage` interface
- [ ] Update JSDoc with comprehensive threading documentation
- [ ] Mark as optional for backward compatibility
- [ ] Add validation helper function

**Change:**
```typescript
export interface AgentMessage extends ChatMessage {
  /**
   * Unique message identifier. REQUIRED for all new messages.
   * Used for message editing, threading, and deduplication.
   * 
   * @required for new messages (as of version 6)
   * @optional only for legacy data (pre-version 6)
   * @example "msg-1234567890-abc"
   */
  messageId?: string;
  
  /**
   * Parent message identifier for threading support.
   * Links this message to the message it's replying to.
   * 
   * Threading Semantics:
   * - Assistant messages: Set to triggering user/agent message ID
   * - Incoming user messages: Usually null/undefined (start of conversation)
   * - Tool results: Set to assistant message that made tool call
   * - System messages: Usually null/undefined
   * 
   * Rules:
   * - MUST NOT equal messageId (no self-references)
   * - MUST reference existing message in conversation
   * - MUST NOT create circular chains (A→B→C→A)
   * 
   * @example
   * // Human asks question (root message)
   * { messageId: "msg-1", replyToMessageId: undefined, role: "user", content: "Hello?" }
   * 
   * // Agent responds (reply message)
   * { messageId: "msg-2", replyToMessageId: "msg-1", role: "assistant", content: "Hi!" }
   * 
   * // Multi-level thread
   * { messageId: "msg-3", replyToMessageId: "msg-2", role: "user", content: "Thanks!" }
   * 
   * @since version 7
   */
  replyToMessageId?: string;
  
  sender?: string;
  chatId?: string | null;
  agentId?: string;
}

/**
 * Validates message threading relationships
 * @throws Error if threading is invalid
 */
export function validateMessageThreading(
  message: AgentMessage, 
  allMessages?: AgentMessage[]
): void {
  // Check self-reference
  if (message.replyToMessageId && message.replyToMessageId === message.messageId) {
    throw new Error(`Message ${message.messageId} cannot reply to itself`);
  }

  // Check parent exists (if allMessages provided)
  if (message.replyToMessageId && allMessages) {
    const parent = allMessages.find(m => m.messageId === message.replyToMessageId);
    if (!parent) {
      console.warn(`Parent message ${message.replyToMessageId} not found for message ${message.messageId}`);
      // Don't throw - parent might be in different chat or deleted
    }

    // Check for circular references (limited depth check)
    const visited = new Set<string>();
    let current = message.replyToMessageId;
    let depth = 0;
    const MAX_DEPTH = 100;

    while (current && depth < MAX_DEPTH) {
      if (visited.has(current)) {
        throw new Error(`Circular reference detected in thread: ${Array.from(visited).join(' → ')} → ${current}`);
      }
      visited.add(current);
      
      const parent = allMessages.find(m => m.messageId === current);
      current = parent?.replyToMessageId;
      depth++;
    }

    if (depth >= MAX_DEPTH) {
      throw new Error(`Thread depth exceeds maximum (${MAX_DEPTH})`);
    }
  }
}
```

**Impact:**
- No breaking changes (optional field)
- TypeScript compilation unaffected
- Existing code continues to work
- Runtime validation prevents invalid threading
- Clear documentation prevents misuse

---

### 2. Database Schema Changes

#### 2.1 SQLite Schema (`core/storage/sqlite-schema.ts`)

**Add Column:**
- [ ] Add `reply_to_message_id TEXT` to `agent_memory` table
- [ ] Create index for query performance: `idx_agent_memory_reply_to`
- [ ] Update schema version to 7

**Migration Logic:**
```sql
-- Version 7 migration
ALTER TABLE agent_memory ADD COLUMN reply_to_message_id TEXT;
CREATE INDEX IF NOT EXISTS idx_agent_memory_reply_to_message_id 
  ON agent_memory(reply_to_message_id);
```

**Files to modify:**
- [ ] `initializeSchema()` - Add column to CREATE TABLE statement
- [ ] `createIndexes()` - Add index creation
- [ ] `migrate()` - Add version 7 migration block
- [ ] Update target version from 6 to 7

**Validation:**
- [ ] Verify index creation succeeds
- [ ] Check column exists after migration
- [ ] Confirm foreign key relationships intact

---

#### 2.2 Memory Storage Interface (`core/storage/memory-storage.ts`)

**No changes needed** - Memory storage uses in-memory objects, automatically supports new field

---

### 3. Message Creation and Storage

#### 3.1 Event Handler - Incoming Messages (`core/events.ts`)

**Location:** `saveIncomingMessageToMemory()` function (lines 420-469)

**CRITICAL FIX:** Incoming messages should NOT set replyToMessageId. They are the START of a conversation branch, not a reply.

**Change:** Do NOT set replyToMessageId for incoming messages
```typescript
const userMessage: AgentMessage = {
  role: 'user',
  content: messageEvent.content,
  createdAt: new Date(),
  sender: messageEvent.sender,
  chatId: world.currentChatId || null,
  messageId: messageEvent.messageId,
  agentId: agent.id,
  // NO replyToMessageId - this is the triggering message, not a reply
};

// Validate message ID exists (REQUIRED for threading)
if (!userMessage.messageId) {
  throw new Error('[saveIncomingMessageToMemory] messageId is required for threading');
}
```

**Logic:**
- Incoming messages are ROOT messages in the conversation tree
- They trigger agent responses but are not themselves replies
- Agent responses will point BACK to this message via replyToMessageId
- This prevents circular reference issues

**Example Flow:**
```
1. Human sends: "Hello agents!" 
   → messageId: "msg-1", replyToMessageId: undefined
   → Saved to Agent A and Agent B memory

2. Agent A receives incoming message:
   → messageId: "msg-1", replyToMessageId: undefined (NOT "msg-1"!)
   → Saved to Agent A memory

3. Agent A generates response: "Hi there!"
   → messageId: "msg-2", replyToMessageId: "msg-1" ✅
   → Creates proper parent-child relationship
```

---

#### 3.2 Event Handler - Agent Responses (`core/events.ts`)

**Location:** `processAgentMessage()` function (lines 476-573)

**Change:** Link response to triggering message (THIS is where replyToMessageId gets set)
```typescript
// Pre-generate message ID for agent response
const messageId = generateId();

// Validate triggering message has ID
if (!messageEvent.messageId) {
  throw new Error('[processAgentMessage] messageEvent.messageId is required for threading');
}

// Save final response to memory with pre-generated ID and parent link
const assistantMessage: AgentMessage = {
  role: 'assistant',
  content: finalResponse,
  createdAt: new Date(),
  chatId: world.currentChatId || null,
  messageId: messageId,
  sender: agent.id,
  agentId: agent.id,
  replyToMessageId: messageEvent.messageId // ✅ Link to message we're replying to
};

// Validate threading before saving
try {
  validateMessageThreading(assistantMessage, agent.memory);
} catch (error) {
  loggerMemory.error('[processAgentMessage] Invalid threading', {
    agentId: agent.id,
    messageId: assistantMessage.messageId,
    replyToMessageId: assistantMessage.replyToMessageId,
    error: error instanceof Error ? error.message : error
  });
  // Don't throw - allow message to save without threading
  assistantMessage.replyToMessageId = undefined;
}

agent.memory.push(assistantMessage);
```

**Logic:**
- Agent receives message with `messageEvent.messageId`
- Agent generates response with new `messageId`
- Response includes `replyToMessageId = messageEvent.messageId`
- Creates explicit parent-child relationship
- Validation prevents circular references and invalid threads

**Example Multi-Agent Flow:**
```
1. Agent A → "@Agent-B what's the answer?"
   messageId: "msg-1", replyToMessageId: undefined

2. Agent B receives (incoming to B's memory):
   messageId: "msg-1", replyToMessageId: undefined (NOT circular!)

3. Agent B responds → "The answer is 42"
   messageId: "msg-2", replyToMessageId: "msg-1" ✅

4. Result: Clear thread A→B with proper parent-child link
```

---

#### 3.3 Storage Layer (`core/storage/sqlite-storage.ts`)

**Location:** `saveAgent()` function

**Changes:**
- [ ] Update INSERT statement to include `reply_to_message_id` column
- [ ] Add parameter binding for new field
- [ ] Handle `undefined` values (NULL in database)

**Before:**
```typescript
INSERT INTO agent_memory 
  (agent_id, world_id, message_id, role, content, sender, chat_id, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
```

**After:**
```typescript
INSERT INTO agent_memory 
  (agent_id, world_id, message_id, reply_to_message_id, role, content, sender, chat_id, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
```

**Location:** `getMemory()` function

**Changes:**
- [ ] Add `reply_to_message_id` to SELECT statement
- [ ] Map column to `replyToMessageId` property in result objects

**Before:**
```typescript
SELECT message_id, role, content, sender, chat_id, created_at
FROM agent_memory
```

**After:**
```typescript
SELECT message_id, reply_to_message_id, role, content, sender, chat_id, created_at
FROM agent_memory
```

---

### 4. Reply Detection Logic

#### 4.1 Export Format (`core/export.ts`)

**Location:** Lines 325-340 (in-memory detection logic)

**Replace heuristic with explicit check (with deprecation-ready fallback):**

**Before (timestamp heuristic):**
```typescript
// Check if this is in-memory only (no corresponding assistant message from same agent)
const hasReply = consolidatedMessages.some(m =>
  m.role === 'assistant' &&
  m.agentId === message.agentId &&
  m.createdAt && message.createdAt &&
  new Date(m.createdAt).getTime() > new Date(message.createdAt).getTime()
);
if (!hasReply) {
  messageType = ' [in-memory, no reply]';
}
```

**After (explicit threading with warning-enabled fallback):**
```typescript
// Check if this is in-memory only using explicit reply relationship
// Priority 1: Check for explicit reply link (new messages)
// Priority 2: Fall back to timestamp heuristic (legacy messages) with warning
const hasReply = message.messageId
  ? consolidatedMessages.some(m => m.replyToMessageId === message.messageId)
  : (() => {
      // Legacy fallback - will be removed in future version
      loggerExport.warn('Using timestamp heuristic for legacy message', {
        messageId: message.messageId,
        sender: message.sender,
        agentId: message.agentId
      });
      return consolidatedMessages.some(m =>
        m.role === 'assistant' &&
        m.agentId === message.agentId &&
        m.createdAt && message.createdAt &&
        new Date(m.createdAt).getTime() > new Date(message.createdAt).getTime()
      );
    })();
    
if (!hasReply) {
  messageType = ' [in-memory, no reply]';
}
```

**Benefits:**
- ✅ Accurate for new messages with threading
- ✅ Backward compatible with legacy messages
- ✅ Progressive enhancement as conversations continue
- ⚠️ Warns when using fallback (for future deprecation)
- 📊 Provides telemetry for migration planning

**Note:** The display code (line 349) already uses the check result:
```typescript
markdown += `${index + 1}. ${label}${messageType}\n`;
```
Where `messageType` contains `' [in-memory, no reply]'` when `!hasReply`. No changes needed to display logic.

**Future Deprecation Path:**
Once sufficient adoption (e.g., 90% of messages have threading), the fallback can be removed:
```typescript
const hasReply = message.messageId
  ? consolidatedMessages.some(m => m.replyToMessageId === message.messageId)
  : false; // Strict mode - assume no reply if no threading data
```

---

#### 4.2 Frontend Display (`web/src/components/world-chat.tsx`)

**Location:** Lines 186-190 (memory-only detection)

**Current logic:** Simple flag based on message type
```typescript
const isMemoryOnlyMessage = isIncomingMessage &&
  senderType === SenderType.AGENT &&
  isCrossAgentMessage &&
  !message.isStreaming;
```

**Enhanced logic with reply detection:**
```typescript
// Check if there's a reply to this incoming message
const hasReply = message.messageId
  ? messages.some(m => m.replyToMessageId === message.messageId)
  : false; // Legacy messages without threading assumed to have replies

const isMemoryOnlyMessage = isIncomingMessage &&
  senderType === SenderType.AGENT &&
  isCrossAgentMessage &&
  !message.isStreaming &&
  !hasReply; // NEW: Only mark as memory-only if no reply exists
```

**Impact:**
- More accurate `[in-memory, no reply]` marker
- Matches export logic
- Frontend and backend consistent

**Note:** The display code (lines 210-212) already uses the `isMemoryOnlyMessage` flag:
```typescript
if (isMemoryOnlyMessage) {
  displayLabel += ' [in-memory, no reply]';
}
```
No changes needed to display logic - it already correctly appends the marker based on the detection flag.

**Phase 1 Enhancement:** Add minimal visual thread indicator
```typescript
// Add after message rendering
{message.replyToMessageId && (
  <span className="reply-indicator" title={`Reply to ${findMessageSender(message.replyToMessageId)}`}>
    ↪️ Replying
  </span>
)}

// Helper function
function findMessageSender(messageId: string): string {
  const parent = messages.find(m => m.messageId === messageId);
  return parent?.sender || 'previous message';
}
```

**Benefits:**
- Immediate visual feedback of threading
- Validates threading logic in UI
- Foundation for future thread tree visualization
- Minimal code complexity

---

#### 4.3 Frontend Type Definition (`web/src/types.ts`)

**Add field to Message interface:**
```typescript
export interface Message {
  id: string;
  sender: string;
  text: string;
  messageId?: string;
  replyToMessageId?: string; // NEW: Parent message reference
  createdAt?: Date;
  // ... rest of fields
}
```

---

#### 4.4 SSE Client (`web/src/utils/sse-client.ts`)

**Update message creation functions:**

**Location:** `handleMemoryOnlyMessage()` and message construction

**Change:** Preserve `replyToMessageId` from backend
```typescript
const message: Message = {
  id: `msg-${Date.now()}-${Math.random()}`,
  sender: data.agentName || 'unknown',
  text: data.content || '',
  messageId: data.messageId,
  replyToMessageId: data.replyToMessageId, // NEW: Preserve from backend
  createdAt: new Date(),
  type: 'user',
  fromAgentId: data.agentName,
  seenByAgents: [data.agentName]
};
```

---

#### 4.5 World Update Handler (`web/src/pages/World.update.ts`)

**Location:** `createMessageFromMemory()` function (lines 75-115)

**Change:** Preserve replyToMessageId from backend
```typescript
return {
  id: `msg-${Date.now() + Math.random()}`,
  sender,
  text: memoryItem.content || '',
  messageId: memoryItem.messageId,
  replyToMessageId: memoryItem.replyToMessageId, // NEW: Preserve from backend
  createdAt: memoryItem.createdAt || new Date(),
  type: messageType,
  fromAgentId: memoryItem.agentId || (isUserMessage ? undefined : agentName),
  role: memoryItem.role
  // ... rest of fields
};
```

---

### 5. Testing Strategy

#### 5.1 Unit Tests

**File:** `tests/core/events/message-threading.test.ts` (NEW)

**Test Cases:**
- [ ] **Basic threading**: Agent A sends message, Agent B replies → `replyToMessageId` correctly set
- [ ] **Multi-level threading**: Agent A → Agent B → Agent C chain
- [ ] **Human message threading**: Human sends, agent replies with correct parent
- [ ] **Cross-agent threading**: Message sent to multiple agents, each reply links to original
- [ ] **Memory-only detection**: Incoming message without reply correctly identified
- [ ] **Reply detection**: Message with reply correctly NOT marked as memory-only
- [ ] **Backward compatibility**: Legacy messages without `replyToMessageId` still work
- [ ] **Concurrent messages**: Multiple incoming messages, agent replies to correct one
- [ ] **🔴 Self-reference prevention**: Message with `replyToMessageId = messageId` throws error
- [ ] **🔴 Circular reference detection**: Chain A→B→C→A detected and prevented
- [ ] **🔴 Orphaned replies**: Message with `replyToMessageId` to non-existent message handled gracefully
- [ ] **🔴 Missing messageId**: Messages without messageId fail validation with clear error
- [ ] **Thread depth validation**: Excessive nesting (>100 levels) detected
- [ ] **Cross-chat threading**: Messages in different chats handled correctly

**Example Test:**
```typescript
describe('Message Threading', () => {
  it('should link agent reply to triggering message', async () => {
    const world = await createWorld('test-world');
    const agent = await addAgent(world.id, { name: 'Agent A', ... });
    
    // Human sends message
    const humanMessageId = publishMessage(world, 'Hello', 'HUMAN');
    
    // Wait for agent response
    await waitForEvent(world, 'message');
    
    // Verify agent's reply has replyToMessageId set
    const agentMemory = agent.memory;
    const agentReply = agentMemory.find(m => m.role === 'assistant');
    
    expect(agentReply?.replyToMessageId).toBe(humanMessageId);
    expect(agentReply?.messageId).not.toBe(humanMessageId); // Not same as parent
  });
  
  it('should detect memory-only messages accurately', async () => {
    // Agent A sends to Agent B (B doesn't respond)
    const messageId = publishMessage(world, 'Hello B', 'agent-a');
    
    // Agent B receives in memory but doesn't respond
    const agentBMemory = agentB.memory;
    const incomingMessage = agentBMemory.find(m => m.messageId === messageId);
    
    // Incoming message should NOT have replyToMessageId
    expect(incomingMessage?.replyToMessageId).toBeUndefined();
    
    // Export should mark as [in-memory, no reply]
    const exportText = await exportWorld(world.id);
    expect(exportText).toContain('[in-memory, no reply]');
  });

  it('should prevent self-referencing messages', async () => {
    const message: AgentMessage = {
      role: 'assistant',
      content: 'Test',
      messageId: 'msg-1',
      replyToMessageId: 'msg-1', // Invalid: self-reference
    };

    expect(() => validateMessageThreading(message)).toThrow('cannot reply to itself');
  });

  it('should detect circular references in thread chains', async () => {
    const messages: AgentMessage[] = [
      { role: 'user', content: 'A', messageId: 'msg-1', replyToMessageId: 'msg-3' }, // Points to C
      { role: 'user', content: 'B', messageId: 'msg-2', replyToMessageId: 'msg-1' }, // Points to A
      { role: 'user', content: 'C', messageId: 'msg-3', replyToMessageId: 'msg-2' }, // Points to B → circular!
    ];

    expect(() => validateMessageThreading(messages[0], messages))
      .toThrow('Circular reference detected');
  });

  it('should handle orphaned replies gracefully', async () => {
    const message: AgentMessage = {
      role: 'assistant',
      content: 'Reply to deleted message',
      messageId: 'msg-2',
      replyToMessageId: 'msg-nonexistent', // Parent doesn't exist
    };

    // Should warn but not throw (parent might be in different chat)
    expect(() => validateMessageThreading(message, [])).not.toThrow();
  });

  it('should validate multi-level threading correctly', async () => {
    const world = await createWorld('test-world');
    const agentA = await addAgent(world.id, { name: 'Agent A' });
    const agentB = await addAgent(world.id, { name: 'Agent B' });

    // Human → Agent A → Agent B chain
    const msg1 = publishMessage(world, 'Start', 'HUMAN');
    await waitForEvent(world, 'message');
    
    const agentAReply = agentA.memory.find(m => m.role === 'assistant');
    expect(agentAReply?.replyToMessageId).toBe(msg1);

    // Agent A's reply triggers Agent B
    await waitForEvent(world, 'message');
    const agentBReply = agentB.memory.find(m => m.role === 'assistant');
    expect(agentBReply?.replyToMessageId).toBe(agentAReply?.messageId);
    
    // Verify chain: msg1 → agentAReply → agentBReply
    expect(agentBReply?.replyToMessageId).not.toBe(msg1); // Not direct reply to human
  });
});
```

---

#### 5.2 Integration Tests

**File:** `tests/integration/message-threading.integration.test.ts` (NEW)

**Test Cases:**
- [ ] **End-to-end threading**: Message → Response → Export shows correct relationships
- [ ] **Database persistence**: Threading preserved across save/load cycles
- [ ] **Frontend display**: UI correctly shows reply relationships and thread indicators
- [ ] **Export accuracy**: Export format correctly identifies memory-only vs. replied
- [ ] **Migration**: Existing database upgraded correctly to version 7
- [ ] **Performance**: Large conversations (1000+ messages) perform acceptably
- [ ] **Mixed threading**: Conversations with both threaded and legacy messages display correctly
- [ ] **Message deletion**: Orphaned replies handled gracefully when parent deleted
- [ ] **Concurrent agents**: Multiple agents replying to same message creates correct thread branches

---

#### 5.3 Migration Tests

**File:** `tests/core/storage/sqlite-migration-v7.test.ts` (NEW)

**Test Cases:**
- [ ] **Fresh database**: Version 7 schema created correctly
- [ ] **Upgrade from v6**: Column added, index created, data preserved
- [ ] **Backward compatibility**: Can read v6 messages (NULL replyToMessageId)
- [ ] **Forward compatibility**: New messages with threading work correctly
- [ ] **Index performance**: Query using reply_to_message_id performs efficiently
- [ ] **Concurrent migration**: Multiple processes don't corrupt database

**Example Test:**
```typescript
describe('SQLite Migration v6 → v7', () => {
  it('should add reply_to_message_id column', async () => {
    // Create v6 database
    const ctx = await createSQLiteSchemaContext({ database: ':memory:' });
    await setSchemaVersion(ctx, 6);
    
    // Run migration
    await migrate(ctx);
    
    // Verify schema
    const version = await getSchemaVersion(ctx);
    expect(version).toBe(7);
    
    // Verify column exists
    const columns = await db.all("PRAGMA table_info(agent_memory)");
    const hasColumn = columns.some(col => col.name === 'reply_to_message_id');
    expect(hasColumn).toBe(true);
    
    // Verify index exists
    const indexes = await db.all("PRAGMA index_list(agent_memory)");
    const hasIndex = indexes.some(idx => 
      idx.name === 'idx_agent_memory_reply_to_message_id'
    );
    expect(hasIndex).toBe(true);
  });
  
  it('should preserve existing messages during migration', async () => {
    // Create v6 database with messages
    const ctx = await createV6DatabaseWithMessages();
    const originalCount = await getMessageCount(ctx);
    
    // Run migration
    await migrate(ctx);
    
    // Verify all messages still exist
    const newCount = await getMessageCount(ctx);
    expect(newCount).toBe(originalCount);
    
    // Verify existing messages have NULL reply_to_message_id
    const messages = await getAllMessages(ctx);
    messages.forEach(msg => {
      expect(msg.reply_to_message_id).toBeNull();
    });
  });
});
```

---

#### 5.4 Existing Test Updates

**Files to check/update:**
- [ ] `tests/core/events/*.test.ts` - Verify threading doesn't break existing tests
- [ ] `tests/core/storage/sqlite-storage.test.ts` - Update to include replyToMessageId
- [ ] `tests/core/export.test.ts` - Update memory-only detection expectations
- [ ] `tests/web/components/world-chat.test.tsx` - Update display logic tests (if exists)

**Expected Impact:**
- Most tests should pass without changes (backward compatible)
- Some tests may need to assert `replyToMessageId` is set correctly
- Export tests may need updated expected output
- Add assertions for validation helper calls

**Performance Benchmarks (NEW):**
- [ ] Query performance with 10K messages: < 100ms for thread lookup
- [ ] Index effectiveness: EXPLAIN QUERY PLAN shows index usage
- [ ] Export performance with 100-level deep threads: < 5s
- [ ] Memory usage: Thread validation overhead < 10MB for 10K messages
- [ ] Concurrent writes: 10 simultaneous message creations complete successfully

---

### 6. Implementation Checklist

#### Phase 0: Pre-Implementation Validation (NEW - CRITICAL)
- [ ] **Audit message publishing paths** - Ensure all `publishMessage()` calls generate messageId
- [ ] **Review WorldMessageEvent contract** - Document messageId requirement
- [ ] **Add runtime assertions** - Validate messageId exists in event handlers
- [ ] **Code review of circular reference fix** - Verify Section 3.1 logic is correct
- [ ] **Estimated time:** 1-2 hours

#### Phase 1: Schema and Storage (Backend Foundation)
- [ ] Update `AgentMessage` type definition with comprehensive JSDoc
- [ ] Add `validateMessageThreading()` helper function to core/types.ts
- [ ] Add database column and index (version 7 migration)
- [ ] Update `sqlite-storage.ts` INSERT/SELECT statements
- [ ] Write migration tests
- [ ] Verify migration on existing database
- [ ] Run full test suite: `npm test`
- [ ] **Estimated time:** 3-4 hours (was 2-3)

#### Phase 2: Message Creation (Populate Field)
- [ ] Update `saveIncomingMessageToMemory()` - DO NOT set replyToMessageId
- [ ] Update `processAgentMessage()` - SET replyToMessageId to triggering message
- [ ] Add messageId validation in both handlers
- [ ] Add threading validation before saving messages
- [ ] Write threading unit tests (including edge cases)
- [ ] Verify messages created with correct parent links
- [ ] Test circular reference prevention
- [ ] Test orphaned reply handling
- [ ] Run event tests: `npm test -- events`
- [ ] **Estimated time:** 2-3 hours (was 1-2)

#### Phase 3: Detection Logic (Backend Usage)
- [ ] Update export.ts reply detection with warning-enabled fallback
- [ ] Test export format with threaded messages
- [ ] Test export format with legacy messages
- [ ] Test mixed-mode conversations (threaded + legacy)
- [ ] Verify `[in-memory, no reply]` accuracy
- [ ] Monitor fallback usage warnings
- [ ] Run export tests: `npm test -- export.test.ts`
- [ ] **Estimated time:** 1-2 hours

#### Phase 4: Frontend Integration
- [ ] Update frontend Message type (already has replyToMessageId)
- [ ] Update SSE client to preserve `replyToMessageId`
- [ ] Update `createMessageFromMemory()` to preserve field
- [ ] Update `world-chat.tsx` memory-only detection
- [ ] **Add minimal thread indicator UI (NEW)**
- [ ] Test frontend display with threaded messages
- [ ] Test thread indicator appearance and interaction
- [ ] Manual UI testing in browser
- [ ] **Estimated time:** 2-3 hours (was 2-3)

#### Phase 5: Integration Testing
- [ ] Write end-to-end integration tests
- [ ] Test full message flow: send → reply → display → export
- [ ] Test legacy message handling
- [ ] Test concurrent message handling
- [ ] **Performance testing with large conversations (NEW)**
- [ ] **Thread depth stress testing (NEW)**
- [ ] **Multi-agent threading scenarios (NEW)**
- [ ] **Estimated time:** 3-4 hours (was 2-3)

#### Phase 6: Documentation
- [ ] Update API documentation
- [ ] Update architecture diagrams (if needed)
- [ ] Write migration guide for existing deployments
- [ ] Update CHANGELOG.md
- [ ] Create feature summary document (DD)
- [ ] Document threading semantics and rules
- [ ] **Estimated time:** 1 hour

---

## Migration Strategy

### For Existing Databases

**Phase 1: Deploy code with migration**
1. Code supports both threaded and non-threaded messages
2. Migration runs automatically on startup
3. Existing messages have `reply_to_message_id = NULL`
4. New messages get threading populated

**Phase 2: Progressive enhancement**
1. Old conversations continue with timestamp heuristics
2. New conversations get accurate threading
3. No data loss or corruption
4. No user-visible breaking changes

**Phase 3: Long-term (optional)**
1. Could backfill threading for old messages using heuristics
2. Could deprecate timestamp-based detection after sufficient adoption
3. Could add UI to visualize conversation threads

---

## Risk Assessment

### Low Risk
- ✅ Optional field (no breaking changes)
- ✅ Fallback logic for legacy data
- ✅ Well-tested migration pattern (same as messageId)
- ✅ Database migration is non-destructive

### Medium Risk
- ⚠️ Performance impact of additional index (mitigated by proper indexing + testing)
- ⚠️ Need to ensure all message creation paths updated (test coverage + Phase 0 audit)
- ⚠️ Type safety gaps between optional types and runtime requirements (runtime validation)
- ⚠️ Backward compatibility in mixed-mode conversations (warning system + fallback)

### Mitigation
- ✅ Comprehensive test coverage before deployment (Phase 5)
- ✅ Phase 0 audit to validate message ID generation
- ✅ Runtime validation to prevent circular references and invalid threading
- ✅ Warning system for fallback usage (deprecation tracking)
- ✅ Performance benchmarks with large datasets
- ✅ Gradual rollout with monitoring
- ✅ Database backup before migration
- ✅ Ability to rollback if issues detected

---

## Success Criteria

### Functional
- ✅ All new messages have `replyToMessageId` when applicable (assistant responses only)
- ✅ Incoming messages do NOT have `replyToMessageId` (root messages)
- ✅ Export format accurately identifies memory-only messages
- ✅ Frontend display matches export logic
- ✅ Legacy messages continue to work
- ✅ **Circular references prevented by validation**
- ✅ **Self-references detected and rejected**
- ✅ **Thread depth limits enforced**
- ✅ **Multi-agent threading works correctly**

### Technical
- ✅ Database migration succeeds on existing data
- ✅ No performance regression (< 5% overhead)
- ✅ All existing tests pass
- ✅ New tests achieve > 90% coverage
- ✅ **Query performance acceptable (< 100ms for 10K messages)**
- ✅ **Index effectiveness confirmed via EXPLAIN QUERY PLAN**
- ✅ **Validation overhead < 10MB for 10K messages**

### User Experience
- ✅ No breaking changes in UI or API
- ✅ More accurate `[in-memory, no reply]` detection
- ✅ Foundation for future threading features
- ✅ **Visual thread indicators in chat UI**
- ✅ **Clear error messages for invalid threading**
- ✅ **Smooth handling of mixed threaded/legacy conversations**

---

## Future Enhancements

### Phase 2 Features (Post-Implementation)
1. **Threading UI**: Display conversation trees in frontend
2. **Reply navigation**: Click to jump to parent/child messages
3. **Thread analytics**: Track which messages get most replies
4. **Thread filtering**: Show only main thread or all threads
5. **Thread export**: Export individual conversation threads

### Technical Improvements
1. **Circular reference detection**: Prevent invalid threading
2. **Thread depth limits**: Prevent infinite chains
3. **Thread visualization**: Mermaid diagrams of conversation flow
4. **Thread search**: Find messages by thread relationship

---

## Timeline Estimate

| Phase | Tasks | Estimated Time | Notes |
|-------|-------|----------------|-------|
| Phase 0: Pre-Implementation | Audit, validation, review | 1-2 hours | NEW - Critical validation |
| Phase 1: Schema & Storage | Type, migration, storage layer | 3-4 hours | +1 hour for validation helpers |
| Phase 2: Message Creation | Event handlers, population | 2-3 hours | +1 hour for edge case handling |
| Phase 3: Detection Logic | Export, display logic | 1-2 hours | Unchanged |
| Phase 4: Frontend | Types, SSE, display, UI | 2-3 hours | Includes thread indicator |
| Phase 5: Integration Tests | E2E, migration, performance | 3-4 hours | +1 hour for performance tests |
| Phase 6: Documentation | Docs, changelog, summary | 1 hour | Unchanged |
| **Total** | | **13-19 hours** | Was 9-14 hours |

**Time Increase Rationale:**
- +1-2h for Phase 0 audit and validation setup
- +1h for comprehensive validation helpers
- +1h for edge case test coverage
- +1h for performance benchmarking
- **Total: +4-5 hours for quality and correctness**

---

## Dependencies

### Required
- SQLite3 (already installed)
- TypeScript 4.5+ (already installed)
- Jest for testing (already installed)

### Optional
- Database backup tool (for production migration)
- Performance monitoring (for production deployment)

---

## Conclusion

This plan implements message threading using the proven pattern from `messageId` migration. The approach is:
- ✅ **Low risk** - Optional field, fallback logic, non-destructive migration
- ✅ **High value** - Accurate reply detection, foundation for future features
- ✅ **Well-tested** - Comprehensive test coverage across all layers
- ✅ **Progressive** - Works with both new and legacy messages
- ✅ **Validated** - Runtime checks prevent circular references and invalid threading
- ✅ **Observable** - Warning system tracks fallback usage for future deprecation
- ✅ **User-friendly** - Visual thread indicators provide immediate value

The implementation follows existing architectural patterns and maintains full backward compatibility while providing immediate improvements to reply detection accuracy.

**Architecture Review Status:** ✅ **APPROVED with revisions applied**

**Critical Fixes Applied:**
1. 🔴 Fixed circular reference logic in Section 3.1 (incoming messages no longer set replyToMessageId)
2. 🔴 Added runtime validation helpers to prevent invalid threading
3. ⚠️ Enhanced JSDoc with clear threading semantics and examples
4. ⚠️ Added comprehensive edge case test coverage
5. 💡 Added minimal visual thread indicators for Phase 1
6. 💡 Added performance benchmarks and monitoring
7. 💡 Added warning system for fallback deprecation tracking

**Next Steps:**
1. Review and approve updated plan
2. Begin Phase 0: Pre-implementation audit
3. Proceed with implementation following revised timeline

---

## Appendix: Threading Semantics Reference

### Message Types and Threading Behavior

| Message Type | Role | Sets replyToMessageId? | Rationale |
|--------------|------|------------------------|-----------|
| Human message | `user` | ❌ No (root) | Starts new conversation branch |
| Agent incoming | `user` | ❌ No (root) | Copy of triggering message, not a reply |
| Agent response | `assistant` | ✅ Yes (to trigger) | Replies to incoming/triggering message |
| Tool call | `assistant` | ✅ Yes (to context) | Part of agent's response chain |
| Tool result | `tool` | ✅ Yes (to tool call) | Result of specific tool execution |
| System message | `system` | ❌ No (metadata) | Administrative, not conversational |

### Thread Validation Rules

1. **Self-Reference:** `messageId ≠ replyToMessageId`
2. **Circular Reference:** No loops in chain (A→B→C→A)
3. **Thread Depth:** Maximum 100 levels
4. **Orphaned Replies:** Warn but allow (parent may be in different chat)
5. **Missing MessageId:** Validation skipped for legacy messages without messageId

### Example Threading Scenarios

**Scenario 1: Simple Human-Agent Exchange**
```
Human: "Hello" (msg-1, replyTo: null)
  ↓
Agent: "Hi!" (msg-2, replyTo: msg-1) ✅
```

**Scenario 2: Multi-Agent Broadcast**
```
Human: "@Agent-A @Agent-B hello" (msg-1, replyTo: null)
  ↓
Agent A: "Hi from A" (msg-2, replyTo: msg-1) ✅
Agent B: "Hi from B" (msg-3, replyTo: msg-1) ✅
```

**Scenario 3: Agent-to-Agent Chain**
```
Agent A: "@Agent-B question?" (msg-1, replyTo: null)
  ↓ (saved to Agent B's memory as incoming)
Agent B incoming: (msg-1, replyTo: null) ✅ Not circular!
  ↓
Agent B: "Answer" (msg-2, replyTo: msg-1) ✅
```

**Scenario 4: Multi-Level Thread**
```
Human: "Start" (msg-1, replyTo: null)
  ↓
Agent A: "Response" (msg-2, replyTo: msg-1)
  ↓
Agent B: "Follow-up" (msg-3, replyTo: msg-2)
  ↓
Agent C: "Final" (msg-4, replyTo: msg-3)
```

**Scenario 5: Invalid - Circular Reference**
```
Agent A: (msg-1, replyTo: msg-3) ← Points to C
Agent B: (msg-2, replyTo: msg-1) ← Points to A
Agent C: (msg-3, replyTo: msg-2) ← Points to B
❌ Validation detects loop: msg-1 → msg-3 → msg-2 → msg-1
```
