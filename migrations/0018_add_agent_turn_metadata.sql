-- Migration: Add durable message metadata column for agent-turn state/outcome persistence
-- Version: 18
-- Date: 2026-03-29

ALTER TABLE agent_memory ADD COLUMN message_metadata TEXT;
