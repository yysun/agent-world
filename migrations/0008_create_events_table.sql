-- Migration: Create events table for persistent event storage
-- Version: 8
-- Date: 2025-10-30
--
-- This migration creates the events table to store world emitter events with proper
-- foreign key relationships and cascade delete behavior.
--
-- Table Design:
-- - id: Text primary key (UUID format)
-- - world_id: Foreign key to worlds table with CASCADE delete
-- - chat_id: Foreign key to world_chats table with CASCADE delete (nullable)
-- - seq: Sequence number for ordering within a world/chat (nullable, auto-incremented per world/chat)
-- - type: Event type (message, sse, tool, system, etc.)
-- - payload: JSON column for event data (uses JSON1 extension)
-- - meta: JSON column for metadata like timestamp, sender, etc.
-- - created_at: Timestamp of event creation
--
-- Indexes:
-- - Composite index on (world_id, chat_id, created_at) for efficient time-based queries
-- - Composite index on (world_id, chat_id, seq) for efficient sequence-based queries
--
-- Cascade Delete Behavior:
-- - When a world is deleted, all events for that world are automatically deleted
-- - When a chat is deleted, all events for that chat are automatically deleted
-- - Foreign keys enforce referential integrity

-- Create events table
CREATE TABLE
IF NOT EXISTS events
(
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  chat_id TEXT,
  seq INTEGER,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,  -- JSON data stored as text (JSON1 extension)
  meta TEXT,              -- JSON metadata stored as text
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Foreign key constraints with CASCADE delete
  -- When a world is deleted, all its events are deleted
  FOREIGN KEY
(world_id) REFERENCES worlds
(id) ON
DELETE CASCADE,
  
  -- When a chat is deleted, all its events are deleted
  -- Note: This uses a conditional foreign key - events with NULL chat_id won't be constrained
  FOREIGN KEY (chat_id)
REFERENCES world_chats
(id) ON
DELETE CASCADE
);

-- Create indexes for efficient queries
-- Index for time-based queries within a world/chat context
CREATE INDEX
IF NOT EXISTS idx_events_world_chat_time 
  ON events
(world_id, chat_id, created_at);

-- Index for sequence-based queries within a world/chat context
CREATE INDEX
IF NOT EXISTS idx_events_world_chat_seq 
  ON events
(world_id, chat_id, seq);

-- Index for event type queries
CREATE INDEX
IF NOT EXISTS idx_events_type 
  ON events
(type);

-- Index for world_id alone for efficient world-level queries
CREATE INDEX
IF NOT EXISTS idx_events_world_id 
  ON events
(world_id);
