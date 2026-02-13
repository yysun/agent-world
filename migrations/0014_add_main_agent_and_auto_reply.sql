-- Migration: Add world main_agent and agent auto_reply fields
-- Version: 14
-- Date: 2026-02-13
--
-- Adds:
-- - worlds.main_agent (TEXT, nullable)
-- - agents.auto_reply (INTEGER, default 1)

ALTER TABLE worlds ADD COLUMN main_agent TEXT;
ALTER TABLE agents ADD COLUMN auto_reply INTEGER NOT NULL DEFAULT 1;