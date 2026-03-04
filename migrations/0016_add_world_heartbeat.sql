-- Migration: Add world heartbeat configuration fields
-- Version: 16
-- Date: 2026-03-04
--
-- Adds persisted world heartbeat controls used by Electron main runtime.
-- Fields:
--   heartbeat_enabled  - whether heartbeat scheduling is enabled
--   heartbeat_interval - cron expression (product policy: strict 5-field)
--   heartbeat_prompt   - message content published on each tick

ALTER TABLE worlds ADD COLUMN heartbeat_enabled INTEGER DEFAULT 0;
ALTER TABLE worlds ADD COLUMN heartbeat_interval TEXT;
ALTER TABLE worlds ADD COLUMN heartbeat_prompt TEXT;
