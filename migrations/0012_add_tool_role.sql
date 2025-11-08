-- Migration: Add 'tool' role support to agent_memory and archived_messages
-- Version: 0012
-- Date: 2025-11-08
--
-- Purpose: Allow role='tool' for tool result messages in approval flow
-- This requires recreating tables since SQLite doesn't support modifying CHECK constraints

PRAGMA foreign_keys=OFF;

BEGIN TRANSACTION;

-- Backup agent_memory
CREATE TABLE agent_memory_backup (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  world_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  sender TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  chat_id TEXT,
  message_id TEXT,
  reply_to_message_id TEXT,
  tool_calls TEXT,
  tool_call_id TEXT
);

INSERT INTO agent_memory_backup SELECT * FROM agent_memory;

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

INSERT INTO agent_memory SELECT * FROM agent_memory_backup;
DROP TABLE agent_memory_backup;

-- Recreate indexes for agent_memory
CREATE INDEX IF NOT EXISTS idx_agent_memory_agent_world ON agent_memory(agent_id, world_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_chat_id ON agent_memory(chat_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_message_id ON agent_memory(message_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_reply_to ON agent_memory(reply_to_message_id);

-- Backup archived_messages
CREATE TABLE archived_messages_backup (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  archive_id INTEGER NOT NULL,
  agent_id TEXT NOT NULL,
  world_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  sender TEXT,
  original_timestamp TIMESTAMP
);

INSERT INTO archived_messages_backup 
SELECT id, archive_id, agent_id, world_id, role, content, sender, original_timestamp
FROM archived_messages;

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

-- Restore data from backup
INSERT INTO archived_messages (id, archive_id, agent_id, world_id, role, content, sender, original_timestamp)
SELECT id, archive_id, agent_id, world_id, role, content, sender, original_timestamp
FROM archived_messages_backup;
DROP TABLE archived_messages_backup;

-- Recreate index for archived_messages
CREATE INDEX IF NOT EXISTS idx_archived_messages_archive_id ON archived_messages(archive_id);

COMMIT;

PRAGMA foreign_keys=ON;
