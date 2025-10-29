/**
 * Vitest Setup for Integration Tests
 *
 * Minimal setup for integration tests - no mocking, real filesystem operations
 * 
 * Features:
 * - Environment variable setup
 * - No mock resets
 * - Real file operations
 */

import { beforeEach, afterEach } from 'vitest';

// Setup environment variables
beforeEach(() => {
  process.env.NODE_ENV = 'test';
});

// Cleanup environment variables
afterEach(() => {
  delete process.env.AGENT_WORLD_DATA_PATH;
  delete process.env.AGENT_WORLD_ID;
  delete process.env.NODE_ENV;
});
