/**
 * Jest Setup for Core System Tests
 *
 * Features:
 * - Global mock configuration for file I/O operations
 * - Uses REAL MemoryStorage instead of mocks (~400 lines eliminated!)
 * - LLM provider mocking with default responses
 * - Real logger for debugging test issues
 * - Test environment setup and automatic cleanup
 * - Conditional mocking (excludes integration tests)
 * 
 * Storage Strategy:
 * - All tests use real MemoryStorage class from core/storage/memory-storage.ts
 * - Shared instance ensures data persistence across mock calls
 * - Full StorageAPI compatibility with production code
 * - Test utilities available via __testUtils for storage clearing
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

// Mock storage-factory module to use real MemoryStorage
jest.mock('../../core/storage/storage-factory', () => {
  // Import the actual module to get real function implementations
  const actualModule = jest.requireActual('../../core/storage/storage-factory') as any;
  const { MemoryStorage } = jest.requireActual('../../core/storage/memory-storage') as any;

  /**
   * Shared MemoryStorage instance for all tests
   * 
   * Using a single instance ensures that when different parts of the code
   * get storage instances, they all share the same underlying data.
   * Critical for tests where:
   * - createWorld() gets one storage instance to check worldExists()
   * - Then saves the world with saveWorld()
   * - Then getWorld() gets another storage instance to load the same world
   */
  let sharedStorage: any = new MemoryStorage();

  return {
    // Re-export actual functions that integration tests need
    getDefaultRootPath: actualModule.getDefaultRootPath,
    createStorageFromEnv: actualModule.createStorageFromEnv,

    // All storage creation functions return the shared MemoryStorage instance
    createStorageWrappers: jest.fn<any>().mockImplementation(() => sharedStorage),
    createStorageWithWrappers: jest.fn<any>().mockImplementation(async () => sharedStorage),
    getStorageWrappers: jest.fn<any>().mockImplementation(async () => sharedStorage),
    setStoragePath: jest.fn<any>().mockResolvedValue(undefined),

    // Test utilities for clearing storage between tests
    __testUtils: {
      clearStorage: () => {
        // Create a fresh MemoryStorage instance
        sharedStorage = new MemoryStorage();
      },
      getStorage: () => sharedStorage
    }
  };
});

// Mock direct integration modules
jest.mock('../../core/openai-direct', () => ({
  createOpenAIClientForAgent: jest.fn<any>().mockReturnValue({}),
  createClientForProvider: jest.fn<any>().mockReturnValue({}),
  streamOpenAIResponse: jest.fn<any>().mockResolvedValue('Mock OpenAI streaming response'),
  generateOpenAIResponse: jest.fn<any>().mockResolvedValue('Mock OpenAI response')
}));

jest.mock('../../core/anthropic-direct', () => ({
  createAnthropicClientForAgent: jest.fn<any>().mockReturnValue({}),
  streamAnthropicResponse: jest.fn<any>().mockResolvedValue('Mock Anthropic streaming response'),
  generateAnthropicResponse: jest.fn<any>().mockResolvedValue('Mock Anthropic response')
}));

jest.mock('../../core/google-direct', () => ({
  createGoogleClientForAgent: jest.fn<any>().mockReturnValue({}),
  streamGoogleResponse: jest.fn<any>().mockResolvedValue('Mock Google streaming response'),
  generateGoogleResponse: jest.fn<any>().mockResolvedValue('Mock Google response')
}));
jest.mock('../../core/llm-manager', () => ({
  streamAgentResponse: jest.fn<any>().mockResolvedValue('Mock direct integration streaming response'),
  generateAgentResponse: jest.fn<any>().mockResolvedValue('Mock direct integration response'),
  getLLMQueueStatus: jest.fn<any>().mockReturnValue({
    queueSize: 0,
    isProcessing: false,
    completedCalls: 0,
    failedCalls: 0
  }),
  clearLLMQueue: jest.fn<any>().mockResolvedValue(undefined),
  // Provider helper functions for testing
  isOpenAIProvider: jest.fn<any>().mockReturnValue(false),
  isAnthropicProvider: jest.fn<any>().mockReturnValue(false),
  isGoogleProvider: jest.fn<any>().mockReturnValue(false)
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

// Mock Direct SDK packages for LLM testing
// Mock OpenAI SDK
jest.mock('openai', () => ({
  default: jest.fn<any>().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn<any>().mockResolvedValue({
          choices: [{ message: { content: 'Mock OpenAI response', tool_calls: [] } }]
        })
      }
    }
  }))
}));

// Mock Anthropic SDK
jest.mock('@anthropic-ai/sdk', () => ({
  default: jest.fn<any>().mockImplementation(() => ({
    messages: {
      create: jest.fn<any>().mockResolvedValue({
        content: [{ type: 'text', text: 'Mock Anthropic response' }],
        role: 'assistant'
      }),
      stream: jest.fn<any>().mockImplementation(async function* () {
        yield { type: 'content_block_delta', delta: { text: 'Mock Anthropic streaming response' } };
      })
    }
  }))
}));

// Mock Google Generative AI SDK
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn<any>().mockImplementation(() => ({
    getGenerativeModel: jest.fn<any>().mockReturnValue({
      generateContent: jest.fn<any>().mockResolvedValue({
        response: {
          text: jest.fn<any>().mockReturnValue('Mock Google response')
        }
      }),
      generateContentStream: jest.fn<any>().mockResolvedValue({
        stream: (async function* () {
          yield { text: jest.fn<any>().mockReturnValue('Mock Google streaming response') };
        })()
      })
    })
  }))
}));

// Mock dotenv
jest.mock('dotenv', () => ({
  config: jest.fn<any>().mockReturnValue({ parsed: {} })
}));

// Mock nanoid for unique ID generation
// Return unique IDs for each call to prevent test collisions
let nanoidCounter = 0;
jest.mock('nanoid', () => ({
  nanoid: jest.fn<any>().mockImplementation((size?: number) => {
    nanoidCounter++;
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    return `mock-id-${timestamp}-${random}-${nanoidCounter}`.substring(0, size || 21);
  })
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
  // DON'T clear mocks because it resets our stateful mock implementations
  // jest.clearAllMocks();  // <-- This was breaking our stateful mocks!

  // Note: Our storage mocks maintain state in shared Maps
  // Tests using beforeAll() need data to persist across individual tests
  // Each test suite uses unique IDs (nanoid) for isolation
  // Tests that need clean state should create fresh data in their own beforeEach()

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
