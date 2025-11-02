-- Migration: Add message_id to agent_memory for message identification
-- Version: 5
-- Date: 2025-10-21
--
-- This migration adds the message_id column to the agent_memory table to enable
-- unique identification of messages for features like message editing and threading.

ALTER TABLE agent_memory ADD COLUMN message_id TEXT;

CREATE INDEX
IF NOT EXISTS idx_agent_memory_message_id ON agent_memory
(message_id);
