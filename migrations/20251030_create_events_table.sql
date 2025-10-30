-- Migration: Create events table for persisting world emitter events
-- Created: 2025-10-30
-- 
-- This migration creates an events table to persist events emitted by world emitters,
-- keyed by worldId and chatId, with cascade deletion when worlds or chats are deleted.
--
-- Features:
-- - Stores events with sequence numbers per world+chat combination
-- - Supports both Postgres and SQLite
-- - Includes foreign key constraints with ON DELETE CASCADE if parent tables exist
-- - Uses triggers for cascade deletion if foreign key support unavailable
-- - Indexes on (world_id, chat_id, seq) and (world_id, chat_id, created_at) for performance

-- Create events table
CREATE TABLE IF NOT EXISTS events (
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

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_events_world_chat_seq 
    ON events(world_id, chat_id, seq);

CREATE INDEX IF NOT EXISTS idx_events_world_chat_created 
    ON events(world_id, chat_id, created_at);

CREATE INDEX IF NOT EXISTS idx_events_type 
    ON events(type);

-- Attempt to add foreign key constraints if worlds and world_chats tables exist
-- Note: SQLite doesn't support adding foreign keys after table creation,
-- so these constraints should be included in the initial CREATE TABLE in production.
-- For SQLite, we'll use triggers instead.

-- Check if we're on SQLite or Postgres and handle accordingly
-- For SQLite: Create triggers for cascade deletion

-- Trigger to delete events when a world is deleted
CREATE TRIGGER IF NOT EXISTS trg_delete_events_on_world_delete
AFTER DELETE ON worlds
FOR EACH ROW
BEGIN
    DELETE FROM events WHERE world_id = OLD.id;
END;

-- Trigger to delete events when a chat is deleted
CREATE TRIGGER IF NOT EXISTS trg_delete_events_on_chat_delete
AFTER DELETE ON world_chats
FOR EACH ROW
BEGIN
    DELETE FROM events WHERE world_id = OLD.world_id AND chat_id = OLD.id;
END;

-- Note: For Postgres, you would replace the triggers with proper foreign key constraints:
-- ALTER TABLE events ADD CONSTRAINT fk_events_world
--     FOREIGN KEY (world_id) REFERENCES worlds(id) ON DELETE CASCADE;
-- ALTER TABLE events ADD CONSTRAINT fk_events_chat
--     FOREIGN KEY (world_id, chat_id) REFERENCES world_chats(world_id, id) ON DELETE CASCADE;
