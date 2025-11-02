-- Migration: Initial base schema for Agent World
-- Version: 0 (Base schema for fresh installations)
-- Date: 2025-11-02
--
-- This is the complete base schema applied to fresh databases.
-- For existing databases, legacy migrations (v1-7) or the migration
-- bridge will handle upgrades to this state.
--
-- This includes all tables through v7:
-- - Base tables (worlds, agents, agent_memory)
-- - Archive system (memory_archives, archived_messages, archive_statistics)
-- - Chat system (world_chats)
-- - All v1-7 columns (chat_id, llm config, message_id, reply_to_message_id)

-- Worlds table
CREATE TABLE IF NOT EXISTS worlds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  turn_limit INTEGER NOT NULL DEFAULT 5,
  chat_llm_provider TEXT,
  chat_llm_model TEXT,
  current_chat_id TEXT,
  mcp_config TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Agents table
CREATE TABLE IF NOT EXISTS agents (
  id TEXT NOT NULL,
  world_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT DEFAULT 'inactive',
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  system_prompt TEXT,
  temperature REAL,
  max_tokens INTEGER,
  llm_call_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_llm_call TIMESTAMP,
  PRIMARY KEY (id, world_id),
  FOREIGN KEY (world_id) REFERENCES worlds(id) ON DELETE CASCADE
);

-- Agent memory table (includes all v1-7 columns)
CREATE TABLE IF NOT EXISTS agent_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  world_id TEXT NOT NULL,
  message_id TEXT,
  reply_to_message_id TEXT,
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant')),
  content TEXT NOT NULL,
  sender TEXT,
  chat_id TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id, world_id) REFERENCES agents(id, world_id) ON DELETE CASCADE
);

-- World chats table
CREATE TABLE IF NOT EXISTS world_chats (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  message_count INTEGER DEFAULT 0,
  tags TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (world_id) REFERENCES worlds(id) ON DELETE CASCADE
);

-- Memory archives table
CREATE TABLE IF NOT EXISTS memory_archives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  world_id TEXT NOT NULL,
  session_name TEXT,
  archive_reason TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  participants TEXT,
  tags TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id, world_id) REFERENCES agents(id, world_id) ON DELETE CASCADE
);

-- Archived messages table
CREATE TABLE IF NOT EXISTS archived_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  archive_id INTEGER NOT NULL,
  agent_id TEXT NOT NULL,
  world_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant')),
  content TEXT NOT NULL,
  sender TEXT,
  original_timestamp TIMESTAMP,
  FOREIGN KEY (archive_id) REFERENCES memory_archives(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id, world_id) REFERENCES agents(id, world_id) ON DELETE CASCADE
);

-- Archive statistics table
CREATE TABLE IF NOT EXISTS archive_statistics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  world_id TEXT NOT NULL,
  total_archives INTEGER DEFAULT 0,
  total_messages INTEGER DEFAULT 0,
  average_session_length REAL DEFAULT 0,
  most_active_agent TEXT,
  archive_frequency TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id, world_id) REFERENCES agents(id, world_id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_agents_world_id ON agents(world_id);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agent_memory_agent_world ON agent_memory(agent_id, world_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_chat_id ON agent_memory(chat_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_message_id ON agent_memory(message_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_reply_to_message_id ON agent_memory(reply_to_message_id);
CREATE INDEX IF NOT EXISTS idx_world_chats_world_id ON world_chats(world_id);
CREATE INDEX IF NOT EXISTS idx_memory_archives_agent_world ON memory_archives(agent_id, world_id);
CREATE INDEX IF NOT EXISTS idx_archived_messages_archive_id ON archived_messages(archive_id);
CREATE INDEX IF NOT EXISTS idx_archive_statistics_agent_world ON archive_statistics(agent_id, world_id);

-- Create triggers for automatic timestamp updates
CREATE TRIGGER IF NOT EXISTS worlds_updated_at
AFTER UPDATE ON worlds
BEGIN
  UPDATE worlds SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS agents_last_active
AFTER UPDATE ON agents
BEGIN
  UPDATE agents SET last_active = CURRENT_TIMESTAMP WHERE id = NEW.id AND world_id = NEW.world_id;
END;

CREATE TRIGGER IF NOT EXISTS world_chats_updated_at
AFTER UPDATE ON world_chats
BEGIN
  UPDATE world_chats SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS archive_statistics_updated_at
AFTER UPDATE ON archive_statistics
BEGIN
  UPDATE archive_statistics SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
