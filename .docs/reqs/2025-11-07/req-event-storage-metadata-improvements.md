# Event Storage Metadata Improvements - Requirements Analysis

**Date:** 2025-11-07  
**Status:** Requirements Analysis  
**Category:** Data Architecture, Event Storage

---

## Current Event Storage Architecture

### Database Schema (SQLite)

```sql
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  chat_id TEXT,
  seq INTEGER,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,  -- JSON data
  meta TEXT,              -- JSON metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (world_id) REFERENCES worlds(id) ON DELETE CASCADE,
  FOREIGN KEY (chat_id) REFERENCES world_chats(id) ON DELETE CASCADE
);
```

### Current Event Types Stored

```typescript
interface StoredEvent {
  id: string;
  worldId: string;
  chatId: string | null;
  seq?: number | null;
  type: string;  // 'message', 'sse', 'tool', 'world', 'system', 'crud'
  payload: any;  // Event-specific data
  meta?: any;    // Metadata
  createdAt: Date;
}
```

### Current Payload Storage by Event Type

#### 1. Message Events (`type: 'message'`)
```typescript
payload: {
  content: string;
  sender: string;
  replyToMessageId?: string;
  role?: string;           // OpenAI protocol
  tool_calls?: Array<{     // OpenAI protocol
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;   // OpenAI protocol
}

meta: {
  sender: string;
  chatId: string | null;
}
```

#### 2. SSE Events (`type: 'sse'`)
```typescript
payload: {
  agentName: string;
  type: 'start' | 'end';  // Only start/end persisted, not chunks
  content?: string;
  error?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  logEvent?: any;
}

meta: {
  agentName: string;
  sseType: string;
}
```

#### 3. Tool Events (`type: 'tool'`)
```typescript
payload: {
  agentName: string;
  type: 'tool-start' | 'tool-result' | 'tool-error' | 'tool-progress';
  toolExecution: {
    toolName: string;
    toolCallId: string;
    sequenceId?: string;
    duration?: number;
    input?: any;
    result?: any;
    resultType?: string;
    resultSize?: number;
    error?: string;
    metadata?: any;
  };
}

meta: {
  agentName: string;
  toolType: string;
}
```

#### 4. CRUD Events (`type: 'crud'`)
```typescript
payload: {
  operation: 'create' | 'update' | 'delete';
  entityType: 'agent' | 'chat' | 'world';
  entityId: string;
  entityData?: any;
}

meta: {
  operation: string;
  entityType: string;
}
```

---

## Missing Metadata Analysis

### Critical Missing Fields

#### 1. **Agent Context** ❌ CRITICAL for Filtering

**Problem:**
- Web frontend needs `ownerAgentId` to filter messages by agent perspective
- Events don't track which agent's memory contains each message
- Cannot reconstruct agent-specific views from events alone

**Impact:**
- Agent filtering feature would break if switching to event-only approach
- Cannot show conversation from specific agent's perspective
- Debugging becomes harder (can't see what specific agent "saw")

**Current Workaround:**
- Web loads from `agent.memory` arrays which have implicit ownership
- Each message in an agent's memory belongs to that agent

**What's Needed:**
```typescript
// For message events
meta: {
  sender: string;
  chatId: string | null;
  ownerAgentIds: string[];  // NEW: Which agents have this in memory
  recipientAgentId?: string; // NEW: Intended recipient (for filtering)
}
```

#### 2. **Message Threading Metadata** ⚠️ PARTIALLY MISSING

**Current State:**
- `replyToMessageId` is stored in payload ✅
- But no easy way to query thread hierarchy
- No metadata about thread depth or root message

**What's Missing:**
```typescript
meta: {
  // ... existing fields
  threadRootId?: string;    // NEW: Root message of thread
  threadDepth?: number;     // NEW: 0=root, 1=first reply, etc.
  isReply: boolean;         // NEW: Quick flag for filtering
  hasReplies?: boolean;     // NEW: Does this message have replies?
}
```

**Use Cases:**
- Display conversation threads hierarchically
- Find all messages in a thread
- Show reply counts
- Collapse/expand threads in UI

#### 3. **Agent Activity Metadata** ⚠️ LIMITED

**Current State:**
- Activity events stored as separate `type: 'world'` events
- Not linked to specific messages easily

**What's Missing:**
```typescript
meta: {
  // ... existing fields
  isAgentActive: boolean;        // NEW: Was agent actively responding?
  agentActivityId?: string;      // NEW: Link to activity tracking event
  triggeredByMessageId?: string; // NEW: What message caused this?
  processingDuration?: number;   // NEW: How long did agent take?
}
```

#### 4. **Cross-Agent Message Metadata** ❌ CRITICAL

**Problem:**
- When agent A sends message to agent B:
  - Message saved to A's memory as outgoing (role='assistant')
  - Message saved to B's memory as incoming (role='user')
- Event storage doesn't track this dual nature

**What's Missing:**
```typescript
meta: {
  // ... existing fields
  messageDirection: 'outgoing' | 'incoming' | 'broadcast';  // NEW
  originalSender?: string;      // NEW: Who authored the message
  deliveredToAgents?: string[]; // NEW: Who received it
  isMemoryOnly?: boolean;       // NEW: Saved but didn't trigger response
  isCrossAgentMessage: boolean; // NEW: Agent→agent communication
}
```

**Use Cases:**
- Reconstruct which agent sent to which agent
- Filter "memory-only" messages (gray border in UI)
- Track message delivery and responses

#### 5. **Message Edit History** ❌ MISSING

**Current State:**
- Messages can be edited via DELETE + POST
- No audit trail of edits
- Original message lost

**What's Missing:**
```typescript
meta: {
  // ... existing fields
  isEdited: boolean;          // NEW
  editedAt?: Date;            // NEW
  originalMessageId?: string; // NEW: Link to pre-edit version
  editCount?: number;         // NEW: How many times edited
}
```

#### 6. **Tool Approval Metadata** ⚠️ LIMITED

**Current State:**
- Tool calls stored with basic info
- Approval decisions stored separately

**What's Missing:**
```typescript
meta: {
  // ... existing fields
  requiresApproval: boolean;     // NEW
  approvalScope?: 'once' | 'session' | 'always';  // NEW
  approvedAt?: Date;             // NEW
  approvedBy?: string;           // NEW: 'human' or agent ID
  deniedAt?: Date;               // NEW
  denialReason?: string;         // NEW
}
```

#### 7. **Performance Metrics** 📊 OPTIONAL

**What's Missing:**
```typescript
meta: {
  // ... existing fields
  llmTokensInput?: number;     // NEW
  llmTokensOutput?: number;    // NEW
  llmCost?: number;            // NEW: Estimated cost
  llmLatency?: number;         // NEW: Response time in ms
  llmProvider?: string;        // NEW: Which provider used
  llmModel?: string;           // NEW: Which model used
}
```

#### 8. **UI State Metadata** 🎨 OPTIONAL

**What's Missing:**
```typescript
meta: {
  // ... existing fields
  isStreaming?: boolean;       // NEW: For UI indicators
  streamStartedAt?: Date;      // NEW
  streamEndedAt?: Date;        // NEW
  wasEdited?: boolean;         // NEW: UI edit indicator
  hasToolCalls?: boolean;      // NEW: Quick check
  toolCallCount?: number;      // NEW
}
```

---

## Metadata Gap Summary

| Metadata Category | Current State | Criticality | Impact if Missing |
|-------------------|---------------|-------------|-------------------|
| **Agent Ownership** | ❌ Missing | 🔴 Critical | Agent filtering breaks |
| **Message Threading** | ⚠️ Partial | 🟡 Medium | Thread UI limited |
| **Agent Activity** | ⚠️ Limited | 🟡 Medium | Less debugging info |
| **Cross-Agent Messages** | ❌ Missing | 🔴 Critical | Can't track agent→agent flow |
| **Edit History** | ❌ Missing | 🟠 High | No audit trail |
| **Tool Approvals** | ⚠️ Limited | 🟠 High | Approval tracking incomplete |
| **Performance Metrics** | ❌ Missing | 🟢 Low | No analytics |
| **UI State** | ❌ Missing | 🟢 Low | Minor UX impact |

---

## Proposed Enhanced Event Schema

### Enhanced Message Event

```typescript
interface EnhancedMessageEvent {
  // Core fields (existing)
  id: string;
  worldId: string;
  chatId: string | null;
  seq?: number;
  type: 'message';
  createdAt: Date;
  
  // Payload (enhanced)
  payload: {
    // Existing
    content: string;
    sender: string;
    replyToMessageId?: string;
    role?: string;
    tool_calls?: Array<ToolCall>;
    tool_call_id?: string;
    
    // NEW: Enhanced fields
    messageType: 'human' | 'agent' | 'system' | 'tool';
  };
  
  // Meta (significantly enhanced)
  meta: {
    // Existing
    sender: string;
    chatId: string | null;
    
    // NEW: Agent Context
    ownerAgentIds: string[];        // Which agents have this in memory
    recipientAgentId?: string;      // Intended recipient
    originalSender?: string;        // Who authored (for cross-agent)
    deliveredToAgents?: string[];   // Who received it
    
    // NEW: Message Classification
    messageDirection: 'outgoing' | 'incoming' | 'broadcast';
    isMemoryOnly: boolean;          // Saved but no response triggered
    isCrossAgentMessage: boolean;   // Agent→agent communication
    isHumanMessage: boolean;        // Human→agents communication
    
    // NEW: Threading
    threadRootId?: string;          // Root of conversation thread
    threadDepth: number;            // 0=root, 1=reply, etc.
    isReply: boolean;               // Has replyToMessageId
    hasReplies: boolean;            // Other messages reply to this
    
    // NEW: Edit History
    isEdited: boolean;
    editedAt?: Date;
    originalMessageId?: string;
    editCount: number;
    
    // NEW: Tool Approval
    requiresApproval: boolean;
    approvalScope?: 'once' | 'session' | 'always';
    approvedAt?: Date;
    approvedBy?: string;
    deniedAt?: Date;
    denialReason?: string;
    
    // NEW: Performance
    llmTokensInput?: number;
    llmTokensOutput?: number;
    llmLatency?: number;
    llmProvider?: string;
    llmModel?: string;
    
    // NEW: UI State
    isStreaming?: boolean;
    streamStartedAt?: Date;
    streamEndedAt?: Date;
    hasToolCalls: boolean;
    toolCallCount: number;
  };
}
```

---

## Migration Strategy

### Phase 1: Add New Fields (Backward Compatible)

**Approach:** Add new metadata fields while keeping existing structure

```typescript
// Old events continue to work with missing meta fields
// New events get enhanced metadata

// In event persistence code:
const messageEvent = {
  id: event.messageId,
  worldId: world.id,
  chatId: event.chatId || null,
  type: 'message',
  payload: { /* existing */ },
  meta: {
    // Existing fields
    sender: event.sender,
    chatId: event.chatId,
    
    // New fields (optional for backward compatibility)
    ownerAgentIds: event.ownerAgentIds || [],
    recipientAgentId: event.recipientAgentId,
    isMemoryOnly: event.isMemoryOnly || false,
    // ... other new fields
  },
  createdAt: event.timestamp
};
```

### Phase 2: Handle Legacy Events (Read-Time Enrichment)

**Strategy:** Events are immutable - enrich metadata at read-time for legacy events

```typescript
async function getEnrichedEvents(worldId: string, chatId: string | null) {
  // 1. Load all events for this world/chat
  const events = await eventStorage.getEventsByWorldAndChat(worldId, chatId);
  
  // 2. Load all agent memories for metadata reconstruction
  const world = await getWorld(worldId);
  const agents = Array.from(world.agents.values());
  
  // 3. Enrich each message event at read-time (no modification to stored events)
  return events.map(event => {
    if (event.type !== 'message') return event;
    
    // If event already has enhanced metadata, use it
    if (event.meta?.ownerAgentIds) {
      return event;
    }
    
    // For legacy events without metadata, calculate it on-the-fly
    const ownerAgentIds: string[] = [];
    
    // Find which agents have this message in their memory
    for (const agent of agents) {
      const hasMessage = agent.memory.some(
        msg => msg.messageId === event.id && msg.chatId === chatId
      );
      if (hasMessage) {
        ownerAgentIds.push(agent.id);
      }
    }
    
    // Return enriched event (not stored - just for this read operation)
    return {
      ...event,
      meta: {
        ...event.meta,
        ownerAgentIds,
        isMemoryOnly: calculateIsMemoryOnly(event, agents),
        isCrossAgentMessage: calculateIsCrossAgent(event, agents),
        // ... other calculated fields
        _isEnriched: true  // Flag to indicate this was enriched at read-time
      }
    };
  });
}
```

**Alternative: Append Correction Events**

For critical metadata corrections, use event sourcing pattern:
```typescript
// Don't modify original event
// Instead, append a metadata correction event
async function appendMetadataCorrection(
  originalEventId: string,
  worldId: string,
  chatId: string | null,
  corrections: any
) {
  const correctionEvent = {
    id: `${originalEventId}-correction-${Date.now()}`,
    worldId,
    chatId,
    type: 'metadata-correction',
    payload: {
      originalEventId,
      corrections
    },
    meta: {
      correctionType: 'metadata-enrichment',
      reason: 'legacy-event-enhancement'
    },
    createdAt: new Date()
  };
  
  await eventStorage.saveEvent(correctionEvent);
}

// When reading events, apply corrections
async function getEventsWithCorrections(worldId: string, chatId: string | null) {
  const events = await eventStorage.getEventsByWorldAndChat(worldId, chatId);
  const corrections = events.filter(e => e.type === 'metadata-correction');
  
  // Apply corrections to original events
  return events.map(event => {
    const correction = corrections.find(
      c => c.payload.originalEventId === event.id
    );
    
    if (correction) {
      return {
        ...event,
        meta: {
          ...event.meta,
          ...correction.payload.corrections
        }
      };
    }
    
    return event;
  });
}
```

### Phase 3: Update Event Publishing

**Locations to Update:**

1. **`core/events.ts` - Message event persistence**
```typescript
const messageHandler = (event: WorldMessageEvent): void | Promise<void> => {
  const eventData = {
    id: event.messageId,
    worldId: world.id,
    chatId: event.chatId || null,
    type: 'message',
    payload: {
      content: event.content,
      sender: event.sender,
      replyToMessageId: event.replyToMessageId,
      role: (event as any).role,
      tool_calls: (event as any).tool_calls,
      tool_call_id: (event as any).tool_call_id,
      // NEW
      messageType: determineMessageType(event)
    },
    meta: {
      sender: event.sender,
      chatId: event.chatId,
      // NEW: Calculate enhanced metadata
      ownerAgentIds: calculateOwnerAgentIds(world, event),
      recipientAgentId: calculateRecipientAgent(event),
      isMemoryOnly: calculateIsMemoryOnly(event),
      // ... other new fields
    },
    createdAt: event.timestamp
  };

  return persistEvent(eventData);
};
```

2. **Add helper functions**
```typescript
function calculateOwnerAgentIds(world: World, event: WorldMessageEvent): string[] {
  const ownerIds: string[] = [];
  
  // Check which agents will receive this message
  for (const [agentId, agent] of world.agents) {
    // Human messages go to all agents
    if (event.sender === 'human' || event.sender === 'user') {
      ownerIds.push(agentId);
    }
    // Agent messages go to mentioned agents
    else if (shouldAgentReceive(agent, event)) {
      ownerIds.push(agentId);
    }
  }
  
  return ownerIds;
}

function calculateRecipientAgent(event: WorldMessageEvent): string | undefined {
  // Check for @mentions at paragraph beginning
  const mentions = extractParagraphBeginningMentions(event.content);
  return mentions[0]; // First mention is recipient
}

function calculateIsMemoryOnly(event: WorldMessageEvent): boolean {
  // Cross-agent message that doesn't trigger response
  const isAgentSender = event.sender !== 'human' && event.sender !== 'user';
  const hasRecipient = !!calculateRecipientAgent(event);
  return isAgentSender && hasRecipient;
}
```

---

## Implementation Plan

### Step 1: Schema Enhancement (2-3 days)

1. Update `StoredEvent` interface with optional new meta fields
2. Update event persistence code to populate new fields
3. Ensure backward compatibility (old events still readable)
4. Add helper functions for metadata calculation

### Step 2: Legacy Event Handling (1-2 days)

**Option A: Read-Time Enrichment (Recommended)**
1. Create helper to enrich legacy events at read-time
2. Check if event has enhanced metadata
3. If missing, calculate from agent memories on-the-fly
4. Cache enriched results to avoid repeated calculation

**Option B: Append Correction Events (Event Sourcing)**
1. Create metadata-correction event type
2. For each legacy event, append correction event with metadata
3. When reading events, apply corrections from correction events
4. Maintains immutability - never modify original events

**Note:** Events are immutable - we don't modify existing events, we either:
- Calculate missing metadata at read-time (transient)
- Append new correction events (persistent)

### Step 3: Query API Enhancement (2-3 days)

1. Add filtering by `ownerAgentIds` to event queries
2. Add filtering by `recipientAgentId`
3. Add thread-based queries (find thread by rootId)
4. Add edit history queries

### Step 4: Web Frontend Migration (3-5 days)

1. Update message loading to use events instead of agent memory
2. Implement agent filtering using `ownerAgentIds`
3. Update UI to show enhanced metadata
4. Test all features work with event-based data

### Step 5: Testing & Validation (2-3 days)

1. Unit tests for metadata calculation
2. Integration tests for event storage
3. E2E tests for web frontend features
4. Performance testing for event queries

**Total Estimated Effort:** 10-16 days (2-3 weeks)

---

## Benefits After Implementation

### 1. **Single Source of Truth** ✅
- Events become primary data source
- Agent memory arrays can be derived from events
- No more sync issues between memory and events

### 2. **Agent Filtering Preserved** ✅
- Query events by `ownerAgentIds` 
- Reconstruct any agent's perspective
- Filter "memory-only" messages

### 3. **Better Analytics** 📊
- Query performance metrics from events
- Track tool approval patterns
- Analyze message threading patterns

### 4. **Audit Trail** 🔍
- Complete edit history
- Tool approval decisions
- Message delivery tracking

### 5. **Scalability** 🚀
- Events can be paginated efficiently
- Old events can be archived
- Query optimization via indexes

---

## Risks & Mitigation

### Risk 1: Storage Size Increase
**Impact:** Enhanced metadata increases storage by ~30-50%
**Mitigation:** 
- Make optional fields truly optional
- Add data retention policies (archive old events)
- Compress JSON payloads

### Risk 2: Legacy Event Handling
**Impact:** Old events don't have enhanced metadata
**Mitigation:**
- **Option A (Preferred):** Enrich at read-time from agent memories
- **Option B:** Append correction events (preserves immutability)
- Cache enriched results to avoid repeated calculation
- Keep agent memory as fallback during transition

### Risk 3: Event Immutability Principle
**Impact:** Cannot modify historical events to add metadata
**Solution:** 
- New events get full metadata from creation
- Legacy events handled via read-time enrichment or correction events
- Never modify original event records (violates event sourcing)

### Risk 3: Performance Impact
**Impact:** More metadata = slower queries
**Mitigation:**
- Add indexes on frequently queried meta fields
- Use database JSON functions for efficient filtering
- Cache frequently accessed data

### Risk 4: Backward Compatibility
**Impact:** Old code expects old schema
**Mitigation:**
- All new fields optional
- Graceful degradation if field missing
- Read-time enrichment provides missing fields transparently

### Risk 5: Performance Impact of Read-Time Enrichment
**Impact:** Calculating metadata on every read is expensive
**Mitigation:**
- Cache enriched events in memory (TTL-based)
- Only enrich when metadata actually needed (lazy loading)
- Add background job to append correction events for frequently accessed legacy events
- Eventually all events will be new events with full metadata

---

## Recommendation

### Immediate Actions (High Priority)

1. **Add Agent Ownership Metadata** 🔴
   - `ownerAgentIds`: Critical for filtering
   - `recipientAgentId`: Critical for message routing
   - `isMemoryOnly`: Important for UI styling

2. **Add Cross-Agent Message Metadata** 🔴
   - `messageDirection`: Important for flow tracking
   - `isCrossAgentMessage`: Important for filtering
   - `originalSender`: Important for attribution

3. **Add Threading Metadata** 🟡
   - `threadRootId`: Useful for thread queries
   - `threadDepth`: Useful for UI indentation
   - `isReply`: Quick filter flag

### Future Enhancements (Medium Priority)

4. **Add Edit History** 🟠
   - Track message modifications
   - Audit trail for debugging

5. **Add Tool Approval Tracking** 🟠
   - Complete approval decision history
   - Pattern analysis for auto-approval

### Optional Enhancements (Low Priority)

6. **Performance Metrics** 📊
   - Token usage tracking
   - Cost estimation
   - Latency monitoring

7. **UI State Metadata** 🎨
   - Streaming indicators
   - Tool call counts
   - Display hints

---

## Conclusion

**Current State:** Event storage captures basic event data but lacks critical metadata for reconstructing agent perspectives and supporting advanced features.

**Gap:** Missing agent ownership, cross-agent message tracking, threading metadata, and edit history.

**Impact:** Cannot switch to event-only approach without these fields. Agent filtering feature would break.

**Solution:** Enhance event metadata with agent ownership and message flow tracking. This is **required** before event storage can replace agent memory arrays as primary data source.

**Next Steps:**
1. Review this requirements document
2. Prioritize which metadata to add first
3. Create implementation plan with milestones
4. Begin with Phase 1: Add optional new fields
5. Test backward compatibility thoroughly
