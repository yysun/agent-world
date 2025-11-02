-- Migration: Initial base schema
-- Version: 0
-- Date: 2025-11-02
--
-- This is the base schema that creates the initial database structure.
-- All subsequent migrations (0001-0009) build upon this foundation.
--
-- Base Tables:
-- - worlds: Core world configuration (no LLM/chat columns yet)
-- - agents: Agent configuration with LLM settings
-- - agent_memory: Active conversation memory (no chat_id, message_id, reply_to_message_id yet)
-- - memory_archives: Archive session metadata
-- - archived_messages: Historical conversation content
-- - archive_statistics: Usage analytics
--
-- Note: This is the PRE-MIGRATION state. Tables like world_chats, events, event_sequences
-- and columns like chat_id, mcp_config, etc. are added by subsequent migrations.

-- Create worlds table (base version without migration columns)
CREATE TABLE IF NOT EXISTS worlds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  turn_limit INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create agents table (complete from start)
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

-- Create agent_memory table (base version without chat columns)
CREATE TABLE IF NOT EXISTS agent_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  world_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant')),
  content TEXT NOT NULL,
  sender TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id, world_id) REFERENCES agents(id, world_id) ON DELETE CASCADE
);

-- Create memory archives system
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

-- Create base indexes
CREATE INDEX IF NOT EXISTS idx_agents_world_id ON agents(world_id);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agent_memory_agent_world ON agent_memory(agent_id, world_id);
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

CREATE TRIGGER IF NOT EXISTS archive_statistics_updated_at
AFTER UPDATE ON archive_statistics
BEGIN
  UPDATE archive_statistics SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
