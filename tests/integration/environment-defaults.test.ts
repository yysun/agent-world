import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { getDefaultRootPath } from '../../core/storage-factory.js';
import path from 'path';

describe('Environment Variable Defaults Consistency', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  test('should use HOME/agent-world as default when no AGENT_WORLD_DATA_PATH is set', () => {
    // Clear the environment variable
    delete process.env.AGENT_WORLD_DATA_PATH;
    
    const defaultPath = getDefaultRootPath();
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    const expectedPath = homeDir ? path.join(homeDir, 'agent-world') : './agent-world';
    
    expect(defaultPath).toBe(expectedPath);
  });

  test('should use AGENT_WORLD_DATA_PATH when set', () => {
    const customPath = '/custom/test/path';
    process.env.AGENT_WORLD_DATA_PATH = customPath;
    
    const defaultPath = getDefaultRootPath();
    
    expect(defaultPath).toBe(customPath);
  });

  test('should fallback to ./agent-world when no home directory is available', () => {
    // Clear environment variables
    delete process.env.AGENT_WORLD_DATA_PATH;
    delete process.env.HOME;
    delete process.env.USERPROFILE;
    
    const defaultPath = getDefaultRootPath();
    
    expect(defaultPath).toBe('./agent-world');
  });
});