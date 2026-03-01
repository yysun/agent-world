-- Migration: Create message_queue table for user message queue feature
-- Version: 15
-- Date: 2026-03-01
--
-- Creates a dedicated message_queue table to persist user messages that are
-- queued for sequential processing. A separate table (rather than an
-- agent_memory status column) is used to avoid the agent_id FK constraint
-- on agent_memory, since queued messages are not yet associated with a
-- specific agent.
--
-- Status lifecycle:
--   queued    -> sending -> (row deleted when processed successfully)
--   queued    -> cancelled  (when user stops/clears queue)
--   sending   -> queued     (startup recovery: interrupted sessions reset)
--   sending   -> error      (after max retries exhausted)

CREATE TABLE IF NOT EXISTS message_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  content TEXT NOT NULL,
  sender TEXT NOT NULL DEFAULT 'human',
  status TEXT NOT NULL DEFAULT 'queued',
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (world_id) REFERENCES worlds(id) ON DELETE CASCADE,
  FOREIGN KEY (chat_id) REFERENCES world_chats(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_message_queue_message_id
  ON message_queue(message_id);

CREATE INDEX IF NOT EXISTS idx_message_queue_chat
  ON message_queue(world_id, chat_id, status);
