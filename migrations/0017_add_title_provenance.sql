-- Migration: Add title_provenance column to world_chats
-- Purpose: Track whether a chat title was set by default, auto-generated, or manually assigned.
-- Notes:
--   - DEFAULT 'default' ensures existing rows are treated as legacy (favor-preserve) per REQ-11.
--   - Valid values: 'default' (untitled/legacy), 'auto' (auto-generated), 'manual' (user-renamed).
ALTER TABLE world_chats
ADD COLUMN title_provenance TEXT DEFAULT 'default';
