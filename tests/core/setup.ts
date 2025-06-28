/**
 * Jest Setup for Core System Tests
 * 
 * Features:
 * - Global mock configuration for fs/promises
 * - LLM provider mocking
 * - Test environment setup
 * - Automatic cleanup between tests
 */

import { jest } from '@jest/globals';

// Mock fs module globally (not fs/promises)
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    mkdir: jest.fn(),
    rm: jest.fn(),
    access: jest.fn(),
    readdir: jest.fn(),
    rename: jest.fn(),
    unlink: jest.fn()
  }
}));

// Mock path module (usually doesn't need mocking but can be useful)
jest.mock('path', () => ({
  join: (...paths: string[]) => paths.filter(p => p).join('/'),
  dirname: (path: string) => path.split('/').slice(0, -1).join('/'),
  basename: (path: string) => path.split('/').pop() || '',
  extname: (path: string) => {
    const name = path.split('/').pop() || '';
    const lastDot = name.lastIndexOf('.');
    return lastDot >= 0 ? name.substring(lastDot) : '';
  }
}));

// Mock LLM manager
jest.mock('../../core/llm-manager.js', () => ({
  streamAgentResponse: jest.fn(),
  generateAgentResponse: jest.fn(),
  LLMConfig: jest.fn()
}), { virtual: true });

// Global test timeout
jest.setTimeout(10000);

// Global beforeEach setup
beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();

  // Reset environment variables
  delete process.env.AGENT_WORLD_DATA_PATH;
  delete process.env.AGENT_WORLD_ID;

  // Set test environment
  process.env.NODE_ENV = 'test';
});

// Global afterEach cleanup
afterEach(() => {
  // Clean up environment variables
  delete process.env.AGENT_WORLD_DATA_PATH;
  delete process.env.AGENT_WORLD_ID;
  delete process.env.NODE_ENV;
});
