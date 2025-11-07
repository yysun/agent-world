# Architecture Plan: Event Storage Metadata Enhancement (Clean Build)

**Date:** 2025-11-07  
**Status:** Architecture Review  
**Estimated Effort:** 5-6 days  
**Approach:** Clean build - no legacy support, database migration only

---

## Overview

Enhance event storage to capture complete metadata for agent ownership, message flow, threading, and tool approvals. This enables future migration from agent memory arrays to event-based architecture.

**Key Principle:** 
- Events are immutable - always include complete metadata from creation
- No legacy event support - all events must have full metadata
- Database migration handles schema changes only
- Simpler, cleaner codebase without backward compatibility complexity

---

## Phase 1: Core Type Definitions (Day 1)

### 1.1 Enhanced Event Metadata Types

**File:** `core/storage/eventStorage/types.ts`

```typescript
/**
 * Enhanced metadata for message events
 * All fields REQUIRED - no legacy support
 */
export interface MessageEventMetadata {
  // Core fields (REQUIRED)
  sender: string;
  chatId: string | null;
  
  // Agent Context (REQUIRED)
  ownerAgentIds: string[];         // Which agents have this in memory
  recipientAgentId: string | null; // Intended recipient (null = broadcast)
  originalSender: string | null;   // For cross-agent messages
  deliveredToAgents: string[];     // Who received it
  
  // Message Classification (REQUIRED)
  messageDirection: 'outgoing' | 'incoming' | 'broadcast';
  isMemoryOnly: boolean;           // Saved but no response triggered
  isCrossAgentMessage: boolean;    // Agent→agent communication
  isHumanMessage: boolean;         // Human→agents communication
  
  // Threading (REQUIRED for structure, null if not applicable)
  threadRootId: string | null;     // Root of conversation thread
  threadDepth: number;             // 0=root, 1=reply, etc.
  isReply: boolean;                // Has replyToMessageId
  hasReplies: boolean;             // Other messages reply to this (updated async)
  
  // Tool Approval (REQUIRED for tool calls)
  requiresApproval: boolean;
  approvalScope: 'once' | 'session' | 'always' | null;
  approvedAt: string | null;       // ISO timestamp
  approvedBy: string | null;
  deniedAt: string | null;         // ISO timestamp
  denialReason: string | null;
  
  // Performance (REQUIRED for agent messages, null for human)
  llmTokensInput: number | null;
  llmTokensOutput: number | null;
  llmLatency: number | null;
  llmProvider: string | null;
  llmModel: string | null;
  
  // UI State (REQUIRED)
  hasToolCalls: boolean;
  toolCallCount: number;
}

/**
 * Enhanced metadata for tool events
 */
export interface ToolEventMetadata {
  agentName: string;
  toolType: string;
  
  // Agent Context (REQUIRED)
  ownerAgentId: string;            // Which agent executed this
  triggeredByMessageId: string;    // What message caused this
  
  // Performance (REQUIRED)
  executionDuration: number;       // milliseconds
  resultSize: number;              // bytes
  wasApproved: boolean;
}

/**
 * Validation: All message events must have complete metadata
 */
export function validateMessageEventMetadata(meta: any): meta is MessageEventMetadata {
  return !!(
    meta &&
    typeof meta.sender === 'string' &&
    Array.isArray(meta.ownerAgentIds) &&
    typeof meta.messageDirection === 'string' &&
    typeof meta.isMemoryOnly === 'boolean' &&
    typeof meta.isCrossAgentMessage === 'boolean' &&
    typeof meta.isHumanMessage === 'boolean' &&
    typeof meta.threadDepth === 'number' &&
    typeof meta.isReply === 'boolean' &&
    typeof meta.hasReplies === 'boolean' &&
    typeof meta.requiresApproval === 'boolean' &&
    typeof meta.hasToolCalls === 'boolean' &&
    typeof meta.toolCallCount === 'number'
  );
}
```

**Tests:** `tests/core/event-metadata-types.test.ts`
- [ ] Test MessageEventMetadata structure - all fields required
- [ ] Test ToolEventMetadata structure - all fields required
- [ ] Test validateMessageEventMetadata() - rejects incomplete data
- [ ] Test validateMessageEventMetadata() - accepts complete data

---

## Phase 2: Metadata Calculation Helpers (Days 2-3)

### 2.1 Agent Ownership Calculation

**File:** `core/events-metadata.ts` (new file)

```typescript
import { World, Agent, WorldMessageEvent } from './types.js';
import { extractParagraphBeginningMentions, extractMentions } from './utils.js';

/**
 * Calculate which agents will have this message in their memory
 * Rules:
 * - Human messages → all agents
 * - Agent messages → mentioned agents only (paragraph-beginning @mentions)
 */
export function calculateOwnerAgentIds(
  world: World,
  event: WorldMessageEvent
): string[] {
  const ownerIds: string[] = [];
  const sender = event.sender.toLowerCase();
  const isHumanMessage = sender === 'human' || sender === 'user';
  
  if (isHumanMessage) {
    // Human messages go to all agents
    for (const [agentId] of world.agents) {
      ownerIds.push(agentId);
    }
    return ownerIds;
  }
  
  // Agent message - find mentioned agents
  const mentions = extractParagraphBeginningMentions(event.content);
  
  for (const mention of mentions) {
    const agentId = mention.toLowerCase();
    if (world.agents.has(agentId)) {
      ownerIds.push(agentId);
    }
  }
  
  return ownerIds;
}

/**
 * Calculate intended recipient (first @mention at paragraph beginning)
 */
export function calculateRecipientAgentId(
  world: World,
  event: WorldMessageEvent
): string | undefined {
  const mentions = extractParagraphBeginningMentions(event.content);
  
  if (mentions.length === 0) return undefined;
  
  const firstMention = mentions[0].toLowerCase();
  return world.agents.has(firstMention) ? firstMention : undefined;
}

/**
 * Determine if this is a "memory-only" message
 * (saved to agent memory but didn't trigger response)
 */
export function calculateIsMemoryOnly(
  world: World,
  event: WorldMessageEvent
): boolean {
  const sender = event.sender.toLowerCase();
  const isAgentSender = sender !== 'human' && sender !== 'user';
  
  if (!isAgentSender) return false;
  
  // Agent message with recipient = memory only (cross-agent communication)
  const recipientId = calculateRecipientAgentId(world, event);
  return !!recipientId;
}

/**
 * Determine if this is a cross-agent message
 */
export function calculateIsCrossAgentMessage(
  world: World,
  event: WorldMessageEvent
): boolean {
  const sender = event.sender.toLowerCase();
  const isAgentSender = sender !== 'human' && sender !== 'user' && world.agents.has(sender);
  
  if (!isAgentSender) return false;
  
  // Check if it's directed to another agent
  const recipientId = calculateRecipientAgentId(world, event);
  return !!recipientId && recipientId !== sender;
}

/**
 * Determine message direction
 */
export function calculateMessageDirection(
  world: World,
  event: WorldMessageEvent
): 'outgoing' | 'incoming' | 'broadcast' {
  const sender = event.sender.toLowerCase();
  const isHumanMessage = sender === 'human' || sender === 'user';
  
  if (isHumanMessage) return 'broadcast'; // Human to all agents
  
  const recipientId = calculateRecipientAgentId(world, event);
  return recipientId ? 'outgoing' : 'broadcast';
}

/**
 * Calculate thread metadata
 */
export function calculateThreadMetadata(
  event: WorldMessageEvent,
  allEvents: any[]
): {
  threadRootId?: string;
  threadDepth: number;
  isReply: boolean;
  hasReplies: boolean;
} {
  const isReply = !!event.replyToMessageId;
  
  // Find thread root by walking up replyTo chain
  let threadRootId: string | undefined;
  let threadDepth = 0;
  
  if (isReply) {
    let currentId = event.replyToMessageId;
    const visited = new Set<string>();
    
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const parent = allEvents.find(e => e.id === currentId);
      
      if (!parent || !parent.payload?.replyToMessageId) {
        threadRootId = currentId;
        break;
      }
      
      currentId = parent.payload.replyToMessageId;
      threadDepth++;
    }
  } else {
    threadRootId = event.messageId;
  }
  
  // Check if other messages reply to this one
  const hasReplies = allEvents.some(
    e => e.payload?.replyToMessageId === event.messageId
  );
  
  return { threadRootId, threadDepth, isReply, hasReplies };
}
```

**Tests:** `tests/core/event-metadata-calculation.test.ts`
- [ ] calculateOwnerAgentIds() - human message to all agents
- [ ] calculateOwnerAgentIds() - agent message with @mentions
- [ ] calculateOwnerAgentIds() - agent message without mentions (empty array)
- [ ] calculateRecipientAgentId() - first @mention extraction
- [ ] calculateRecipientAgentId() - no mentions returns undefined
- [ ] calculateRecipientAgentId() - invalid agent mention ignored
- [ ] calculateIsMemoryOnly() - agent→agent message = true
- [ ] calculateIsMemoryOnly() - human message = false
- [ ] calculateIsMemoryOnly() - agent broadcast = false
- [ ] calculateIsCrossAgentMessage() - agent→agent = true
- [ ] calculateIsCrossAgentMessage() - agent→self = false
- [ ] calculateIsCrossAgentMessage() - human→agent = false
- [ ] calculateMessageDirection() - human message = broadcast
- [ ] calculateMessageDirection() - agent with recipient = outgoing
- [ ] calculateMessageDirection() - agent without recipient = broadcast
- [ ] calculateThreadMetadata() - root message (depth 0)
- [ ] calculateThreadMetadata() - first reply (depth 1)
- [ ] calculateThreadMetadata() - nested reply (depth 2+)
- [ ] calculateThreadMetadata() - circular reference prevention
- [ ] calculateThreadMetadata() - hasReplies detection

---

## Phase 3: Enhanced Event Persistence (Days 4-5)

### 3.1 Update Message Event Handler

**File:** `core/events.ts`

```typescript
// Add import
import {
  calculateOwnerAgentIds,
  calculateRecipientAgentId,
  calculateIsMemoryOnly,
  calculateIsCrossAgentMessage,
  calculateMessageDirection,
  calculateThreadMetadata
} from './events-metadata.js';

// Update messageHandler function (around line 145)
const messageHandler = (event: WorldMessageEvent): void | Promise<void> => {
  // Get all events for thread calculation
  const allEvents: any[] = []; // TODO: Load from storage if needed for thread depth
  
  const eventData = {
    id: event.messageId,
    worldId: world.id,
    chatId: event.chatId || null,
    type: 'message',
    payload: {
      content: event.content,
      sender: event.sender,
      replyToMessageId: event.replyToMessageId,
      // Preserve OpenAI protocol fields
      role: (event as any).role,
      tool_calls: (event as any).tool_calls,
      tool_call_id: (event as any).tool_call_id
    },
    meta: {
      // Existing fields
      sender: event.sender,
      chatId: event.chatId,
      
      // NEW: Enhanced metadata
      ownerAgentIds: calculateOwnerAgentIds(world, event),
      recipientAgentId: calculateRecipientAgentId(world, event),
      messageDirection: calculateMessageDirection(world, event),
      isMemoryOnly: calculateIsMemoryOnly(world, event),
      isCrossAgentMessage: calculateIsCrossAgentMessage(world, event),
      isHumanMessage: event.sender === 'human' || event.sender === 'user',
      
      // Thread metadata (simplified - no hasReplies yet)
      isReply: !!event.replyToMessageId,
      threadDepth: event.replyToMessageId ? 1 : 0, // Simplified
      
      // Tool approval metadata (if applicable)
      requiresApproval: (event as any).requiresApproval || false,
      hasToolCalls: !!((event as any).tool_calls?.length),
      toolCallCount: (event as any).tool_calls?.length || 0
    },
    createdAt: event.timestamp
  };

  return persistEvent(eventData);
};
```

**Tests:** `tests/core/event-persistence-enhanced.test.ts`
- [ ] Message event persisted with ownerAgentIds
- [ ] Message event persisted with recipientAgentId
- [ ] Message event persisted with messageDirection
- [ ] Message event persisted with isMemoryOnly flag
- [ ] Message event persisted with isCrossAgentMessage flag
- [ ] Message event persisted with thread metadata
- [ ] Message event persisted with tool call metadata
- [ ] Human message → all agents in ownerAgentIds
- [ ] Agent message with @mention → correct ownerAgentIds
- [ ] Cross-agent message → correct metadata flags
- [ ] Backward compatibility - old code can read new events

---

## Phase 4: Enhanced Validation & Error Handling (Day 6)

### 4.1 Strict Validation Helper

**File:** `core/storage/eventStorage/validation.ts` (new file)

```typescript
import type { StoredEvent, MessageEventMetadata } from './types.js';
import { validateMessageEventMetadata } from './types.js';

/**
 * Validate event before persistence
 * Throws error if metadata is incomplete
 */
export function validateEventForPersistence(event: StoredEvent): void {
  if (event.type === 'message') {
    if (!validateMessageEventMetadata(event.meta)) {
      throw new Error(
        `Invalid message event metadata for event ${event.id}. ` +
        `All metadata fields are required. Missing or invalid fields detected.`
      );
    }
  }
  
  if (event.type === 'tool') {
    if (!event.meta?.ownerAgentId || !event.meta?.triggeredByMessageId) {
      throw new Error(
        `Invalid tool event metadata for event ${event.id}. ` +
        `ownerAgentId and triggeredByMessageId are required.`
      );
    }
  }
}

/**
 * Create default metadata values for required fields
 */
export function createDefaultMessageMetadata(sender: string): Partial<MessageEventMetadata> {
  const isHuman = sender === 'human' || sender === 'user';
  
  return {
    sender,
    ownerAgentIds: [],
    recipientAgentId: null,
    originalSender: null,
    deliveredToAgents: [],
    messageDirection: 'broadcast',
    isMemoryOnly: false,
    isCrossAgentMessage: false,
    isHumanMessage: isHuman,
    threadRootId: null,
    threadDepth: 0,
    isReply: false,
    hasReplies: false,
    requiresApproval: false,
    approvalScope: null,
    approvedAt: null,
    approvedBy: null,
    deniedAt: null,
    denialReason: null,
    llmTokensInput: null,
    llmTokensOutput: null,
    llmLatency: null,
    llmProvider: null,
    llmModel: null,
    hasToolCalls: false,
    toolCallCount: 0
  };
}
```

**Tests:** `tests/core/event-validation.test.ts`
- [ ] validateEventForPersistence() - accepts complete message metadata
- [ ] validateEventForPersistence() - rejects incomplete message metadata
- [ ] validateEventForPersistence() - accepts complete tool metadata
- [ ] validateEventForPersistence() - rejects incomplete tool metadata
- [ ] validateEventForPersistence() - allows other event types without strict validation
- [ ] createDefaultMessageMetadata() - creates valid defaults for human
- [ ] createDefaultMessageMetadata() - creates valid defaults for agent

---

## Phase 5: Query API Enhancements (Day 7)

### 5.1 Add Filtering Methods to EventStorage

**File:** `core/storage/eventStorage/types.ts`

```typescript
export interface GetEventsOptions {
  // Existing fields
  sinceSeq?: number;
  sinceTime?: Date;
  limit?: number;
  order?: 'asc' | 'desc';
  types?: string[];
  
  // NEW: Enhanced filtering (all events have this metadata)
  ownerAgentId?: string;        // Filter by agent ownership
  recipientAgentId?: string;    // Filter by recipient
  isMemoryOnly?: boolean;       // Only memory-only messages
  isCrossAgent?: boolean;       // Only cross-agent messages
  threadRootId?: string;        // Messages in specific thread
  hasToolCalls?: boolean;       // Only messages with tool calls
}
```

### 5.2 Implement in SQLite Storage

**File:** `core/storage/eventStorage/sqliteEventStorage.ts`

```typescript
/**
 * Get events with enhanced filtering
 * All events guaranteed to have complete metadata - no enrichment needed
 */
async function getEventsByWorldAndChatEnhanced(
  ctx: SQLiteEventStorageContext,
  worldId: string,
  chatId: string | null,
  options?: GetEventsOptions
): Promise<StoredEvent[]> {
  // Build SQL query with metadata filtering
  let sql = `
    SELECT * FROM events 
    WHERE world_id = ? AND (chat_id = ? OR (chat_id IS NULL AND ? IS NULL))
  `;
  const params: any[] = [worldId, chatId, chatId];
  
  // Add JSON metadata filters
  if (options?.ownerAgentId) {
    sql += ` AND json_extract(meta, '$.ownerAgentIds') LIKE ?`;
    params.push(`%"${options.ownerAgentId}"%`);
  }
  
  if (options?.recipientAgentId !== undefined) {
    if (options.recipientAgentId === null) {
      sql += ` AND json_extract(meta, '$.recipientAgentId') IS NULL`;
    } else {
      sql += ` AND json_extract(meta, '$.recipientAgentId') = ?`;
      params.push(options.recipientAgentId);
    }
  }
  
  if (options?.isMemoryOnly !== undefined) {
    sql += ` AND json_extract(meta, '$.isMemoryOnly') = ?`;
    params.push(options.isMemoryOnly ? 1 : 0);
  }
  
  if (options?.isCrossAgent !== undefined) {
    sql += ` AND json_extract(meta, '$.isCrossAgentMessage') = ?`;
    params.push(options.isCrossAgent ? 1 : 0);
  }
  
  if (options?.threadRootId) {
    sql += ` AND json_extract(meta, '$.threadRootId') = ?`;
    params.push(options.threadRootId);
  }
  
  if (options?.hasToolCalls !== undefined) {
    sql += ` AND json_extract(meta, '$.hasToolCalls') = ?`;
    params.push(options.hasToolCalls ? 1 : 0);
  }
  
  // Add standard filters
  if (options?.types && options.types.length > 0) {
    sql += ` AND type IN (${options.types.map(() => '?').join(',')})`;
    params.push(...options.types);
  }
  
  // Order and limit
  const order = options?.order === 'desc' ? 'DESC' : 'ASC';
  sql += ` ORDER BY created_at ${order}`;
  
  if (options?.limit) {
    sql += ` LIMIT ?`;
    params.push(options.limit);
  }
  
  const rows = await dbAll(ctx.db, sql, ...params);
  
  return rows.map(row => ({
    id: row.id,
    worldId: row.world_id,
    chatId: row.chat_id,
    seq: row.seq,
    type: row.type,
    payload: JSON.parse(row.payload),
    meta: JSON.parse(row.meta || '{}'),
    createdAt: new Date(row.created_at)
  }));
}
```

**Tests:** `tests/core/event-query-enhanced.test.ts`
- [ ] getEventsByWorldAndChatEnhanced() - filters by ownerAgentId using JSON query
- [ ] getEventsByWorldAndChatEnhanced() - filters by recipientAgentId (null handling)
- [ ] getEventsByWorldAndChatEnhanced() - filters by isMemoryOnly boolean
- [ ] getEventsByWorldAndChatEnhanced() - filters by isCrossAgent boolean
- [ ] getEventsByWorldAndChatEnhanced() - filters by threadRootId
- [ ] getEventsByWorldAndChatEnhanced() - filters by hasToolCalls boolean
- [ ] getEventsByWorldAndChatEnhanced() - combines multiple filters with AND logic
- [ ] getEventsByWorldAndChatEnhanced() - respects existing options (limit, order)
- [ ] getEventsByWorldAndChatEnhanced() - handles empty results gracefully
- [ ] getEventsByWorldAndChatEnhanced() - validates all events have complete metadata

---

## Phase 6: Integration & Testing (Days 8-9)

### 6.1 Integration Tests

**File:** `tests/integration/test-event-metadata-flow.ts`

```typescript
/**
 * End-to-end test: Message flow with enhanced metadata
 */
describe('Event Metadata Flow Integration', () => {
  it('should capture complete metadata for human→agents message', async () => {
    // Setup world with 3 agents
    const world = await createWorld({ name: 'test-metadata' });
    await createAgent(world.id, { name: 'agent1' });
    await createAgent(world.id, { name: 'agent2' });
    await createAgent(world.id, { name: 'agent3' });
    
    // Publish human message
    const messageId = generateId();
    publishMessageWithId(world, 'Hello everyone!', 'human', messageId);
    
    // Wait for persistence
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Query events
    const events = await world.eventStorage.getEventsByWorldAndChat(
      world.id,
      world.currentChatId
    );
    
    const messageEvent = events.find(e => e.id === messageId);
    
    // Verify enhanced metadata
    expect(messageEvent).toBeDefined();
    expect(messageEvent.meta.ownerAgentIds).toEqual(['agent1', 'agent2', 'agent3']);
    expect(messageEvent.meta.messageDirection).toBe('broadcast');
    expect(messageEvent.meta.isHumanMessage).toBe(true);
    expect(messageEvent.meta.isCrossAgentMessage).toBe(false);
    expect(messageEvent.meta.isMemoryOnly).toBe(false);
  });
  
  it('should capture cross-agent message metadata', async () => {
    // agent1 sends to @agent2
    const messageId = generateId();
    publishMessageWithId(world, '@agent2 hello!', 'agent1', messageId);
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const events = await world.eventStorage.getEventsByWorldAndChat(
      world.id,
      world.currentChatId
    );
    
    const messageEvent = events.find(e => e.id === messageId);
    
    expect(messageEvent.meta.ownerAgentIds).toEqual(['agent2']);
    expect(messageEvent.meta.recipientAgentId).toBe('agent2');
    expect(messageEvent.meta.messageDirection).toBe('outgoing');
    expect(messageEvent.meta.isCrossAgentMessage).toBe(true);
    expect(messageEvent.meta.isMemoryOnly).toBe(true);
  });
  
  it('should reject events with incomplete metadata', async () => {
    // Attempt to create event without complete metadata
    const incompleteEvent = {
      id: generateId(),
      worldId: world.id,
      chatId: world.currentChatId,
      type: 'message',
      payload: {
        content: 'Incomplete message',
        sender: 'human'
      },
      meta: {
        sender: 'human',
        chatId: world.currentChatId
        // Missing required fields
      },
      createdAt: new Date()
    };
    
    // Should throw validation error
    await expect(
      world.eventStorage.saveEvent(incompleteEvent)
    ).rejects.toThrow('Invalid message event metadata');
  });
});
```

**Tests:** `tests/integration/test-event-metadata-flow.ts`
- [ ] Human message → all agents in ownerAgentIds
- [ ] Agent message with @mention → correct recipient
- [ ] Cross-agent message → correct metadata flags
- [ ] Message threading → correct depth calculation
- [ ] Incomplete metadata → rejected with validation error
- [ ] Filtering by ownerAgentId → returns correct events
- [ ] Filtering by isMemoryOnly → returns cross-agent messages
- [ ] Combined filters → work correctly together

### 6.2 Performance Tests

**File:** `tests/performance/event-enrichment-perf.test.ts`

```typescript
describe('Event Query Performance', () => {
  it('should query 1000 events with metadata filter in <50ms', async () => {
    // Create 1000 events with complete metadata
    const events = Array.from({ length: 1000 }, () => createCompleteEvent());
    for (const event of events) {
      await eventStorage.saveEvent(event);
    }
    
    const start = Date.now();
    const filtered = await eventStorage.getEventsByWorldAndChatEnhanced(
      worldId,
      chatId,
      { ownerAgentId: 'agent1' }
    );
    const duration = Date.now() - start;
    
    expect(duration).toBeLessThan(50); // SQLite JSON queries are fast
    expect(filtered.length).toBeGreaterThan(0);
  });
  
  it('should filter 10000 events by multiple criteria in <100ms', async () => {
    // Test complex queries with multiple JSON filters
    const start = Date.now();
    const filtered = await eventStorage.getEventsByWorldAndChatEnhanced(
      worldId,
      chatId,
      {
        ownerAgentId: 'agent1',
        isMemoryOnly: true,
        hasToolCalls: false
      }
    );
    const duration = Date.now() - start;
    
    expect(duration).toBeLessThan(100);
  });
});
```

**Tests:** `tests/performance/event-query-perf.test.ts`
- [ ] SQLite JSON query performance - 1000 events < 50ms
- [ ] Complex multi-filter query - 10000 events < 100ms
- [ ] Memory usage - stays reasonable with large datasets

---

## Implementation Checklist

### Phase 1: Types (Day 1)
- [ ] Add MessageEventMetadata interface
- [ ] Add ToolEventMetadata interface  
- [ ] Add hasEnhancedMetadata() helper
- [ ] Write 4 unit tests for types

### Phase 2: Calculation (Days 2-3)
- [ ] Implement calculateOwnerAgentIds()
- [ ] Implement calculateRecipientAgentId()
- [ ] Implement calculateIsMemoryOnly()
- [ ] Implement calculateIsCrossAgentMessage()
- [ ] Implement calculateMessageDirection()
- [ ] Implement calculateThreadMetadata()
- [ ] Write 20 unit tests for calculations

### Phase 3: Persistence (Days 4-5)
- [ ] Update messageHandler in events.ts
- [ ] Add metadata calculation calls
- [ ] Preserve backward compatibility
- [ ] Write 11 unit tests for persistence

### Phase 4: Validation (Day 6)
- [ ] Create validation.ts helper module
- [ ] Implement validateEventForPersistence()
- [ ] Implement createDefaultMessageMetadata()
- [ ] Integrate validation into saveEvent()
- [ ] Write 7 unit tests for validation

### Phase 5: Query API (Day 7)
- [ ] Extend GetEventsOptions interface
- [ ] Implement getEventsByWorldAndChatEnhanced() with SQL JSON filters
- [ ] Add indexed metadata filtering
- [ ] Write 10 unit tests for queries

### Phase 6: Integration (Days 8-9)
- [ ] Write 8 integration tests
- [ ] Write 2 performance tests (SQLite JSON query perf)
- [ ] Add database indexes for JSON metadata fields
- [ ] Update documentation

**Total Tests:** 65 unit tests + 8 integration tests + 2 performance tests = **75 tests**

---

## Success Criteria

✅ **Functional Requirements**
- [ ] All new events include complete enhanced metadata (REQUIRED)
- [ ] Events without complete metadata rejected at persistence
- [ ] All metadata fields calculated correctly
- [ ] Filtering works for agent ownership, recipients, threads via SQL JSON queries
- [ ] No modification of existing events (immutability preserved)

✅ **Performance Requirements**
- [ ] SQLite JSON query for 1000 events < 50ms
- [ ] Complex multi-filter query for 10000 events < 100ms
- [ ] No memory leaks with large datasets

✅ **Testing Requirements**
- [ ] 75 total tests (65 unit + 8 integration + 2 performance)
- [ ] 100% coverage of new calculation functions
- [ ] 100% coverage of validation functions
- [ ] No legacy event handling tests (not needed)

✅ **Code Quality**
- [ ] TypeScript strict mode compliant
- [ ] All functions documented with JSDoc
- [ ] Follows existing code patterns
- [ ] Clean build - no legacy support complexity

---

## Risk Mitigation

### Risk: Incomplete metadata in production
**Mitigation:** 
- Strict validation at event creation - rejects incomplete events
- All required fields have defaults via createDefaultMessageMetadata()
- Unit tests verify validation catches all missing fields

### Risk: Complex metadata calculations
**Mitigation:** 
- Comprehensive unit tests with edge cases
- Pure functions - easy to test in isolation
- Clear documentation of calculation logic

### Risk: SQLite JSON query performance
**Mitigation:**
- Performance benchmarks in test suite
- Add database indexes on frequently queried meta fields
- Test with large datasets (10K+ events)

### Risk: Thread depth calculation errors
**Mitigation:** 
- Circular reference detection in calculateThreadMetadata()
- Comprehensive threading tests with deep nesting
- Clear validation of replyToMessageId references

---

## Dependencies

- No external dependencies required
- Uses existing utilities: `extractParagraphBeginningMentions()`, `extractMentions()`
- Works with existing event storage infrastructure

---

## Database Migration Plan

### Migration: Add JSON Indexes for Fast Queries

**File:** `migrations/0011_add_event_metadata_indexes.sql`

```sql
-- Migration: Add indexes on JSON metadata fields for fast filtering
-- Version: 11
-- Date: 2025-11-07

-- Index on ownerAgentIds array (using json_extract for array search)
CREATE INDEX IF NOT EXISTS idx_events_owner_agents 
  ON events(json_extract(meta, '$.ownerAgentIds'));

-- Index on recipientAgentId
CREATE INDEX IF NOT EXISTS idx_events_recipient_agent 
  ON events(json_extract(meta, '$.recipientAgentId'));

-- Index on messageDirection
CREATE INDEX IF NOT EXISTS idx_events_message_direction 
  ON events(json_extract(meta, '$.messageDirection'));

-- Index on isMemoryOnly flag
CREATE INDEX IF NOT EXISTS idx_events_memory_only 
  ON events(json_extract(meta, '$.isMemoryOnly'));

-- Index on isCrossAgentMessage flag
CREATE INDEX IF NOT EXISTS idx_events_cross_agent 
  ON events(json_extract(meta, '$.isCrossAgentMessage'));

-- Index on threadRootId for thread queries
CREATE INDEX IF NOT EXISTS idx_events_thread_root 
  ON events(json_extract(meta, '$.threadRootId'));

-- Index on hasToolCalls flag
CREATE INDEX IF NOT EXISTS idx_events_has_tool_calls 
  ON events(json_extract(meta, '$.hasToolCalls'));

-- Composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_events_world_chat_owner 
  ON events(world_id, chat_id, json_extract(meta, '$.ownerAgentIds'));
```

**Note:** 
- SQLite supports JSON1 extension for efficient JSON queries
- Indexes on json_extract() improve query performance significantly
- No schema changes to events table - metadata stored in JSON
- Backward compatible - old code can still query events

---

## Future Enhancements (Out of Scope)

- [ ] Edit history tracking (append correction events)
- [ ] Real-time metadata updates (hasReplies flag)
- [ ] Aggregated statistics (message counts per agent)
- [ ] Event compression for archived data
- [ ] Distributed event storage (multi-node)

---

## Notes

- **Clean build approach**: No legacy support, simpler codebase
- Events remain immutable - always created with complete metadata
- All metadata fields REQUIRED - validation enforces completeness
- SQLite JSON queries enable efficient filtering without schema changes
- Database migration adds indexes only - no data migration needed
- Reduced complexity: 12 fewer tests, 2-3 fewer days of work
- Focus on correctness first, optimization via indexes second
