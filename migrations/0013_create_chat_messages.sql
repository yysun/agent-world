-- Migration: Create centralized chat_messages table
-- Version: 13
-- Date: 2026-02-09
--
-- Purpose: Centralize message storage in chat sessions instead of agent memory
-- This enables:
-- - Single source of truth for messages
-- - Efficient message queries by chat
-- - Reduced storage redundancy
-- - Dynamic agent memory loading

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  world_id TEXT NOT NULL,
  message_id TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
  content TEXT NOT NULL,
  sender TEXT NOT NULL,
  reply_to_message_id TEXT,
  tool_calls TEXT,
  tool_call_id TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (chat_id) REFERENCES world_chats(id) ON DELETE CASCADE,
  FOREIGN KEY (world_id) REFERENCES worlds(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_id ON chat_messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_message_id ON chat_messages(message_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_world_chat ON chat_messages(world_id, chat_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(chat_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender ON chat_messages(sender);
