-- Migration: Add indexes on JSON metadata fields for fast filtering
-- Version: 11
-- Date: 2025-11-07
--
-- This migration adds indexes on commonly queried JSON metadata fields to improve
-- performance of event filtering operations. SQLite's JSON1 extension allows indexing
-- on json_extract() expressions.
--
-- Indexed Fields:
-- - ownerAgentIds: Array of agent IDs that have this event in memory
-- - recipientAgentId: Intended recipient agent ID
-- - messageDirection: Message flow direction (outgoing/incoming/broadcast)
-- - isMemoryOnly: Flag for messages saved but not triggering response
-- - isCrossAgentMessage: Flag for agent-to-agent communication
-- - threadRootId: Root message ID for threading queries
-- - hasToolCalls: Flag for messages containing tool calls
--
-- Performance Impact:
-- - Significantly improves filtering queries on metadata fields
-- - Composite index optimizes common query patterns (world + chat + owner)
-- - Uses SQLite JSON1 extension (built-in since SQLite 3.38.0)

-- Index on ownerAgentIds array (for agent filtering)
-- Note: Array search requires LIKE operator with pattern %"agentId"%
CREATE INDEX
IF NOT EXISTS idx_events_owner_agents 
  ON events
(json_extract
(meta, '$.ownerAgentIds'));

-- Index on recipientAgentId (for recipient filtering)
CREATE INDEX
IF NOT EXISTS idx_events_recipient_agent 
  ON events
(json_extract
(meta, '$.recipientAgentId'));

-- Index on messageDirection (for direction filtering)
CREATE INDEX
IF NOT EXISTS idx_events_message_direction 
  ON events
(json_extract
(meta, '$.messageDirection'));

-- Index on isMemoryOnly flag (for memory-only message filtering)
CREATE INDEX
IF NOT EXISTS idx_events_memory_only 
  ON events
(json_extract
(meta, '$.isMemoryOnly'));

-- Index on isCrossAgentMessage flag (for cross-agent message filtering)
CREATE INDEX
IF NOT EXISTS idx_events_cross_agent 
  ON events
(json_extract
(meta, '$.isCrossAgentMessage'));

-- Index on threadRootId (for thread queries)
CREATE INDEX
IF NOT EXISTS idx_events_thread_root 
  ON events
(json_extract
(meta, '$.threadRootId'));

-- Index on hasToolCalls flag (for tool call filtering)
CREATE INDEX
IF NOT EXISTS idx_events_has_tool_calls 
  ON events
(json_extract
(meta, '$.hasToolCalls'));

-- Composite index for common query pattern: filter by world, chat, and owner agent
-- This is the most common query pattern in the web UI (agent-specific message views)
CREATE INDEX
IF NOT EXISTS idx_events_world_chat_owner 
  ON events
(world_id, chat_id, json_extract
(meta, '$.ownerAgentIds'));
