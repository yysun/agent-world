/**
 * Jest Setup for Core System Tests
 *
 * Features:
 * - Global mock configuration for all file I/O operations
 * - LLM provider mocking with default responses
 * - Agent storage mocking to prevent disk operations
 * - Real logger for debugging test issues
 * - Test environment setup
 * - Automatic cleanup between tests
 */

import { jest } from '@jest/globals';

// Mock fs module globally (not fs/promises)
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn<any>().mockResolvedValue('{}'),
    writeFile: jest.fn<any>().mockResolvedValue(undefined),
    mkdir: jest.fn<any>().mockResolvedValue(undefined),
    rm: jest.fn<any>().mockResolvedValue(undefined),
    access: jest.fn<any>().mockResolvedValue(undefined),
    readdir: jest.fn<any>().mockResolvedValue([]),
    rename: jest.fn<any>().mockResolvedValue(undefined),
    unlink: jest.fn<any>().mockResolvedValue(undefined)
  }
}));

// Mock agent-storage module globally to prevent actual disk I/O
jest.mock('../../core/agent-storage', () => ({
  saveAgentMemoryToDisk: jest.fn<any>().mockResolvedValue(undefined),
  saveAgentConfigToDisk: jest.fn<any>().mockResolvedValue(undefined),
  loadAgentMemoryFromDisk: jest.fn<any>().mockResolvedValue([]),
  loadAgentConfigFromDisk: jest.fn<any>().mockResolvedValue({}),
  saveWorldToDisk: jest.fn<any>().mockResolvedValue(undefined),
  loadWorldFromDisk: jest.fn<any>().mockResolvedValue({})
}));

// Mock LLM manager globally with default successful responses
jest.mock('../../core/llm-manager', () => ({
  streamAgentResponse: jest.fn<any>().mockResolvedValue('Mock LLM response'),
  generateAgentResponse: jest.fn<any>().mockResolvedValue('Mock LLM response'),
  LLMConfig: jest.fn<any>()
}));

// Mock path module with all necessary functions
jest.mock('path', () => ({
  join: (...paths: string[]) => paths.filter(p => p).join('/'),
  dirname: (path: string) => path.split('/').slice(0, -1).join('/'),
  basename: (path: string) => path.split('/').pop() || '',
  extname: (path: string) => {
    const name = path.split('/').pop() || '';
    const lastDot = name.lastIndexOf('.');
    return lastDot >= 0 ? name.substring(lastDot) : '';
  },
  resolve: (...paths: string[]) => '/' + paths.filter(p => p).join('/').replace(/\/+/g, '/'),
  relative: (from: string, to: string) => to,
  isAbsolute: (path: string) => path.startsWith('/'),
  parse: (path: string) => ({
    root: '/',
    dir: path.split('/').slice(0, -1).join('/'),
    base: path.split('/').pop() || '',
    ext: '',
    name: path.split('/').pop() || ''
  })
}));

// Mock AI SDK for direct LLM testing
jest.mock('ai', () => ({
  generateText: jest.fn<any>().mockResolvedValue({ text: 'Mock AI response' }),
  streamText: jest.fn<any>().mockResolvedValue({ textStream: async function* () { yield 'Mock'; yield ' response'; } }),
  createOpenAI: jest.fn<any>().mockReturnValue({}),
  createAnthropic: jest.fn<any>().mockReturnValue({}),
  createGoogle: jest.fn<any>().mockReturnValue({})
}));

// Mock dotenv
jest.mock('dotenv', () => ({
  config: jest.fn<any>().mockReturnValue({ parsed: {} })
}));

// Mock process functions
const originalCwd = process.cwd;
beforeAll(() => {
  process.cwd = jest.fn<any>().mockReturnValue('/test');
});

afterAll(() => {
  process.cwd = originalCwd;
});

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
