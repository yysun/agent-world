-- Migration: Add chat_id to agent_memory for chat session tracking
-- Version: 1
-- Date: 2025-08-01
--
-- This migration adds the chat_id column to the agent_memory table to enable
-- chat session management and message grouping by conversation context.

ALTER TABLE agent_memory ADD COLUMN chat_id TEXT;

CREATE INDEX
IF NOT EXISTS idx_agent_memory_chat_id ON agent_memory
(chat_id);
