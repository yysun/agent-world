-- Migration: Add event sequence tracking for atomic sequence generation
-- Version: 9 (next version after events table creation)
-- Date: 2025-11-01
--
-- This migration creates the event_sequences table to support atomic sequence number
-- generation for events within each world/chat context. This prevents race conditions
-- when multiple events are saved concurrently.
--
-- Table Design:
-- - world_id: World context for the sequence
-- - chat_id: Chat context (nullable for world-level events)
-- - last_seq: Last allocated sequence number (starts at 0)
-- - PRIMARY KEY (world_id, chat_id): Ensures one sequence counter per context
--
-- Atomic Increment Pattern:
-- 1. INSERT OR REPLACE INTO event_sequences ... VALUES (?, ?, last_seq + 1)
-- 2. SELECT last_seq FROM event_sequences WHERE ...
-- 3. Use returned last_seq as the event's seq value
--
-- This uses SQLite's implicit row-level locking during INSERT/UPDATE to ensure
-- that concurrent transactions get unique sequence numbers.

-- Create event_sequences table for atomic sequence generation
CREATE TABLE
IF NOT EXISTS event_sequences
(
  world_id TEXT NOT NULL,
  chat_id TEXT,
  last_seq INTEGER DEFAULT 0,
  PRIMARY KEY
(world_id, chat_id)
);

-- Index for efficient lookups (though PRIMARY KEY already creates an index)
CREATE INDEX
IF NOT EXISTS idx_event_sequences_world
  ON event_sequences
(world_id);

-- Backfill existing events with sequence numbers if they have NULL seq
-- This handles migration of existing data
UPDATE events 
SET seq = (
  SELECT ROW_NUMBER() OVER (
    ORDER BY created_at ASC
  )
FROM events e2
WHERE e2.world_id = events.world_id
  AND (e2.chat_id = events.chat_id OR (e2.chat_id IS NULL AND events.chat_id IS NULL))
  AND e2.created_at <= events.created_at
)
WHERE seq IS NULL;

-- Initialize event_sequences table with current max seq values
INSERT INTO event_sequences
  (world_id, chat_id, last_seq)
SELECT
  world_id,
  chat_id,
  COALESCE(MAX(seq), 0) as last_seq
FROM events
GROUP BY world_id, chat_id
ON CONFLICT
(world_id, chat_id) DO
UPDATE SET
  last_seq = MAX(last_seq, excluded.last_seq);
