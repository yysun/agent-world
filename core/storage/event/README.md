# Event Storage

Event storage implementation for persisting events emitted by world emitters in the Agent World system.

## Overview

The event storage system provides three backend implementations for persisting events:

1. **Memory Storage** - In-memory Map-based storage for tests and development
2. **SQLite Storage** - Database-backed persistent storage with transactions
3. **File Storage** - JSONL file-based storage with atomic appends

All implementations share a common `EventStorage` interface and support:
- Sequential event numbering per world+chat combination
- Batch operations with transaction support
- Query filtering by type, sequence range, and date range
- Cascade deletion when worlds or chats are deleted

## Usage

### Basic Usage

```typescript
import { createEventStorage } from './core/storage/event/index.js';
import { wireEventStorage } from './core/storage/event/wireListener.js';
import { createWorld } from './core/managers.js';

// Create a world
const world = await createWorld({ name: 'My World' });

// Create event storage (memory for testing)
const storage = await createEventStorage({ type: 'memory' });

// Wire up automatic event persistence
const cleanup = wireEventStorage(world, storage);

// Now all events are automatically saved
// ... your code that emits events ...

// Cleanup when done
cleanup();
```

### Query Events

```typescript
// Get all events for a world and chat
const events = await storage.getEventsByWorldAndChat({
  worldId: 'world-1',
  chatId: 'chat-1'
});

// Filter by event type
const messageEvents = await storage.getEventsByWorldAndChat({
  worldId: 'world-1',
  chatId: 'chat-1',
  type: 'message'
});

// Paginate results
const page1 = await storage.getEventsByWorldAndChat({
  worldId: 'world-1',
  chatId: 'chat-1',
  limit: 20,
  offset: 0
});
```

### Storage Types

#### Memory Storage
```typescript
const storage = await createEventStorage({ type: 'memory' });
```

Best for:
- Unit tests
- Development
- Browser environments
- Temporary event tracking

#### SQLite Storage
```typescript
import { Database } from 'sqlite3';

const db = new Database('./data/events.db');
const storage = await createEventStorage({ 
  type: 'sqlite',
  db 
});
```

Best for:
- Production deployments
- Long-term event persistence
- Transaction support
- Cascade deletion via triggers

#### File Storage
```typescript
const storage = await createEventStorage({ 
  type: 'file',
  rootPath: './data'
});
```

Best for:
- Simple deployments
- Log-like event storage
- Easy backup and archival
- Human-readable JSONL format

## Event Structure

Each event record has the following structure:

```typescript
interface EventRecord {
  id: string;          // Unique event ID (nanoid)
  worldId: string;     // World identifier
  chatId: string | null; // Chat identifier (null for system events)
  seq: number;         // Sequence number (per world+chat)
  type: string;        // Event type (message, sse, world, system)
  payload: any;        // Event-specific data
  meta?: any;          // Optional metadata
  createdAt: Date;     // Timestamp
}
```

## Database Schema

The SQLite migration creates an `events` table with the following structure:

```sql
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  chat_id TEXT,
  seq INTEGER NOT NULL,
  type TEXT NOT NULL,
  payload TEXT,  -- JSON
  meta TEXT,     -- JSON
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(world_id, chat_id, seq)
);
```

### Cascade Deletion

Events are automatically deleted when the parent world or chat is deleted via triggers:

```sql
CREATE TRIGGER trg_delete_events_on_world_delete
AFTER DELETE ON worlds
FOR EACH ROW
BEGIN
  DELETE FROM events WHERE world_id = OLD.id;
END;
```

## Testing

Run the test suite:

```bash
npm test tests/storage/eventStorage.test.ts
```

The test suite covers:
- Save and retrieve operations
- Sequential sequence generation
- Batch operations
- Query filtering
- Pagination
- Cascade deletion
- Null chatId handling
- Sequence isolation per world+chat

## Implementation Notes

- Uses `nanoid` for ID generation (consistent with repo patterns)
- Sequence numbers start at 1 and increment per world+chat combination
- All timestamps are stored as ISO 8601 strings
- JSON payloads are stored as strings in DB/file backends
- Memory backend uses deep cloning for data isolation
- File backend uses JSONL format (one JSON object per line)
- SQLite backend uses transactions for batch operations

## Future Enhancements

- [ ] Add event replay functionality
- [ ] Implement event compaction for file storage
- [ ] Add event stream subscriptions
- [ ] Support event filtering by payload fields
- [ ] Add event export to other formats (CSV, JSON)
