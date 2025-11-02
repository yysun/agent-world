-- Migration: Add MCP (Model Context Protocol) configuration to worlds
-- Version: 4
-- Date: 2025-10-10
--
-- This migration adds the mcp_config column to the worlds table to store
-- Model Context Protocol server configurations as JSON.

ALTER TABLE worlds ADD COLUMN mcp_config TEXT;
