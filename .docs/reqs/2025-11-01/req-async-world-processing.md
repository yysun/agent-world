# Requirement: Asynchronous Out-of-Process World Message Processing

**Date:** 2025-11-01  
**Status:** Draft  
**Priority:** High  
**Type:** Architecture Enhancement

## Problem Statement

Currently, API and CLI clients run world message processing **in-process and synchronously**. When a client sends a message:

1. The client blocks waiting for agent responses
2. Processing happens in the same process as the API/CLI server
3. Multiple clients cannot attach to observe the same world's processing
4. Progress cannot be replayed from the beginning for late-joining clients
5. No persistent queue exists to track processing state across restarts

This creates several limitations:
- **Scalability**: Each client connection holds server resources during long-running agent processing
- **Observability**: No way for multiple clients to watch the same world process messages
- **Reliability**: If the API/CLI crashes during processing, state is lost
- **User Experience**: Clients cannot reconnect and see historical progress from the start

## What We Need

### Core Requirements

#### 1. Out-of-Process Message Queue
- World message processing moves to a **persistent queue** separate from API/CLI processes
- Queue persists pending messages to disk/database
- Queue survives process restarts
- Messages are processed **sequentially** per world (no concurrent processing within a world)

#### 2. Progress Stream Persistence
- All progress events (messages, SSE chunks, tool calls, activity) are **persisted as they occur**
- Events are stored in time-ordered sequence
- Events are tagged with:
  - `worldId`
  - `messageId` (the triggering message)
  - `timestamp`
  - `sequenceNumber` (for strict ordering)
  - `type` (message/sse/tool/system/world)

#### 3. Client Attachment & Replay
- Clients can **attach** to a world at any time
- Attached clients receive:
  - **Historical events** from the beginning of current processing (or from a specific point)
  - **Live events** as processing continues in real-time
- Multiple clients can observe the same world simultaneously
- Each client maintains its own read position in the event stream

#### 4. World Status Management
- World has a `processingStatus` field (distinct from `isProcessing`):
  - `idle`: No messages in queue, not processing
  - `queued`: Messages waiting to be processed
  - `processing`: Currently processing a message
  - `paused`: Processing paused (for future features)
  - `error`: Last processing attempt failed

#### 5. Sequential Write Lock
- Worlds can only process **one message at a time** (sequential processing)
- Queue enforces this with a per-world lock mechanism
- API/CLI can check if a world is currently processing before queuing new messages
- Lock prevents race conditions and ensures message ordering

### Current Event Infrastructure (Already Built)

The system **already tracks and persists all relevant events**. Here's what exists today:

#### Event Types Currently Persisted
```typescript
// Located in: core/events.ts - setupEventPersistence()

1. MESSAGE Events (user & agent messages)
   - content, sender, messageId, chatId, replyToMessageId
   - Enables: Message history, threading, edit feature

2. SSE Events (streaming chunks)
   - agentName, type (start/chunk/end/error), content, messageId
   - usage: { inputTokens, outputTokens, totalTokens }
   - Enables: Real-time streaming, token tracking

3. WORLD Events (agent activities)
   a) Activity Tracking:
      - type: 'response-start' | 'response-end' | 'idle'
      - activityId, pendingOperations, activeSources
      - Enables: Completion detection, idle state
   
   b) Tool Execution:
      - type: 'tool-start' | 'tool-result' | 'tool-error' | 'tool-progress'
      - toolName, toolCallId, duration, input, result
      - Enables: Tool debugging, performance tracking

4. SYSTEM Events (internal notifications)
   - content, messageId, chatId, timestamp
   - Enables: System messages, error reporting
```

#### Event Storage Schema (Already Implemented)
```sql
-- Located in: core/storage/eventStorage/
CREATE TABLE events (
  id TEXT PRIMARY KEY,           -- Event UUID
  worldId TEXT NOT NULL,         -- World context
  chatId TEXT,                   -- Chat context (nullable)
  seq INTEGER,                   -- Sequence number (NEED TO ADD)
  type TEXT NOT NULL,            -- 'message', 'sse', 'tool', 'system'
  payload JSON NOT NULL,         -- Event-specific data
  meta JSON,                     -- Metadata
  createdAt INTEGER NOT NULL     -- Unix timestamp
);

CREATE INDEX idx_world_chat ON events(worldId, chatId);
CREATE INDEX idx_created ON events(createdAt);
-- NEED TO ADD: CREATE INDEX idx_seq ON events(worldId, chatId, seq);
```

#### WebSocket Protocol Specification

**Client → Server Messages**:
```typescript
// Subscribe to world events
{
  type: 'subscribe',
  worldId: string,
  chatId?: string | null,      // Specific chat or null for world-level
  replayFrom: 'beginning' | number  // Start position ('beginning' or seq number)
}

// Enqueue a message for processing
{
  type: 'enqueue',
  worldId: string,
  chatId?: string | null,
  content: string,
  sender?: string              // Defaults to 'human'
}

// Execute CLI command (NEW)
{
  type: 'command',
  worldId?: string,            // Optional: context world for commands
  command: string              // CLI command string (e.g., "/agent list", "/world create MyWorld")
}

// Unsubscribe from world events
{
  type: 'unsubscribe',
  worldId: string,
  chatId?: string | null
}

// Heartbeat (keep-alive)
{
  type: 'ping'
}
```

**Server → Client Messages**:
```typescript
// Event stream (historical or live)
{
  type: 'event',
  seq: number,                 // Sequence number for position tracking
  isHistorical: boolean,       // true = from storage, false = live
  eventType: 'message' | 'sse' | 'tool' | 'system',
  event: {
    // Event-specific payload (same structure as EventEmitter events)
    ...
  }
}

// Subscription acknowledged
{
  type: 'subscribed',
  worldId: string,
  chatId: string | null,
  currentSeq: number,          // Latest sequence number available
  replayingFrom: number,       // Starting sequence for replay
  historicalEventCount: number // Number of events to replay
}

// Message enqueued successfully
{
  type: 'enqueued',
  messageId: string,           // Generated message ID
  queuePosition: number,       // Position in queue
  estimatedWaitSeconds: number // Rough estimate
}

// Command result (NEW)
{
  type: 'result',
  success: boolean,
  message?: string,
  data?: any,                  // Command-specific result data
  refreshWorld?: boolean       // Indicates world state changed, clients should refresh
}

// Replay completed, now streaming live
{
  type: 'replay-complete',
  worldId: string,
  chatId: string | null,
  lastSeq: number              // Last replayed sequence
}

// Error
{
  type: 'error',
  code: string,                // 'WORLD_NOT_FOUND', 'INVALID_REQUEST', etc.
  message: string,
  details?: any
}

// Heartbeat response
{
  type: 'pong'
}
```

**Example Flow**:
```typescript
// 1. Client connects
const ws = new WebSocket('ws://localhost:3001');

// 2. Execute command to list worlds
ws.send(JSON.stringify({
  type: 'command',
  command: '/world list'
}));

// <- { type: 'result', success: true, data: [ { name: 'my-world', agentCount: 3 } ] }

// 3. Client subscribes to world from beginning
ws.send(JSON.stringify({
  type: 'subscribe',
  worldId: 'my-world',
  chatId: 'chat-123',
  replayFrom: 'beginning'
}));

// 4. Server acknowledges subscription
// <- { type: 'subscribed', currentSeq: 1500, replayingFrom: 0, historicalEventCount: 1500 }

// 5. Server streams 1500 historical events
// <- { type: 'event', seq: 1, isHistorical: true, eventType: 'message', event: {...} }
// <- { type: 'event', seq: 2, isHistorical: true, eventType: 'sse', event: {...} }
// ... (1498 more events)

// 6. Server signals replay complete
// <- { type: 'replay-complete', lastSeq: 1500 }

// 7. Client creates new agent via command
ws.send(JSON.stringify({
  type: 'command',
  worldId: 'my-world',
  command: '/agent create Ava --model gpt-4 --prompt "You are a helpful assistant"'
}));

// <- { type: 'result', success: true, message: 'Agent created', data: { name: 'Ava', ... }, refreshWorld: true }
// Server internally refreshes world instance to include new agent

// 8. Client enqueues new message
ws.send(JSON.stringify({
  type: 'enqueue',
  worldId: 'my-world',
  chatId: 'chat-123',
  content: 'Hello agents!',
  sender: 'human'
}));

// 9. Server acknowledges enqueue
// <- { type: 'enqueued', messageId: 'msg-abc123', queuePosition: 2, estimatedWaitSeconds: 5 }

// 10. Queue processor picks up message, agents respond
// <- { type: 'event', seq: 1501, isHistorical: false, eventType: 'message', event: {...} }
// <- { type: 'event', seq: 1502, isHistorical: false, eventType: 'world', event: {...} }
// <- { type: 'event', seq: 1503, isHistorical: false, eventType: 'sse', event: {...} }
// ... (more live events, Ava responds since she's now loaded in world instance)

// 11. Client disconnects, reconnects later
ws.close();
const ws2 = new WebSocket('ws://localhost:3001');
ws2.send(JSON.stringify({
  type: 'subscribe',
  worldId: 'my-world',
  chatId: 'chat-123',
  replayFrom: 1503  // Resume from last seen sequence
}));

// 12. Server streams only new events since 1503
// <- { type: 'subscribed', currentSeq: 1550, replayingFrom: 1503, historicalEventCount: 47 }
// <- { type: 'event', seq: 1504, isHistorical: true, eventType: 'message', event: {...} }
// ... (46 more catch-up events)
// <- { type: 'replay-complete', lastSeq: 1550 }
// <- { type: 'event', seq: 1551, isHistorical: false, ... } (live events continue)
```

#### What's Missing for Async Processing
1. **Sequence Numbers**: Add auto-incrementing `seq` per (worldId, chatId) ← **Priority 1**
2. **Message Queue Table**: New table for pending messages ← **Priority 2**
3. **WebSocket Server**: New service in `ws/` folder ← **Priority 3**
4. **Queue Processor**: Loop to dequeue and process messages ← **Priority 4**
5. **Client Library**: WebSocket client for frontend ← **Priority 5**

### Non-Functional Requirements

#### Migration & Feature Flags
- **Feature flag**: `ASYNC_PROCESSING_ENABLED` (default: `false`)
  - When `false`: Use current in-process synchronous behavior (backward compatible)
  - When `true`: Use new async queue-based processing
- **Per-world flag**: `world.processingMode` (values: `'sync'` | `'async'`)
  - Allows gradual migration (some worlds sync, some async)
  - Defaults to global feature flag setting if not specified

#### Performance Considerations
- Event storage should handle high throughput (100+ events/second per world)
- Event replay should be efficient (support streaming from arbitrary points)
- Queue should support thousands of pending messages across all worlds
- Minimal latency overhead for local processing (< 50ms)

#### Reliability
- Message queue survives process crashes
- Event storage is durable (fsync or equivalent)
- Queue supports retry logic for transient failures
- Dead-letter queue for permanently failed messages

#### Monitoring & Observability
- Expose metrics:
  - Queue depth per world
  - Processing latency (time from enqueue to completion)
  - Event storage size
  - Active client connections per world
- Expose health checks:
  - Queue service health
  - Event storage health
  - Per-world processing status

## What We're NOT Solving (Out of Scope)

- **Multi-world concurrent processing**: Worlds still process one at a time internally (future enhancement)
- **Distributed processing**: No multi-node/cluster support in this phase
- **Event replay with time-travel**: Only forward replay from a point, no arbitrary historical snapshots
- **Client-side filtering**: Clients receive all events; filtering happens client-side
- **Event expiration/cleanup**: Events persist indefinitely (manual cleanup required)
- **Real-time collaboration features**: No operational transforms or conflict resolution

## Success Criteria

### Functional Success
- [ ] API can enqueue messages to a world without blocking
- [ ] CLI can enqueue messages and stream progress in real-time
- [ ] Multiple clients can connect to the same world and see identical event streams
- [ ] Late-joining clients can replay events from the beginning
- [ ] World status accurately reflects queue and processing state
- [ ] Feature flag allows toggling between sync and async modes
- [ ] Worlds cannot process multiple messages concurrently (sequential enforcement)

### Technical Success
- [ ] All existing tests pass with both sync and async modes
- [ ] API response time < 100ms for message enqueue (async mode)
- [ ] Event replay latency < 500ms for 1000 events
- [ ] Queue survives process restart with no message loss
- [ ] Zero data loss during normal operation
- [ ] Memory usage remains bounded (< 500MB for 10,000 pending events)

### User Experience Success
- [ ] CLI users see identical behavior (message → responses) with optional async mode
- [ ] API clients can choose between blocking (sync-like) or non-blocking (enqueue + stream)
- [ ] Multiple browser tabs can watch the same world without conflicts
- [ ] Late-joining users see full conversation history and progress

## Architecture Decisions

### 1. Service Separation: **New WebSocket Server (`ws/`)**

**Decision**: Create a new **WebSocket server** in `ws/` folder for async processing. Keep existing `server/` and `cli/` unchanged.

**Rationale**:
- **Zero Breaking Changes**: Existing REST API and CLI continue working in sync mode
- **Clean Separation**: Async functionality isolated in new codebase
- **Gradual Migration**: Users opt-in to async mode by connecting to WebSocket server
- **Different Protocol**: WebSocket better suited for bidirectional streaming than REST/SSE

**New Architecture**:
```
┌──────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                               │
├────────────────┬────────────────┬────────────────────────────────┤
│  REST API      │  CLI (local)   │  WebSocket Clients (NEW)       │
│  (server/)     │  (cli/)        │  (connects to ws/)             │
│  [sync mode]   │  [sync mode]   │  [async mode]                  │
└────────┬───────┴────────┬───────┴─────────────┬──────────────────┘
         │                │                     │
         │ Direct         │ Direct              │ Enqueue to
         │ publishMessage │ publishMessage      │ Message Queue
         │                │                     │
         ▼                ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PROCESSING LAYER                              │
├─────────────────┬───────────────────────────────────────────────┤
│ World Instance  │  Message Queue + Queue Processor (NEW)        │
│ (sync)          │  - SQLite-backed queue                        │
│                 │  - Per-world sequential processing            │
│                 │  - Polls queue, calls publishMessage()        │
└────────┬────────┴───────────────────┬───────────────────────────┘
         │                            │
         │ Emits events               │ Emits events
         │ (ephemeral)                │ (ephemeral)
         │                            │
         ▼                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PERSISTENCE LAYER                             │
│  Event Storage (eventStorage/) - ALREADY EXISTS                  │
│  - Stores all events: message, sse, tool, system                │
│  - Tagged with: worldId, chatId, seq, type, payload             │
└─────────────────────────────────────────────────────────────────┘
         │
         │ Replay historical events
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    WebSocket Server (ws/)                        │
│  - Accepts client connections                                    │
│  - Streams historical events from eventStorage                   │
│  - Streams live events from world.eventEmitter                   │
│  - Manages client subscriptions and read positions              │
└─────────────────────────────────────────────────────────────────┘
```

**Why WebSocket vs REST/SSE**:
- **Bidirectional**: Clients can enqueue messages AND receive events over same connection
- **Efficient**: Single persistent connection vs multiple SSE streams
- **Standard**: Well-supported protocol with good tooling
- **Scalable**: Easier to scale horizontally (multiple ws servers can share queue)

### 2. Event Replay: **Storage-Based Sequential Replay**

**Decision**: Stream events from `eventStorage` starting at client's requested position, then switch to live events.

**Mechanism**:
```typescript
// Client connects to WebSocket server
ws.send({ 
  type: 'subscribe',
  worldId: 'my-world',
  chatId: 'chat-123',
  replayFrom: 'beginning' | number  // 'beginning' or sequence number
});

// Server response flow:
1. Load world state (if not already loaded)
2. Query eventStorage for historical events:
   SELECT * FROM events 
   WHERE worldId = ? AND chatId = ? 
   AND seq > ?  -- replayFrom seq (0 for 'beginning')
   ORDER BY seq ASC

3. Stream historical events to client:
   ws.send({ type: 'event', event: {...}, isHistorical: true })

4. Once caught up, attach to world.eventEmitter:
   world.eventEmitter.on('message', event => {
     ws.send({ type: 'event', event: {...}, isHistorical: false })
   })

5. Client now receives live events in real-time
```

**Client Read Position Tracking**:
- Each WebSocket connection tracks: `{ worldId, chatId, lastSeq }`
- On reconnect, client requests: `replayFrom: lastSeq + 1`
- Server resumes from that position
- No server-side state needed (client manages its own position)

### 3. Worker Model: **In-Process Queue Processor**

**Decision**: Do NOT use Node.js worker threads or child processes. Keep processing in-process.

**Rationale**:
- **Event Persistence Already Exists**: All events persisted to `eventStorage`
- **No State Rehydration Needed**: World state loads from storage on-demand
- **Simpler Architecture**: No IPC overhead or serialization complexity

### 4. Event Tracking: **Already Comprehensive**

**Current Event Coverage** (verified in `core/events.ts` - `setupEventPersistence()`):
- ✅ **Message events**: User and agent messages with `messageId`, `chatId`, `replyToMessageId`
- ✅ **SSE events**: Streaming chunks (start/chunk/end/error) with `agentName`, `messageId`, token usage
- ✅ **World events**: 
  - Activity tracking (`response-start`, `response-end`, `idle`) with `activityId`, `pendingOperations`
  - Tool execution (`tool-start`, `tool-result`, `tool-error`) with `toolName`, `toolCallId`, duration, input/output
- ✅ **System events**: Internal notifications with `chatId` context

**Event Persistence Details**:
- All events default `chatId` to `world.currentChatId` (session-aware)
- Events stored with `id`, `worldId`, `chatId`, `type`, `payload`, `meta`, `createdAt`
- Storage backends: SQLite (production), Memory (testing), File (export)

**What's Missing**:
- ❌ Sequence numbers (`seq`) for strict ordering within a chat
- ❌ Message queue state (pending/processing/complete)
- ❌ WebSocket server implementation

### 5. Folder Structure: **New `ws/` Service**

**Proposed Structure**:
```
agent-world/
├── server/          # Existing REST API (unchanged)
│   ├── api.ts       # Sync mode endpoints
│   └── index.ts     # Express server
│
├── cli/             # Existing CLI (unchanged)
│   ├── index.ts     # Interactive/pipeline modes (sync)
│   └── commands.ts  # Command processing logic
│
├── ws/              # NEW: WebSocket server for async mode
│   ├── index.ts     # WebSocket server entry point
│   ├── queue.ts     # Message queue implementation
│   ├── processor.ts # Queue processor (dequeue + process)
│   ├── subscription.ts  # Client connection management
│   ├── replay.ts    # Event replay from storage
│   ├── protocol.ts  # WebSocket message protocol
│   ├── commands.ts  # Command handler (reuses cli/commands.ts logic)
│   └── worlds.ts    # World instance cache management
│
├── core/            # Shared core library (minimal changes)
│   ├── events.ts    # Add seq to event persistence
│   ├── types.ts     # Add queue-related types
│   └── storage/
│       └── eventStorage/
│           └── types.ts  # Add seq field
│
└── web/             # Frontend (will connect to ws/)
    └── src/
        └── wsClient.ts  # NEW: WebSocket client for async mode
```

**World Instance Lifecycle in `ws/`**:
```typescript
// ws/worlds.ts - World cache management
class WorldCache {
  private worlds: Map<string, { 
    world: World, 
    lastAccessed: Date,
    subscribers: Set<string>  // connectionIds
  }> = new Map();

  // Load or get cached world instance
  async getWorld(worldId: string, connectionId: string): Promise<World> {
    if (!this.worlds.has(worldId)) {
      // Load world from storage (agents, chats, memory)
      const world = await loadWorld(worldId);
      this.worlds.set(worldId, {
        world,
        lastAccessed: new Date(),
        subscribers: new Set([connectionId])
      });
    } else {
      // World already loaded, add subscriber
      const cached = this.worlds.get(worldId)!;
      cached.subscribers.add(connectionId);
      cached.lastAccessed = new Date();
    }
    return this.worlds.get(worldId)!.world;
  }

  // Refresh world after mutations (agent updates, chat changes)
  async refreshWorld(worldId: string): Promise<World> {
    const cached = this.worlds.get(worldId);
    if (cached) {
      // Reload world from storage
      const refreshed = await loadWorld(worldId);
      cached.world = refreshed;
      cached.lastAccessed = new Date();
      return refreshed;
    }
    throw new Error(`World ${worldId} not loaded`);
  }

  // Remove subscriber when client disconnects
  removeSubscriber(worldId: string, connectionId: string): void {
    const cached = this.worlds.get(worldId);
    if (cached) {
      cached.subscribers.delete(connectionId);
      // Optional: Unload world if no subscribers (memory optimization)
      if (cached.subscribers.size === 0) {
        // Keep world in memory for quick reconnects (5 min TTL)
        setTimeout(() => {
          if (cached.subscribers.size === 0) {
            this.worlds.delete(worldId);
          }
        }, 5 * 60 * 1000);
      }
    }
  }

  // Cleanup all worlds on server shutdown
  cleanup(): void {
    for (const [worldId, cached] of this.worlds.entries()) {
      // Cleanup EventEmitter listeners
      cached.world.eventEmitter.removeAllListeners();
    }
    this.worlds.clear();
  }
}
```

**Benefits of In-Memory World Cache**:
- ✅ **Performance**: No reload overhead for each message
- ✅ **Shared State**: All clients see same world instance
- ✅ **EventEmitter Reuse**: Single EventEmitter, multiple listeners
- ✅ **Memory Efficient**: Worlds unloaded when no subscribers
- ✅ **Graceful Shutdown**: Cleanup on server stop

**Benefits of Separation**:
- ✅ **Zero risk**: Existing services untouched
- ✅ **Independent deployment**: Can deploy ws/ separately
- ✅ **Clear migration path**: Users switch to ws:// URLs when ready
- ✅ **Different protocols**: REST/CLI stay simple, WebSocket for advanced features
- ✅ **Testability**: Can test async features independently

### Technology Choices

**WebSocket Server (`ws/`)**:
- **Framework**: `ws` library (lightweight, standard)
- **Protocol**: JSON-based messages
  - Client→Server: `{ type: 'subscribe' | 'enqueue' | 'command' | 'unsubscribe', ... }`
  - Server→Client: `{ type: 'event' | 'ack' | 'error' | 'result', ... }`
- **Connection Management**: Map of `connectionId → { worldId, chatId, ws, lastSeq }`
- **World Instance Management**: In-memory cache of loaded worlds
  - World instances persist in memory while WebSocket server runs
  - Shared across all client connections to same world
  - Refreshed on updates (agent changes, chat switches, etc.)
  - Cleaned up on server shutdown (graceful or forced)
- **Command Support**: Full CLI command compatibility
  - World commands: `/world list`, `/world create`, `/world select`
  - Agent commands: `/agent list`, `/agent create`, `/agent update`
  - Chat commands: `/chat list`, `/chat create`, `/chat select`
  - All commands from `cli/commands.ts` available via WebSocket

**Message Queue**:
- **Storage**: SQLite table (simple, transactional, already integrated)
- **Schema**: 
  ```sql
  CREATE TABLE message_queue (
    id TEXT PRIMARY KEY,           -- nanoid
    worldId TEXT NOT NULL,
    messageId TEXT NOT NULL,       -- for deduplication
    content TEXT NOT NULL,
    sender TEXT NOT NULL,
    chatId TEXT,
    status TEXT NOT NULL,          -- 'pending', 'processing', 'completed', 'failed'
    priority INTEGER DEFAULT 0,    -- for future priority queuing
    createdAt INTEGER NOT NULL,
    processedAt INTEGER,
    error TEXT,
    retryCount INTEGER DEFAULT 0
  );
  CREATE INDEX idx_queue_status ON message_queue(worldId, status, createdAt);
  ```

**Event Storage Enhancement**:
- Add `seq` column (auto-increment per world+chat)
  ```sql
  ALTER TABLE events ADD COLUMN seq INTEGER;
  CREATE INDEX idx_events_seq ON events(worldId, chatId, seq);
  ```
- Sequence generation: `MAX(seq) + 1` per `(worldId, chatId)`

**Queue Processor**:
- Simple polling loop in `ws/` process (no workers/IPC)
- Polls queue every 100ms
- Processes one message per world at a time (per-world lock)
- Uses existing `publishMessage()` to trigger processing
- Updates queue status: `pending → processing → completed|failed`

### Assumptions
- SQLite can handle required throughput for single-machine deployment
- Event storage size growth is acceptable (manual cleanup available)
- Most deployments are single-machine (not distributed)
- Backward compatibility with sync mode is essential (no breaking changes)
- EventEmitter subscriptions are short-lived (per-request or per-session)

## Open Questions

1. **Event retention policy**: How long should events be kept? Should there be auto-cleanup?
   - Current: Events persist indefinitely
   - Option A: Retention policy (e.g., 30 days)
   - Option B: Manual cleanup tools
   - Option C: Per-world/chat retention settings

2. **Concurrent world processing**: Should multiple worlds process in parallel?
   - Current: Sequential per-world, but nothing prevents parallel worlds
   - Proposal: Allow parallel world processing, maintain sequential per-world

3. **Priority queuing**: Should certain messages (e.g., admin commands) jump the queue?
   - Current: FIFO only
   - Use case: `/stop`, `/cancel`, system commands

4. **Backpressure handling**: What happens when queue depth exceeds limits?
   - Option A: Reject new messages with 429 error
   - Option B: Warn but allow queuing
   - Option C: Per-world queue limits

5. **Client reconnection**: Should we keep event stream state for reconnecting clients?
   - Current: Clients replay from storage on reconnect
   - Alternative: Keep ephemeral read positions in memory (expires after N minutes)

6. **Streaming vs polling**: Should clients poll for events or use long-lived connections?
   - API: SSE (already implemented)
   - CLI: Direct EventEmitter listeners (already implemented)
   - Web: SSE for async mode, continue existing for sync mode

7. **Queue cleanup on completion**: Should completed/failed messages be deleted or archived?
   - Option A: Delete immediately (keeps queue small)
   - Option B: Archive for N hours (debugging)
   - Option C: Move to history table (audit trail)

## Decisions Made

✅ **New WebSocket Server (`ws/`)**: Create separate service, leave `server/` and `cli/` unchanged  
✅ **No Breaking Changes**: Existing REST API and CLI continue working in sync mode  
✅ **WebSocket Protocol**: Better suited for bidirectional streaming than REST/SSE  
✅ **CLI Command Support**: All CLI commands available via WebSocket (world/agent/chat management)  
✅ **World Instance Cache**: Worlds persist in `ws/` memory, shared across clients, refreshed on updates  
✅ **Storage-Based Replay**: Stream historical events from `eventStorage`, then switch to live  
✅ **Client-Managed Position**: Clients track their own `lastSeq`, request replay from that point  
✅ **No Worker Processes**: Keep processing in-process, use simple queue polling  
✅ **Event Tracking Complete**: All events (messages, SSE, tools, activities) already persisted  
✅ **SQLite Queue**: Use SQLite for message queue (simple, transactional, integrated)  
✅ **Sequence Numbers**: Add `seq` to event storage for strict ordering  
✅ **Independent Deployment**: `ws/` can be deployed/scaled separately from `server/`  
✅ **Graceful Cleanup**: World cache cleanup on server shutdown (EventEmitter listeners removed)

## Migration Strategy

### Phase 1: Foundation (Week 1)
**Goal**: Add core infrastructure without breaking existing code

- [ ] Add `seq` column to event storage schema (with migration script)
- [ ] Update `setupEventPersistence()` to generate sequence numbers
- [ ] Create message queue table and basic queue API
- [ ] Add unit tests for sequence generation and queue operations

**Deliverables**:
- Event storage supports sequential ordering
- Message queue ready for use
- Zero impact on existing `server/` and `cli/`

### Phase 2: WebSocket Server (Week 2)
**Goal**: Implement new `ws/` service

- [ ] Create `ws/` folder structure
- [ ] Implement WebSocket server (`ws/index.ts`)
- [ ] Implement world instance cache (`ws/worlds.ts`)
- [ ] Implement client subscription management (`ws/subscription.ts`)
- [ ] Implement event replay from storage (`ws/replay.ts`)
- [ ] Define WebSocket protocol (`ws/protocol.ts`)
- [ ] Implement command handler (`ws/commands.ts` - reuses `cli/commands.ts`)

**Deliverables**:
- WebSocket server accepts connections
- World instances cached in memory (shared across clients)
- Clients can subscribe to world events
- Clients can execute CLI commands via WebSocket
- Historical events stream from storage
- Live events stream from `world.eventEmitter`
- Commands trigger world refresh when needed

### Phase 3: Queue Processor (Week 3)
**Goal**: Implement async message processing

- [ ] Implement queue processor (`ws/processor.ts`)
- [ ] Implement per-world locking mechanism
- [ ] Integrate with existing `publishMessage()`
- [ ] Add queue management API (status, retry, cleanup)
- [ ] Add error handling and dead-letter queue

**Deliverables**:
- Messages enqueued via WebSocket are processed asynchronously
- Queue processor handles retries and failures
- Per-world sequential processing enforced

### Phase 4: Client Integration (Week 4)
**Goal**: Build WebSocket client for frontend

- [ ] Create WebSocket client library (`web/src/wsClient.ts`)
- [ ] Implement reconnection with position tracking
- [ ] Implement message enqueueing
- [ ] Implement event streaming and replay
- [ ] Update frontend to support WebSocket mode

**Deliverables**:
- Frontend can connect to `ws/` server
- Users can toggle between sync (REST) and async (WebSocket) modes
- Late-joining clients see full history

### Phase 5: Testing & Validation (Week 5)
**Goal**: Comprehensive testing

- [ ] End-to-end tests (enqueue → process → stream)
- [ ] Multiple client scenarios (late join, reconnect)
- [ ] Performance benchmarking (queue throughput, replay latency)
- [ ] Load testing (concurrent clients, large event history)
- [ ] Backward compatibility validation (existing tests pass)

**Deliverables**:
- All tests pass (existing + new)
- Performance meets requirements
- Documentation complete

### Phase 6: Rollout (Week 6)
**Goal**: Deploy and monitor

- [ ] Deploy `ws/` service (separate from `server/`)
- [ ] Monitor metrics (queue depth, latency, connections)
- [ ] Gradual rollout to users (opt-in)
- [ ] Gather feedback and iterate
- [ ] Document migration guide for users

**Deliverables**:
- WebSocket service running in production
- Users can opt-in to async mode
- Monitoring and alerting in place

### Backward Compatibility

**Existing Services Unchanged**:
- `server/` REST API continues working (sync mode)
- `cli/` continues working (sync mode, local processing)
- No feature flags needed (services are separate)
- Users migrate by switching from `http://` to `ws://`

**Data Migration**:
- Event storage migration: Add `seq` column with default NULL
- Backfill `seq` for existing events (one-time script)
- Message queue: New table, no existing data to migrate

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| SQLite queue throughput insufficient | High | Benchmark early; design for pluggable queue backend |
| Event storage grows unbounded | Medium | Implement retention policies; provide cleanup tools |
| Backward compatibility breaks | High | Comprehensive test coverage; feature flag safety net |
| Increased system complexity | Medium | Clear documentation; optional feature (can remain in sync mode) |
| Race conditions in queue | High | Strict sequential processing per world; comprehensive locking tests |

## References

- Current world processing: `core/events.ts` - `publishMessage()`
- Activity tracking: `core/activity-tracker.ts`
- Event storage: `core/storage/eventStorage/`
- API integration: `server/api.ts` - chat endpoints
- CLI integration: `cli/index.ts` - `runPipelineMode()`, `runInteractiveMode()`

---

## Architecture Decisions (Reviewed 2025-11-01)

### Key Design Choices

1. **Atomic Sequence Generation**: Use dedicated `event_sequences` table with atomic increment (prevents race conditions)
2. **Event-Driven Queue**: Process immediately on enqueue (not polling) for zero latency
3. **Heartbeat Monitoring**: Track message processing with heartbeat + stuck message detection
4. **Chunked Event Replay**: Send events in batches of 100 with client acknowledgment (prevents overwhelm)
5. **World Cache Limits**: Max 50 worlds, 1-minute idle timeout, memory monitoring
6. **Abstracted Commands**: Extract core command logic from CLI I/O for WebSocket reuse

### Risk Mitigation Strategy

| Risk | Mitigation | Priority |
|------|------------|----------|
| Sequence race conditions | Atomic increment with sequences table | P0 |
| Queue processor crashes | Heartbeat + stuck message auto-recovery | P0 |
| Memory leaks | Cache limits + aggressive unload | P1 |
| Client overwhelm | Chunked replay + backpressure | P1 |
| SQLite throughput | Benchmark early, hot/cold split if needed | P2 |

### Implementation Phases (5 Total)

1. **Storage Layer** (Days 1-5): Event sequences + message queue + atomic operations
2. **Network Layer** (Days 6-10): WebSocket server + protocol + connection management
3. **Business Logic** (Days 11-16): Queue processor + event replay + command abstraction
4. **Client & Testing** (Days 17-21): Client library + comprehensive testing
5. **Deployment** (Days 22-23): Documentation + monitoring + rollout

---

**Ready for Implementation**: All critical issues addressed in plan
