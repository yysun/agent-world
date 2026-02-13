-- Migration: Add world variables text field
-- Version: 13
-- Date: 2026-02-12
--
-- Adds optional .env-style variables text storage to worlds.

ALTER TABLE worlds ADD COLUMN variables TEXT;