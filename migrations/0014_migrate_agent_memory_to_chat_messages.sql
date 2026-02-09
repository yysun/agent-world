-- Migration: Migrate existing agent_memory data to chat_messages
-- Version: 14
-- Date: 2026-02-09
--
-- Purpose: One-time data migration from agent_memory to chat_messages
-- Deduplicates messages that exist in multiple agents' memory

-- Insert messages from agent_memory, deduplicating by message_id
INSERT OR IGNORE INTO chat_messages (
  chat_id, world_id, message_id, role, content, sender,
  reply_to_message_id, tool_calls, tool_call_id, created_at
)
SELECT DISTINCT
  chat_id,
  world_id,
  message_id,
  role,
  content,
  sender,
  reply_to_message_id,
  tool_calls,
  tool_call_id,
  created_at
FROM agent_memory
WHERE chat_id IS NOT NULL
  AND message_id IS NOT NULL
ORDER BY created_at ASC;

-- Update message counts for all chats
UPDATE world_chats
SET message_count = (
  SELECT COUNT(*)
  FROM chat_messages
  WHERE chat_messages.chat_id = world_chats.id
);

-- Add migration flag
ALTER TABLE world_chats ADD COLUMN data_migrated INTEGER DEFAULT 0;
UPDATE world_chats SET data_migrated = 1;
