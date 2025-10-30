-- Migration: Create events table for persistent event storage
-- Date: 2025-10-30
-- Description: Add events table with foreign key cascade deletes to worlds and chats tables
--
-- Features:
-- - Event storage keyed by world_id and chat_id
-- - Cascade deletion when worlds or chats are removed
-- - JSON storage for flexible payload and metadata
-- - Sequence tracking for event ordering
-- - Indexes for efficient querying by world, chat, and time

-- Create events table
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  type TEXT NOT NULL,
  payload TEXT,
  meta TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (world_id) REFERENCES worlds(id) ON DELETE CASCADE,
  FOREIGN KEY (chat_id) REFERENCES world_chats(id) ON DELETE CASCADE
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_events_world_chat_created 
  ON events(world_id, chat_id, created_at);

CREATE INDEX IF NOT EXISTS idx_events_world_chat_seq 
  ON events(world_id, chat_id, seq);

-- Create index on type for filtering by event type
CREATE INDEX IF NOT EXISTS idx_events_type 
  ON events(type);
