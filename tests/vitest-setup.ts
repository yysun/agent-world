/**
 * Vitest Setup for Unit Tests
 * 
 * Features:
 * - Global mock configuration for file I/O, LLM providers, and storage
 * - Real MemoryStorage with shared instance pattern for test isolation
 * - Deterministic ID generation (crypto.randomUUID, nanoid)
 * - Mock implementations for OpenAI, Anthropic, Google AI SDKs
 * - Automatic test environment setup and cleanup
 * 
 * Storage Strategy:
 * - Shared MemoryStorage instance ensures data persistence across mocks
 * - Test utilities available via __testUtils for storage management
 * - SQLite mocks prevent browser environment errors
 */

import { vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

// Configure test environment before any module imports
process.env.NODE_ENV = 'test';
process.env.AGENT_WORLD_STORAGE_TYPE = 'memory';

// Mock crypto.randomUUID and performance.now() for deterministic testing
Object.defineProperty(global, 'crypto', {
  value: { randomUUID: vi.fn(() => 'mock-uuid-id') },
  writable: true,
  configurable: true
});

Object.defineProperty(global, 'performance', {
  value: { now: vi.fn(() => Date.now()) },
  writable: true,
  configurable: true
});

// Hoisted shared storage for consistent test data
const { getSharedStorage, clearSharedStorage } = vi.hoisted(() => {
  let storage: any = null;
  let eventStorage: any = null;

  return {
    getSharedStorage: () => {
      if (!storage) {
        const { MemoryStorage } = require('./core/storage/memory-storage');
        const { createMemoryEventStorage } = require('./core/storage/eventStorage/index');
        storage = new MemoryStorage();
        eventStorage = createMemoryEventStorage();
        storage.eventStorage = eventStorage;
      }
      return storage;
    },
    clearSharedStorage: () => {
      const { MemoryStorage } = require('./core/storage/memory-storage');
      const { createMemoryEventStorage } = require('./core/storage/eventStorage/index');
      storage = new MemoryStorage();
      eventStorage = createMemoryEventStorage();
      storage.eventStorage = eventStorage;
    }
  };
});

// Hoisted nanoid counter for deterministic ID generation
const { getNanoidId } = vi.hoisted(() => {
  let nanoidCounter = 0;
  return {
    getNanoidId: (size?: number) => {
      const uniqueId = `mock-id-${++nanoidCounter}`;
      return size ? uniqueId.substring(0, Math.min(size, uniqueId.length)) : uniqueId;
    }
  };
});

// Mock fs module (both promises and sync methods)
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
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(() => undefined),
  readFileSync: vi.fn(() => '{}'),
  writeFileSync: vi.fn(() => undefined),
  readdirSync: vi.fn(() => []),
  statSync: vi.fn(() => ({
    isDirectory: () => false,
    isFile: () => true
  })),
  unlinkSync: vi.fn(() => undefined),
  rmdirSync: vi.fn(() => undefined)
}));

// Mock storage modules to prevent disk I/O
vi.mock('./core/storage/agent-storage', () => ({
  saveAgentMemoryToDisk: vi.fn<any>().mockResolvedValue(undefined),
  saveAgentConfigToDisk: vi.fn<any>().mockResolvedValue(undefined),
  loadAgentMemoryFromDisk: vi.fn<any>().mockResolvedValue([]),
  loadAgentConfigFromDisk: vi.fn<any>().mockResolvedValue({}),
  saveWorldToDisk: vi.fn<any>().mockResolvedValue(undefined),
  loadWorldFromDisk: vi.fn<any>().mockResolvedValue({})
}));

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

// Mock storage-factory to use shared MemoryStorage instance
vi.mock('./core/storage/storage-factory', async () => {
  const actualModule = await vi.importActual('./core/storage/storage-factory') as any;

  return {
    getDefaultRootPath: vi.fn<any>().mockReturnValue('/test/data'),
    createStorageFromEnv: vi.fn<any>(async () => getSharedStorage()),
    createStorageWrappers: vi.fn<any>(() => getSharedStorage()),
    createStorageWithWrappers: vi.fn<any>(async () => getSharedStorage()),
    getStorageWrappers: vi.fn<any>(async () => getSharedStorage()),
    setStoragePath: vi.fn<any>().mockResolvedValue(undefined),
    __testUtils: {
      clearStorage: clearSharedStorage,
      getStorage: getSharedStorage
    }
  };
});

// Mock LLM integration modules with default responses
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
  isOpenAIProvider: vi.fn<any>().mockReturnValue(false),
  isAnthropicProvider: vi.fn<any>().mockReturnValue(false),
  isGoogleProvider: vi.fn<any>().mockReturnValue(false)
}));

// Mock path module
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

// Mock LLM SDK packages
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

// Mock utility modules
vi.mock('dotenv', () => ({
  default: { config: vi.fn(() => ({ parsed: {} })) },
  config: vi.fn(() => ({ parsed: {} }))
}));

vi.mock('nanoid', () => ({
  nanoid: (size?: number) => getNanoidId(size)
}));

// Mock SQLite storage modules
vi.mock('./core/storage/sqlite-storage', () => ({
  SQLiteStorage: vi.fn<any>().mockImplementation(() => ({
    saveWorld: vi.fn<any>().mockResolvedValue(undefined),
    loadWorld: vi.fn<any>().mockResolvedValue({}),
    deleteWorld: vi.fn<any>().mockResolvedValue(true),
    listWorlds: vi.fn<any>().mockResolvedValue([]),
    saveAgent: vi.fn<any>().mockResolvedValue(undefined),
    loadAgent: vi.fn<any>().mockResolvedValue(null),
    deleteAgent: vi.fn<any>().mockResolvedValue(true),
    listAgents: vi.fn<any>().mockResolvedValue([]),
    saveChat: vi.fn<any>().mockResolvedValue(undefined),
    loadChat: vi.fn<any>().mockResolvedValue(null),
    deleteChat: vi.fn<any>().mockResolvedValue(true),
    listChats: vi.fn<any>().mockResolvedValue([]),
    updateChat: vi.fn<any>().mockResolvedValue(null),
    saveSnapshot: vi.fn<any>().mockResolvedValue(undefined),
    loadSnapshot: vi.fn<any>().mockResolvedValue(null),
    restoreFromSnapshot: vi.fn<any>().mockResolvedValue(true),
    saveAgentsBatch: vi.fn<any>().mockResolvedValue(undefined),
    loadAgentsBatch: vi.fn<any>().mockResolvedValue([]),
    validateIntegrity: vi.fn<any>().mockResolvedValue(true),
    repairData: vi.fn<any>().mockResolvedValue(true),
    initialize: vi.fn<any>().mockResolvedValue(undefined),
    close: vi.fn<any>().mockResolvedValue(undefined)
  })),
  createSQLiteStorageContext: vi.fn<any>().mockResolvedValue({
    storage: getSharedStorage(),
    close: vi.fn<any>().mockResolvedValue(undefined)
  })
}));

vi.mock('./core/storage/sqlite-schema', () => ({
  createSQLiteSchemaContext: vi.fn<any>().mockResolvedValue({
    db: {
      run: vi.fn((sql: any, params: any, callback: any) => callback && callback(null)),
      get: vi.fn((sql: any, params: any, callback: any) => callback && callback(null, {})),
      all: vi.fn((sql: any, params: any, callback: any) => callback && callback(null, [])),
      close: vi.fn((callback: any) => callback && callback(null)),
      serialize: vi.fn((callback: any) => callback && callback())
    },
    config: { database: ':memory:' },
    isInitialized: true
  }),
  configurePragmas: vi.fn<any>(),
  runMigrations: vi.fn<any>().mockResolvedValue(undefined)
}));

vi.mock('sqlite3', () => ({
  default: {
    Database: vi.fn(() => ({
      run: vi.fn((sql: any, params: any, callback: any) => callback && callback(null)),
      get: vi.fn((sql: any, params: any, callback: any) => callback && callback(null, {})),
      all: vi.fn((sql: any, params: any, callback: any) => callback && callback(null, [])),
      close: vi.fn((callback: any) => callback && callback(null)),
      serialize: vi.fn((callback: any) => callback && callback())
    })),
    OPEN_READWRITE: 2,
    OPEN_CREATE: 4
  },
  Database: vi.fn(() => ({
    run: vi.fn((sql: any, params: any, callback: any) => callback && callback(null)),
    get: vi.fn((sql: any, params: any, callback: any) => callback && callback(null, {})),
    all: vi.fn((sql: any, params: any, callback: any) => callback && callback(null, [])),
    close: vi.fn((callback: any) => callback && callback(null)),
    serialize: vi.fn((callback: any) => callback && callback())
  })),
  OPEN_READWRITE: 2,
  OPEN_CREATE: 4
}));

// Lifecycle hooks
const originalCwd = process.cwd;

beforeAll(() => {
  process.cwd = vi.fn<any>().mockReturnValue('/test');
});

afterAll(() => {
  process.cwd = originalCwd;
});

beforeEach(() => {
  // Note: Storage mocks maintain state via shared Maps for test isolation
  // Tests using beforeAll() preserve data across individual tests
  // Each test suite uses unique IDs (nanoid) for isolation
  delete process.env.AGENT_WORLD_DATA_PATH;
  delete process.env.AGENT_WORLD_ID;
});

afterEach(() => {
  delete process.env.AGENT_WORLD_DATA_PATH;
  delete process.env.AGENT_WORLD_ID;
  delete process.env.NODE_ENV;
  delete process.env.SYNC_EVENT_PERSISTENCE;
  delete process.env.AGENT_WORLD_STORAGE_TYPE;
  delete process.env.DISABLE_EVENT_PERSISTENCE;
});

// Error suppression for SQLite initialization errors during module loading
const originalUnhandledRejection = process.listeners('unhandledRejection');
let suppressedErrors: any[] = [];

beforeAll(() => {
  process.removeAllListeners('unhandledRejection');
  process.on('unhandledRejection', (reason: any) => {
    // Suppress SQLite browser and storage initialization errors silently
    if (reason?.message?.includes('SQLite not available in browser environment') ||
      reason?.message?.includes('createStorageFromEnv')) {
      suppressedErrors.push(reason);
      return;
    }
    throw reason;
  });
});

afterAll(() => {
  process.removeAllListeners('unhandledRejection');
  originalUnhandledRejection.forEach((handler) => {
    process.on('unhandledRejection', handler as any);
  });
  if (suppressedErrors.length > 0 && !process.env.CI) {
    console.log(`[Test Setup] Suppressed ${suppressedErrors.length} storage initialization errors`);
  }
  suppressedErrors = [];
});

afterEach(() => {
  delete process.env.AGENT_WORLD_DATA_PATH;
  delete process.env.AGENT_WORLD_ID;
  delete process.env.NODE_ENV;
  delete process.env.SYNC_EVENT_PERSISTENCE;
  delete process.env.AGENT_WORLD_STORAGE_TYPE;
  delete process.env.DISABLE_EVENT_PERSISTENCE;
});

