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
 * - Conditional mocking (excludes integration tests)
 */

// Mock crypto and performance globals before any imports
const mockCrypto = {
  randomUUID: jest.fn<any>().mockReturnValue('mock-uuid-id')
};
global.crypto = mockCrypto as any;
global.performance = {
  now: jest.fn<any>().mockReturnValue(Date.now())
} as any;

import { jest } from '@jest/globals';

// Mock core/utils module to prevent crypto dependency issues

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
jest.mock('../../core/storage/agent-storage', () => ({
  saveAgentMemoryToDisk: jest.fn<any>().mockResolvedValue(undefined),
  saveAgentConfigToDisk: jest.fn<any>().mockResolvedValue(undefined),
  loadAgentMemoryFromDisk: jest.fn<any>().mockResolvedValue([]),
  loadAgentConfigFromDisk: jest.fn<any>().mockResolvedValue({}),
  saveWorldToDisk: jest.fn<any>().mockResolvedValue(undefined),
  loadWorldFromDisk: jest.fn<any>().mockResolvedValue({})
}));

// Mock world-storage module for new world storage operations
jest.mock('../../core/storage/world-storage', () => ({
  saveWorldData: jest.fn<any>().mockResolvedValue(undefined),
  loadWorldData: jest.fn<any>().mockResolvedValue({}),
  deleteWorldData: jest.fn<any>().mockResolvedValue(true),
  listWorldData: jest.fn<any>().mockResolvedValue([]),
  saveWorldChat: jest.fn<any>().mockResolvedValue(undefined),
  loadWorldChat: jest.fn<any>().mockResolvedValue(null),
  loadWorldChatFull: jest.fn<any>().mockResolvedValue(null),
  deleteWorldChat: jest.fn<any>().mockResolvedValue(true),
  listWorldChats: jest.fn<any>().mockResolvedValue([])
}));

// Mock storage-factory module with enhanced API coverage
jest.mock('../../core/storage/storage-factory', () => {
  // Import the actual module to get real function implementations
  const actualModule = jest.requireActual('../../core/storage/storage-factory') as any;

  return {
    // Re-export actual functions that integration tests need
    getDefaultRootPath: actualModule.getDefaultRootPath,
    createStorageFromEnv: actualModule.createStorageFromEnv,

    // Override only the storage creation functions with mocks
    createStorageWrappers: jest.fn<any>().mockReturnValue({
      // World operations
      saveWorld: jest.fn<any>().mockResolvedValue(undefined),
      loadWorld: jest.fn<any>().mockResolvedValue({}),
      deleteWorld: jest.fn<any>().mockResolvedValue(true),
      listWorlds: jest.fn<any>().mockResolvedValue([]),
      worldExists: jest.fn<any>().mockResolvedValue(true),

      // Agent operations
      saveAgent: jest.fn<any>().mockResolvedValue(undefined),
      saveAgentConfig: jest.fn<any>().mockResolvedValue(undefined),
      saveAgentMemory: jest.fn<any>().mockResolvedValue(undefined),
      loadAgent: jest.fn<any>().mockResolvedValue(null),
      loadAgentWithRetry: jest.fn<any>().mockResolvedValue(null),
      deleteAgent: jest.fn<any>().mockResolvedValue(true),
      listAgents: jest.fn<any>().mockResolvedValue([]),
      agentExists: jest.fn<any>().mockResolvedValue(true),

      // Batch operations
      saveAgentsBatch: jest.fn<any>().mockResolvedValue(undefined),
      loadAgentsBatch: jest.fn<any>().mockResolvedValue({ successful: [], failed: [] }),

      // Chat history operations
      saveChat: jest.fn<any>().mockResolvedValue(undefined),
      loadChat: jest.fn<any>().mockResolvedValue(null),
      deleteChat: jest.fn<any>().mockResolvedValue(true),
      listChats: jest.fn<any>().mockResolvedValue([]),
      updateChat: jest.fn<any>().mockResolvedValue(null),

      // Snapshot operations
      saveSnapshot: jest.fn<any>().mockResolvedValue(undefined),
      loadSnapshot: jest.fn<any>().mockResolvedValue(null),
      restoreFromSnapshot: jest.fn<any>().mockResolvedValue(true),

      // Integrity operations
      validateIntegrity: jest.fn<any>().mockResolvedValue({ isValid: true }),
      repairData: jest.fn<any>().mockResolvedValue(true),
      archiveMemory: jest.fn<any>().mockResolvedValue(undefined)
    }),

    createStorageWithWrappers: jest.fn<any>().mockResolvedValue({
      // Mirror the same API
      saveWorld: jest.fn<any>().mockResolvedValue(undefined),
      loadWorld: jest.fn<any>().mockResolvedValue({}),
      deleteWorld: jest.fn<any>().mockResolvedValue(true),
      listWorlds: jest.fn<any>().mockResolvedValue([])
    })
  };
});

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

// Mock nanoid for unique ID generation
jest.mock('nanoid', () => ({
  nanoid: jest.fn<any>().mockReturnValue('mock-nanoid-id')
}));

// Mock SQLite storage modules for new storage backend
jest.mock('../../core/storage/sqlite-storage', () => ({
  SQLiteStorage: jest.fn<any>().mockImplementation(() => ({
    // World operations
    saveWorld: jest.fn<any>().mockResolvedValue(undefined),
    loadWorld: jest.fn<any>().mockResolvedValue({}),
    deleteWorld: jest.fn<any>().mockResolvedValue(true),
    listWorlds: jest.fn<any>().mockResolvedValue([]),

    // Agent operations
    saveAgent: jest.fn<any>().mockResolvedValue(undefined),
    loadAgent: jest.fn<any>().mockResolvedValue(null),
    deleteAgent: jest.fn<any>().mockResolvedValue(true),
    listAgents: jest.fn<any>().mockResolvedValue([]),

    // Chat and snapshot operations
    saveChat: jest.fn<any>().mockResolvedValue(undefined),
    loadChat: jest.fn<any>().mockResolvedValue(null),
    deleteChat: jest.fn<any>().mockResolvedValue(true),
    listChats: jest.fn<any>().mockResolvedValue([]),
    updateChat: jest.fn<any>().mockResolvedValue(null),
    saveSnapshot: jest.fn<any>().mockResolvedValue(undefined),
    loadSnapshot: jest.fn<any>().mockResolvedValue(null),
    restoreFromSnapshot: jest.fn<any>().mockResolvedValue(true),

    // Batch and integrity operations
    saveAgentsBatch: jest.fn<any>().mockResolvedValue(undefined),
    loadAgentsBatch: jest.fn<any>().mockResolvedValue([]),
    validateIntegrity: jest.fn<any>().mockResolvedValue(true),
    repairData: jest.fn<any>().mockResolvedValue(true),

    // Database management
    initialize: jest.fn<any>().mockResolvedValue(undefined),
    close: jest.fn<any>().mockResolvedValue(undefined)
  }))
}));

// Mock sqlite3 module
jest.mock('sqlite3', () => ({
  Database: jest.fn<any>().mockImplementation(() => ({
    run: jest.fn<any>().mockImplementation((sql: any, params: any, callback: any) => {
      if (callback) callback(null);
    }),
    get: jest.fn<any>().mockImplementation((sql: any, params: any, callback: any) => {
      if (callback) callback(null, {});
    }),
    all: jest.fn<any>().mockImplementation((sql: any, params: any, callback: any) => {
      if (callback) callback(null, []);
    }),
    close: jest.fn<any>().mockImplementation((callback: any) => {
      if (callback) callback(null);
    }),
    serialize: jest.fn<any>().mockImplementation((callback: any) => {
      if (callback) callback();
    })
  })),
  OPEN_READWRITE: 2,
  OPEN_CREATE: 4
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
