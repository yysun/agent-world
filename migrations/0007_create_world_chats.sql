-- Migration: Create world_chats table for chat session management
-- Version: 7
-- Date: 2025-10-28
--
-- This migration creates the world_chats table to manage chat sessions within worlds,
-- including metadata like name, description, message count, and tags.

CREATE TABLE
IF NOT EXISTS world_chats
(
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  message_count INTEGER DEFAULT 0,
  tags TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY
(world_id) REFERENCES worlds
(id) ON
DELETE CASCADE
);

CREATE INDEX
IF NOT EXISTS idx_world_chats_world_id ON world_chats
(world_id);

CREATE TRIGGER
IF NOT EXISTS world_chats_updated_at
AFTER
UPDATE ON world_chats
BEGIN
  UPDATE world_chats SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
