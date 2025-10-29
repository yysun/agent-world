/**
 * Vitest Setup for Unit Tests
 * 
 * Minimal setup for initial POC test
 * Will be expanded with full mock system in Phase 2
 */

import { beforeEach, afterEach } from 'vitest';

// Setup environment
beforeEach(() => {
  process.env.NODE_ENV = 'test';
});

// Cleanup
afterEach(() => {
  delete process.env.AGENT_WORLD_DATA_PATH;
  delete process.env.AGENT_WORLD_ID;
  delete process.env.NODE_ENV;
});
