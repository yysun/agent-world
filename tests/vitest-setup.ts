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
  let eventStorage: any = null;

  return {
    getSharedStorage: () => {
      if (!storage) {
        // Lazy initialization - MemoryStorage not yet imported during hoisting
        const { MemoryStorage } = require('./core/storage/memory-storage');
        const { createMemoryEventStorage } = require('./core/storage/eventStorage/index');
        storage = new MemoryStorage();
        eventStorage = createMemoryEventStorage();
        // Attach event storage to main storage
        storage.eventStorage = eventStorage;
      }
      return storage;
    },
    clearSharedStorage: () => {
      const { MemoryStorage } = require('./core/storage/memory-storage');
      const { createMemoryEventStorage } = require('./core/storage/eventStorage/index');
      storage = new MemoryStorage();
      eventStorage = createMemoryEventStorage();
      // Attach event storage to main storage
      storage.eventStorage = eventStorage;
    }
  };
});

// Hoist nanoid counter pattern
const { getNanoidId } = vi.hoisted(() => {
  let nanoidCounter = 0;

  return {
    getNanoidId: (size?: number) => {
      const counter = ++nanoidCounter;
      // Use counter as primary uniqueness guarantee (not timestamp)
      // This ensures each call gets a unique ID even in rapid succession
      const uniqueId = `mock-id-${counter}`;
      return size ? uniqueId.substring(0, Math.min(size, uniqueId.length)) : uniqueId;
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
    // Mock getDefaultRootPath to avoid file system access
    getDefaultRootPath: vi.fn<any>().mockReturnValue('/test/data'),

    // Mock createStorageFromEnv to always return MemoryStorage (no SQLite detection)
    createStorageFromEnv: vi.fn<any>(async () => getSharedStorage()),

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
  nanoid: (size?: number) => getNanoidId(size)
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
  default: {
    Database: vi.fn(() => ({
      run: vi.fn((sql: any, params: any, callback: any) => {
        if (callback) callback(null);
      }),
      get: vi.fn((sql: any, params: any, callback: any) => {
        if (callback) callback(null, {});
      }),
      all: vi.fn((sql: any, params: any, callback: any) => {
        if (callback) callback(null, []);
      }),
      close: vi.fn((callback: any) => {
        if (callback) callback(null);
      }),
      serialize: vi.fn((callback: any) => {
        if (callback) callback();
      })
    })),
    OPEN_READWRITE: 2,
    OPEN_CREATE: 4
  },
  // Also export named exports for dual-mode compatibility
  Database: vi.fn(() => ({
    run: vi.fn((sql: any, params: any, callback: any) => {
      if (callback) callback(null);
    }),
    get: vi.fn((sql: any, params: any, callback: any) => {
      if (callback) callback(null, {});
    }),
    all: vi.fn((sql: any, params: any, callback: any) => {
      if (callback) callback(null, []);
    }),
    close: vi.fn((callback: any) => {
      if (callback) callback(null);
    }),
    serialize: vi.fn((callback: any) => {
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

  // Enable synchronous event persistence for reliable testing
  process.env.SYNC_EVENT_PERSISTENCE = 'true';

  // Use memory storage by default
  process.env.AGENT_WORLD_STORAGE_TYPE = 'memory';
});

// Suppress unhandled rejections from SQLite initialization in module loading
// This can happen when some modules are loaded before mocks are fully applied
const originalUnhandledRejection = process.listeners('unhandledRejection');
beforeAll(() => {
  process.removeAllListeners('unhandledRejection');
  process.on('unhandledRejection', (reason: any) => {
    // Ignore SQLite browser environment errors during test setup
    if (reason?.message?.includes('SQLite not available in browser environment')) {
      return; // Suppress this specific error
    }
    // Re-throw other unhandled rejections
    throw reason;
  });
});

afterAll(() => {
  process.removeAllListeners('unhandledRejection');
  // Restore original handlers
  originalUnhandledRejection.forEach((handler) => {
    process.on('unhandledRejection', handler as any);
  });
});

// Global afterEach cleanup
afterEach(() => {
  // Clean up environment variables
  delete process.env.AGENT_WORLD_DATA_PATH;
  delete process.env.AGENT_WORLD_ID;
  delete process.env.NODE_ENV;
  delete process.env.SYNC_EVENT_PERSISTENCE;
  delete process.env.AGENT_WORLD_STORAGE_TYPE;
  delete process.env.DISABLE_EVENT_PERSISTENCE;
});

