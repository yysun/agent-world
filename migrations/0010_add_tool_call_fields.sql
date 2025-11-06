-- Migration: Add tool call fields for approval message persistence
-- Version: 10
-- Date: 2025-11-05
--
-- This migration adds support for storing tool call information in agent memory,
-- which is essential for persisting approval request/response messages.
--
-- Changes:
-- - Add tool_calls column (TEXT) to store JSON array of tool call objects
-- - Add tool_call_id column (TEXT) to store tool call identifier for tool responses
--
-- Usage:
-- - tool_calls: JSON serialized array for assistant messages with function calls
--   Example: [{"id":"call_123","type":"function","function":{"name":"approve","arguments":"{}"}}]
-- - tool_call_id: String identifier for tool role messages responding to a tool call
--   Example: "approval_abc123"
--
-- These fields enable:
-- - Persistence of approval request messages (role='assistant' with tool_calls)
-- - Persistence of approval response messages (role='tool' with tool_call_id)
-- - Full reconstruction of approval conversation flows after page refresh

-- Add tool_calls column for storing JSON array of tool call objects
ALTER TABLE agent_memory ADD COLUMN tool_calls TEXT;

-- Add tool_call_id column for tool response messages
ALTER TABLE agent_memory ADD COLUMN tool_call_id TEXT;
