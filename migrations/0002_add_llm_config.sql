-- Migration: Add LLM provider and model configuration to worlds
-- Version: 2
-- Date: 2025-09-15
--
-- This migration adds chat_llm_provider and chat_llm_model columns to the worlds
-- table, enabling per-world LLM configuration for chat interactions.

ALTER TABLE worlds ADD COLUMN chat_llm_provider TEXT;
ALTER TABLE worlds ADD COLUMN chat_llm_model TEXT;
