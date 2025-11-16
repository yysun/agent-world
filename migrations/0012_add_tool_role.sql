-- Migration: Add 'tool' role support to agent_memory and archived_messages
-- Version: 0012
-- Date: 2025-11-08
--
-- Purpose: Allow role='tool' for tool result messages in approval flow
-- This requires recreating tables since SQLite doesn't support modifying CHECK constraints
--
-- Note: Migration runner handles transactions automatically, so no explicit BEGIN/COMMIT needed

PRAGMA foreign_keys=OFF;

-- Clean up any existing backup tables from failed migration attempts
DROP TABLE IF EXISTS agent_memory_backup;
DROP TABLE IF EXISTS archived_messages_backup;

-- Backup agent_memory (copy ALL columns as-is)
CREATE TABLE agent_memory_backup AS SELECT * FROM agent_memory;

-- Drop and recreate agent_memory with updated constraint
DROP TABLE agent_memory;

CREATE TABLE agent_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  world_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
  content TEXT NOT NULL,
  sender TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  chat_id TEXT,
  message_id TEXT,
  reply_to_message_id TEXT,
  tool_calls TEXT,
  tool_call_id TEXT,
  FOREIGN KEY (agent_id, world_id) REFERENCES agents(id, world_id) ON DELETE CASCADE
);

-- Restore data from backup (explicitly list columns to handle any schema differences)
INSERT INTO agent_memory (id, agent_id, world_id, role, content, sender, created_at, chat_id, message_id, reply_to_message_id, tool_calls, tool_call_id)
SELECT id, agent_id, world_id, role, content, sender, created_at, chat_id, message_id, reply_to_message_id, tool_calls, tool_call_id
FROM agent_memory_backup;
DROP TABLE agent_memory_backup;

-- Recreate indexes for agent_memory
CREATE INDEX IF NOT EXISTS idx_agent_memory_agent_world ON agent_memory(agent_id, world_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_chat_id ON agent_memory(chat_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_message_id ON agent_memory(message_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_reply_to ON agent_memory(reply_to_message_id);

-- Backup archived_messages (copy ALL columns as-is)
CREATE TABLE archived_messages_backup AS SELECT * FROM archived_messages;

-- Drop and recreate archived_messages with updated constraint
DROP TABLE archived_messages;

CREATE TABLE archived_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  archive_id INTEGER NOT NULL,
  agent_id TEXT NOT NULL,
  world_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
  content TEXT NOT NULL,
  sender TEXT,
  original_timestamp TIMESTAMP,
  FOREIGN KEY (archive_id) REFERENCES memory_archives(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id, world_id) REFERENCES agents(id, world_id) ON DELETE CASCADE
);

-- Restore data from backup (explicitly list columns for archived_messages)
INSERT INTO archived_messages (id, archive_id, agent_id, world_id, role, content, sender, original_timestamp)
SELECT id, archive_id, agent_id, world_id, role, content, sender, original_timestamp
FROM archived_messages_backup;
DROP TABLE archived_messages_backup;

-- Recreate index for archived_messages
CREATE INDEX IF NOT EXISTS idx_archived_messages_archive_id ON archived_messages(archive_id);

PRAGMA foreign_keys=ON;
