-- Migration: Add reply_to_message_id for message threading support
-- Version: 6
-- Date: 2025-10-25
--
-- This migration adds the reply_to_message_id column to the agent_memory table
-- to enable message threading and conversation context tracking.

ALTER TABLE agent_memory ADD COLUMN reply_to_message_id TEXT;

CREATE INDEX
IF NOT EXISTS idx_agent_memory_reply_to_message_id ON agent_memory
(reply_to_message_id);
