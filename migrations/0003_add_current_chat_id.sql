-- Migration: Add current_chat_id to worlds for active chat tracking
-- Version: 3
-- Date: 2025-09-20
--
-- This migration adds the current_chat_id column to the worlds table to track
-- which chat session is currently active in each world.

ALTER TABLE worlds ADD COLUMN current_chat_id TEXT;
