/**
 * Vitest Setup for Unit Tests
 * 
 * Converted from Jest setup.ts with the following changes:
 * - Using vi.mock() instead of jest.mock()
 * - Using vi.hoisted() for stateful patterns (nanoidCounter, sharedStorage)
 * - Using vi.importActual() instead of jest.requireActual()
 * - Path adjustments for Vitest resolution
 * 
 * Features:
 * - Global mock configuration for file I/O operations
 * - Uses REAL MemoryStorage with shared instance pattern
 * - LLM provider mocking with default responses
 * - Test environment setup and automatic cleanup
 * 
 * Storage Strategy:
 * - All tests use real MemoryStorage class from core/storage/memory-storage.ts
 * - Shared instance ensures data persistence across mock calls
 * - Full StorageAPI compatibility with production code
 * - Test utilities available via __testUtils for storage clearing
 */

import { vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

// Mock crypto.randomUUID before any imports (using Object.defineProperty for read-only global)
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: vi.fn(() => 'mock-uuid-id')
  },
  writable: true,
  configurable: true
});

// Mock performance.now()
Object.defineProperty(global, 'performance', {
  value: {
    now: vi.fn(() => Date.now())
  },
  writable: true,
  configurable: true
});

// Hoist shared storage pattern for storage-factory mock
const { getSharedStorage, clearSharedStorage } = vi.hoisted(() => {
  let storage: any = null;
  
  return {
    getSharedStorage: () => {
      if (!storage) {
        // Lazy initialization - MemoryStorage not yet imported during hoisting
        const { MemoryStorage } = require('./core/storage/memory-storage');
        storage = new MemoryStorage();
      }
      return storage;
    },
    clearSharedStorage: () => {
      const { MemoryStorage } = require('./core/storage/memory-storage');
      storage = new MemoryStorage();
    }
  };
});

// Hoist nanoid counter pattern
const { getNanoidId, incrementNanoidCounter } = vi.hoisted(() => {
  let nanoidCounter = 0;
  
  return {
    incrementNanoidCounter: () => ++nanoidCounter,
    getNanoidId: (size?: number) => {
      const counter = ++nanoidCounter;
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 10000);
      return `mock-id-${timestamp}-${random}-${counter}`.substring(0, size || 21);
    }
  };
});

// Mock fs module globally (not fs/promises)
vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn<any>().mockResolvedValue('{}'),
    writeFile: vi.fn<any>().mockResolvedValue(undefined),
    mkdir: vi.fn<any>().mockResolvedValue(undefined),
    rm: vi.fn<any>().mockResolvedValue(undefined),
    access: vi.fn<any>().mockResolvedValue(undefined),
    readdir: vi.fn<any>().mockResolvedValue([]),
    rename: vi.fn<any>().mockResolvedValue(undefined),
    unlink: vi.fn<any>().mockResolvedValue(undefined)
  },
  // Sync methods for storage-factory
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(() => undefined),
  readFileSync: vi.fn(() => '{}'),
  writeFileSync: vi.fn(() => undefined)
}));

// Mock agent-storage module globally to prevent actual disk I/O
vi.mock('./core/storage/agent-storage', () => ({
  saveAgentMemoryToDisk: vi.fn<any>().mockResolvedValue(undefined),
  saveAgentConfigToDisk: vi.fn<any>().mockResolvedValue(undefined),
  loadAgentMemoryFromDisk: vi.fn<any>().mockResolvedValue([]),
  loadAgentConfigFromDisk: vi.fn<any>().mockResolvedValue({}),
  saveWorldToDisk: vi.fn<any>().mockResolvedValue(undefined),
  loadWorldFromDisk: vi.fn<any>().mockResolvedValue({})
}));

// Mock world-storage module for new world storage operations
vi.mock('./core/storage/world-storage', () => ({
  saveWorldData: vi.fn<any>().mockResolvedValue(undefined),
  loadWorldData: vi.fn<any>().mockResolvedValue({}),
  deleteWorldData: vi.fn<any>().mockResolvedValue(true),
  listWorldData: vi.fn<any>().mockResolvedValue([]),
  saveWorldChat: vi.fn<any>().mockResolvedValue(undefined),
  loadWorldChat: vi.fn<any>().mockResolvedValue(null),
  loadWorldChatFull: vi.fn<any>().mockResolvedValue(null),
  deleteWorldChat: vi.fn<any>().mockResolvedValue(true),
  listWorldChats: vi.fn<any>().mockResolvedValue([])
}));

// Mock storage-factory module to use real MemoryStorage with shared instance
vi.mock('./core/storage/storage-factory', async () => {
  const actualModule = await vi.importActual('./core/storage/storage-factory') as any;
  
  return {
    // Re-export actual functions that integration tests need
    getDefaultRootPath: actualModule.getDefaultRootPath,
    createStorageFromEnv: actualModule.createStorageFromEnv,

    // All storage creation functions return the shared MemoryStorage instance
    createStorageWrappers: vi.fn<any>(() => getSharedStorage()),
    createStorageWithWrappers: vi.fn<any>(async () => getSharedStorage()),
    getStorageWrappers: vi.fn<any>(async () => getSharedStorage()),
    setStoragePath: vi.fn<any>().mockResolvedValue(undefined),

    // Test utilities for clearing storage between tests
    __testUtils: {
      clearStorage: clearSharedStorage,
      getStorage: getSharedStorage
    }
  };
});

// Mock direct integration modules
vi.mock('./core/openai-direct', () => ({
  createOpenAIClientForAgent: vi.fn<any>().mockReturnValue({}),
  createClientForProvider: vi.fn<any>().mockReturnValue({}),
  streamOpenAIResponse: vi.fn<any>().mockResolvedValue('Mock OpenAI streaming response'),
  generateOpenAIResponse: vi.fn<any>().mockResolvedValue('Mock OpenAI response')
}));

vi.mock('./core/anthropic-direct', () => ({
  createAnthropicClientForAgent: vi.fn<any>().mockReturnValue({}),
  streamAnthropicResponse: vi.fn<any>().mockResolvedValue('Mock Anthropic streaming response'),
  generateAnthropicResponse: vi.fn<any>().mockResolvedValue('Mock Anthropic response')
}));

vi.mock('./core/google-direct', () => ({
  createGoogleClientForAgent: vi.fn<any>().mockReturnValue({}),
  streamGoogleResponse: vi.fn<any>().mockResolvedValue('Mock Google streaming response'),
  generateGoogleResponse: vi.fn<any>().mockResolvedValue('Mock Google response')
}));

vi.mock('./core/llm-manager', () => ({
  streamAgentResponse: vi.fn<any>().mockResolvedValue('Mock direct integration streaming response'),
  generateAgentResponse: vi.fn<any>().mockResolvedValue('Mock direct integration response'),
  getLLMQueueStatus: vi.fn<any>().mockReturnValue({
    queueSize: 0,
    isProcessing: false,
    completedCalls: 0,
    failedCalls: 0
  }),
  clearLLMQueue: vi.fn<any>().mockResolvedValue(undefined),
  // Provider helper functions for testing
  isOpenAIProvider: vi.fn<any>().mockReturnValue(false),
  isAnthropicProvider: vi.fn<any>().mockReturnValue(false),
  isGoogleProvider: vi.fn<any>().mockReturnValue(false)
}));

// Mock path module with all necessary functions
vi.mock('path', () => ({
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
vi.mock('openai', () => ({
  default: vi.fn<any>().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn<any>().mockResolvedValue({
          choices: [{ message: { content: 'Mock OpenAI response', tool_calls: [] } }]
        })
      }
    }
  }))
}));

// Mock Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn<any>().mockImplementation(() => ({
    messages: {
      create: vi.fn<any>().mockResolvedValue({
        content: [{ type: 'text', text: 'Mock Anthropic response' }],
        role: 'assistant'
      }),
      stream: vi.fn<any>().mockImplementation(async function* () {
        yield { type: 'content_block_delta', delta: { text: 'Mock Anthropic streaming response' } };
      })
    }
  }))
}));

// Mock Google Generative AI SDK
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn<any>().mockImplementation(() => ({
    getGenerativeModel: vi.fn<any>().mockReturnValue({
      generateContent: vi.fn<any>().mockResolvedValue({
        response: {
          text: vi.fn<any>().mockReturnValue('Mock Google response')
        }
      }),
      generateContentStream: vi.fn<any>().mockResolvedValue({
        stream: (async function* () {
          yield { text: vi.fn<any>().mockReturnValue('Mock Google streaming response') };
        })()
      })
    })
  }))
}));

// Mock dotenv
vi.mock('dotenv', () => ({
  default: {
    config: vi.fn(() => ({ parsed: {} }))
  },
  config: vi.fn(() => ({ parsed: {} }))
}));

// Mock nanoid for unique ID generation using hoisted counter
vi.mock('nanoid', () => ({
  nanoid: vi.fn((size?: number) => getNanoidId(size))
}));

// Mock SQLite storage modules for new storage backend
vi.mock('./core/storage/sqlite-storage', () => ({
  SQLiteStorage: vi.fn<any>().mockImplementation(() => ({
    // World operations
    saveWorld: vi.fn<any>().mockResolvedValue(undefined),
    loadWorld: vi.fn<any>().mockResolvedValue({}),
    deleteWorld: vi.fn<any>().mockResolvedValue(true),
    listWorlds: vi.fn<any>().mockResolvedValue([]),

    // Agent operations
    saveAgent: vi.fn<any>().mockResolvedValue(undefined),
    loadAgent: vi.fn<any>().mockResolvedValue(null),
    deleteAgent: vi.fn<any>().mockResolvedValue(true),
    listAgents: vi.fn<any>().mockResolvedValue([]),

    // Chat and snapshot operations
    saveChat: vi.fn<any>().mockResolvedValue(undefined),
    loadChat: vi.fn<any>().mockResolvedValue(null),
    deleteChat: vi.fn<any>().mockResolvedValue(true),
    listChats: vi.fn<any>().mockResolvedValue([]),
    updateChat: vi.fn<any>().mockResolvedValue(null),
    saveSnapshot: vi.fn<any>().mockResolvedValue(undefined),
    loadSnapshot: vi.fn<any>().mockResolvedValue(null),
    restoreFromSnapshot: vi.fn<any>().mockResolvedValue(true),

    // Batch and integrity operations
    saveAgentsBatch: vi.fn<any>().mockResolvedValue(undefined),
    loadAgentsBatch: vi.fn<any>().mockResolvedValue([]),
    validateIntegrity: vi.fn<any>().mockResolvedValue(true),
    repairData: vi.fn<any>().mockResolvedValue(true),

    // Database management
    initialize: vi.fn<any>().mockResolvedValue(undefined),
    close: vi.fn<any>().mockResolvedValue(undefined)
  }))
}));

// Mock sqlite3 module
vi.mock('sqlite3', () => ({
  Database: vi.fn<any>().mockImplementation(() => ({
    run: vi.fn<any>().mockImplementation((sql: any, params: any, callback: any) => {
      if (callback) callback(null);
    }),
    get: vi.fn<any>().mockImplementation((sql: any, params: any, callback: any) => {
      if (callback) callback(null, {});
    }),
    all: vi.fn<any>().mockImplementation((sql: any, params: any, callback: any) => {
      if (callback) callback(null, []);
    }),
    close: vi.fn<any>().mockImplementation((callback: any) => {
      if (callback) callback(null);
    }),
    serialize: vi.fn<any>().mockImplementation((callback: any) => {
      if (callback) callback();
    })
  })),
  OPEN_READWRITE: 2,
  OPEN_CREATE: 4
}));

// Mock process functions
const originalCwd = process.cwd;
beforeAll(() => {
  process.cwd = vi.fn<any>().mockReturnValue('/test');
});

afterAll(() => {
  process.cwd = originalCwd;
});

// Global test timeout (handled by vitest.config.ts, but keeping for reference)
// vi.setConfig({ testTimeout: 10000 });

// Global beforeEach setup
beforeEach(() => {
  // DON'T clear mocks because it resets our stateful mock implementations
  // vi.clearAllMocks();  // <-- This was breaking our stateful mocks!

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

