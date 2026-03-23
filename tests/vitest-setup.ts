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

import { fileURLToPath } from 'node:url';
import * as classicFs from 'fs';
import * as classicFsPromises from 'fs/promises';
import * as nodeFs from 'node:fs';
import * as nodeFsPromises from 'node:fs/promises';
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

const {
  actualNodeFs,
  actualNodeFsPromises,
  actualFs,
  actualFsPromises,
} = vi.hoisted(() => ({
  actualNodeFs: require('node:fs') as typeof import('node:fs'),
  actualNodeFsPromises: require('node:fs/promises') as typeof import('node:fs/promises'),
  actualFs: require('fs') as typeof import('fs'),
  actualFsPromises: require('fs/promises') as typeof import('fs/promises'),
}));

vi.mock('node:fs', () => ({
  ...actualNodeFs,
  existsSync: vi.fn(actualNodeFs.existsSync.bind(actualNodeFs)),
  mkdirSync: vi.fn(actualNodeFs.mkdirSync.bind(actualNodeFs)),
  readFileSync: vi.fn(actualNodeFs.readFileSync.bind(actualNodeFs)),
  readdirSync: vi.fn(actualNodeFs.readdirSync.bind(actualNodeFs)),
  rmSync: vi.fn(actualNodeFs.rmSync.bind(actualNodeFs)),
  statSync: vi.fn(actualNodeFs.statSync.bind(actualNodeFs)),
  writeFileSync: vi.fn(actualNodeFs.writeFileSync.bind(actualNodeFs)),
  promises: {
    ...actualNodeFs.promises,
    access: vi.fn(actualNodeFs.promises.access.bind(actualNodeFs.promises)),
    appendFile: vi.fn(actualNodeFs.promises.appendFile.bind(actualNodeFs.promises)),
    chmod: vi.fn(actualNodeFs.promises.chmod.bind(actualNodeFs.promises)),
    copyFile: vi.fn(actualNodeFs.promises.copyFile.bind(actualNodeFs.promises)),
    mkdir: vi.fn(actualNodeFs.promises.mkdir.bind(actualNodeFs.promises)),
    readdir: vi.fn(actualNodeFs.promises.readdir.bind(actualNodeFs.promises)),
    readFile: vi.fn(actualNodeFs.promises.readFile.bind(actualNodeFs.promises)),
    realpath: vi.fn(actualNodeFs.promises.realpath.bind(actualNodeFs.promises)),
    rename: vi.fn(actualNodeFs.promises.rename.bind(actualNodeFs.promises)),
    rm: vi.fn(actualNodeFs.promises.rm.bind(actualNodeFs.promises)),
    stat: vi.fn(actualNodeFs.promises.stat.bind(actualNodeFs.promises)),
    unlink: vi.fn(actualNodeFs.promises.unlink.bind(actualNodeFs.promises)),
    writeFile: vi.fn(actualNodeFs.promises.writeFile.bind(actualNodeFs.promises)),
  },
}));

vi.mock('fs', () => ({
  ...actualFs,
  existsSync: vi.fn(actualFs.existsSync.bind(actualFs)),
  mkdirSync: vi.fn(actualFs.mkdirSync.bind(actualFs)),
  readFileSync: vi.fn(actualFs.readFileSync.bind(actualFs)),
  readdirSync: vi.fn(actualFs.readdirSync.bind(actualFs)),
  rmSync: vi.fn(actualFs.rmSync.bind(actualFs)),
  statSync: vi.fn(actualFs.statSync.bind(actualFs)),
  writeFileSync: vi.fn(actualFs.writeFileSync.bind(actualFs)),
  promises: {
    ...actualFs.promises,
    access: vi.fn(actualFs.promises.access.bind(actualFs.promises)),
    appendFile: vi.fn(actualFs.promises.appendFile.bind(actualFs.promises)),
    chmod: vi.fn(actualFs.promises.chmod.bind(actualFs.promises)),
    copyFile: vi.fn(actualFs.promises.copyFile.bind(actualFs.promises)),
    mkdir: vi.fn(actualFs.promises.mkdir.bind(actualFs.promises)),
    readdir: vi.fn(actualFs.promises.readdir.bind(actualFs.promises)),
    readFile: vi.fn(actualFs.promises.readFile.bind(actualFs.promises)),
    realpath: vi.fn(actualFs.promises.realpath.bind(actualFs.promises)),
    rename: vi.fn(actualFs.promises.rename.bind(actualFs.promises)),
    rm: vi.fn(actualFs.promises.rm.bind(actualFs.promises)),
    stat: vi.fn(actualFs.promises.stat.bind(actualFs.promises)),
    unlink: vi.fn(actualFs.promises.unlink.bind(actualFs.promises)),
    writeFile: vi.fn(actualFs.promises.writeFile.bind(actualFs.promises)),
  },
}));

vi.mock('node:fs/promises', () => ({
  ...actualNodeFsPromises,
  access: vi.fn(actualNodeFsPromises.access.bind(actualNodeFsPromises)),
  appendFile: vi.fn(actualNodeFsPromises.appendFile.bind(actualNodeFsPromises)),
  chmod: vi.fn(actualNodeFsPromises.chmod.bind(actualNodeFsPromises)),
  copyFile: vi.fn(actualNodeFsPromises.copyFile.bind(actualNodeFsPromises)),
  mkdir: vi.fn(actualNodeFsPromises.mkdir.bind(actualNodeFsPromises)),
  readdir: vi.fn(actualNodeFsPromises.readdir.bind(actualNodeFsPromises)),
  readFile: vi.fn(actualNodeFsPromises.readFile.bind(actualNodeFsPromises)),
  realpath: vi.fn(actualNodeFsPromises.realpath.bind(actualNodeFsPromises)),
  rename: vi.fn(actualNodeFsPromises.rename.bind(actualNodeFsPromises)),
  rm: vi.fn(actualNodeFsPromises.rm.bind(actualNodeFsPromises)),
  stat: vi.fn(actualNodeFsPromises.stat.bind(actualNodeFsPromises)),
  unlink: vi.fn(actualNodeFsPromises.unlink.bind(actualNodeFsPromises)),
  writeFile: vi.fn(actualNodeFsPromises.writeFile.bind(actualNodeFsPromises)),
}));

vi.mock('fs/promises', () => ({
  ...actualFsPromises,
  access: vi.fn(actualFsPromises.access.bind(actualFsPromises)),
  appendFile: vi.fn(actualFsPromises.appendFile.bind(actualFsPromises)),
  chmod: vi.fn(actualFsPromises.chmod.bind(actualFsPromises)),
  copyFile: vi.fn(actualFsPromises.copyFile.bind(actualFsPromises)),
  mkdir: vi.fn(actualFsPromises.mkdir.bind(actualFsPromises)),
  readdir: vi.fn(actualFsPromises.readdir.bind(actualFsPromises)),
  readFile: vi.fn(actualFsPromises.readFile.bind(actualFsPromises)),
  realpath: vi.fn(actualFsPromises.realpath.bind(actualFsPromises)),
  rename: vi.fn(actualFsPromises.rename.bind(actualFsPromises)),
  rm: vi.fn(actualFsPromises.rm.bind(actualFsPromises)),
  stat: vi.fn(actualFsPromises.stat.bind(actualFsPromises)),
  unlink: vi.fn(actualFsPromises.unlink.bind(actualFsPromises)),
  writeFile: vi.fn(actualFsPromises.writeFile.bind(actualFsPromises)),
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

function resetFsMocksToActuals() {
  vi.mocked(nodeFs.existsSync).mockImplementation(actualNodeFs.existsSync.bind(actualNodeFs));
  vi.mocked(nodeFs.mkdirSync).mockImplementation(actualNodeFs.mkdirSync.bind(actualNodeFs));
  vi.mocked(nodeFs.readFileSync).mockImplementation(actualNodeFs.readFileSync.bind(actualNodeFs));
  vi.mocked(nodeFs.readdirSync).mockImplementation(actualNodeFs.readdirSync.bind(actualNodeFs));
  vi.mocked(nodeFs.rmSync).mockImplementation(actualNodeFs.rmSync.bind(actualNodeFs));
  vi.mocked(nodeFs.statSync).mockImplementation(actualNodeFs.statSync.bind(actualNodeFs));
  vi.mocked(nodeFs.writeFileSync).mockImplementation(actualNodeFs.writeFileSync.bind(actualNodeFs));

  vi.mocked(classicFs.existsSync).mockImplementation(actualFs.existsSync.bind(actualFs));
  vi.mocked(classicFs.mkdirSync).mockImplementation(actualFs.mkdirSync.bind(actualFs));
  vi.mocked(classicFs.readFileSync).mockImplementation(actualFs.readFileSync.bind(actualFs));
  vi.mocked(classicFs.readdirSync).mockImplementation(actualFs.readdirSync.bind(actualFs));
  vi.mocked(classicFs.rmSync).mockImplementation(actualFs.rmSync.bind(actualFs));
  vi.mocked(classicFs.statSync).mockImplementation(actualFs.statSync.bind(actualFs));
  vi.mocked(classicFs.writeFileSync).mockImplementation(actualFs.writeFileSync.bind(actualFs));

  vi.mocked(nodeFs.promises.access).mockImplementation(actualNodeFs.promises.access.bind(actualNodeFs.promises));
  vi.mocked(nodeFs.promises.appendFile).mockImplementation(actualNodeFs.promises.appendFile.bind(actualNodeFs.promises));
  vi.mocked(nodeFs.promises.chmod).mockImplementation(actualNodeFs.promises.chmod.bind(actualNodeFs.promises));
  vi.mocked(nodeFs.promises.copyFile).mockImplementation(actualNodeFs.promises.copyFile.bind(actualNodeFs.promises));
  vi.mocked(nodeFs.promises.mkdir).mockImplementation(actualNodeFs.promises.mkdir.bind(actualNodeFs.promises));
  vi.mocked(nodeFs.promises.readdir).mockImplementation(actualNodeFs.promises.readdir.bind(actualNodeFs.promises));
  vi.mocked(nodeFs.promises.readFile).mockImplementation(actualNodeFs.promises.readFile.bind(actualNodeFs.promises));
  vi.mocked(nodeFs.promises.realpath).mockImplementation(actualNodeFs.promises.realpath.bind(actualNodeFs.promises));
  vi.mocked(nodeFs.promises.rename).mockImplementation(actualNodeFs.promises.rename.bind(actualNodeFs.promises));
  vi.mocked(nodeFs.promises.rm).mockImplementation(actualNodeFs.promises.rm.bind(actualNodeFs.promises));
  vi.mocked(nodeFs.promises.stat).mockImplementation(actualNodeFs.promises.stat.bind(actualNodeFs.promises));
  vi.mocked(nodeFs.promises.unlink).mockImplementation(actualNodeFs.promises.unlink.bind(actualNodeFs.promises));
  vi.mocked(nodeFs.promises.writeFile).mockImplementation(actualNodeFs.promises.writeFile.bind(actualNodeFs.promises));

  vi.mocked(classicFs.promises.access).mockImplementation(actualFs.promises.access.bind(actualFs.promises));
  vi.mocked(classicFs.promises.appendFile).mockImplementation(actualFs.promises.appendFile.bind(actualFs.promises));
  vi.mocked(classicFs.promises.chmod).mockImplementation(actualFs.promises.chmod.bind(actualFs.promises));
  vi.mocked(classicFs.promises.copyFile).mockImplementation(actualFs.promises.copyFile.bind(actualFs.promises));
  vi.mocked(classicFs.promises.mkdir).mockImplementation(actualFs.promises.mkdir.bind(actualFs.promises));
  vi.mocked(classicFs.promises.readdir).mockImplementation(actualFs.promises.readdir.bind(actualFs.promises));
  vi.mocked(classicFs.promises.readFile).mockImplementation(actualFs.promises.readFile.bind(actualFs.promises));
  vi.mocked(classicFs.promises.realpath).mockImplementation(actualFs.promises.realpath.bind(actualFs.promises));
  vi.mocked(classicFs.promises.rename).mockImplementation(actualFs.promises.rename.bind(actualFs.promises));
  vi.mocked(classicFs.promises.rm).mockImplementation(actualFs.promises.rm.bind(actualFs.promises));
  vi.mocked(classicFs.promises.stat).mockImplementation(actualFs.promises.stat.bind(actualFs.promises));
  vi.mocked(classicFs.promises.unlink).mockImplementation(actualFs.promises.unlink.bind(actualFs.promises));
  vi.mocked(classicFs.promises.writeFile).mockImplementation(actualFs.promises.writeFile.bind(actualFs.promises));

  vi.mocked(nodeFsPromises.access).mockImplementation(actualNodeFsPromises.access.bind(actualNodeFsPromises));
  vi.mocked(nodeFsPromises.appendFile).mockImplementation(actualNodeFsPromises.appendFile.bind(actualNodeFsPromises));
  vi.mocked(nodeFsPromises.chmod).mockImplementation(actualNodeFsPromises.chmod.bind(actualNodeFsPromises));
  vi.mocked(nodeFsPromises.copyFile).mockImplementation(actualNodeFsPromises.copyFile.bind(actualNodeFsPromises));
  vi.mocked(nodeFsPromises.mkdir).mockImplementation(actualNodeFsPromises.mkdir.bind(actualNodeFsPromises));
  vi.mocked(nodeFsPromises.readdir).mockImplementation(actualNodeFsPromises.readdir.bind(actualNodeFsPromises));
  vi.mocked(nodeFsPromises.readFile).mockImplementation(actualNodeFsPromises.readFile.bind(actualNodeFsPromises));
  vi.mocked(nodeFsPromises.realpath).mockImplementation(actualNodeFsPromises.realpath.bind(actualNodeFsPromises));
  vi.mocked(nodeFsPromises.rename).mockImplementation(actualNodeFsPromises.rename.bind(actualNodeFsPromises));
  vi.mocked(nodeFsPromises.rm).mockImplementation(actualNodeFsPromises.rm.bind(actualNodeFsPromises));
  vi.mocked(nodeFsPromises.stat).mockImplementation(actualNodeFsPromises.stat.bind(actualNodeFsPromises));
  vi.mocked(nodeFsPromises.unlink).mockImplementation(actualNodeFsPromises.unlink.bind(actualNodeFsPromises));
  vi.mocked(nodeFsPromises.writeFile).mockImplementation(actualNodeFsPromises.writeFile.bind(actualNodeFsPromises));

  vi.mocked(classicFsPromises.access).mockImplementation(actualFsPromises.access.bind(actualFsPromises));
  vi.mocked(classicFsPromises.appendFile).mockImplementation(actualFsPromises.appendFile.bind(actualFsPromises));
  vi.mocked(classicFsPromises.chmod).mockImplementation(actualFsPromises.chmod.bind(actualFsPromises));
  vi.mocked(classicFsPromises.copyFile).mockImplementation(actualFsPromises.copyFile.bind(actualFsPromises));
  vi.mocked(classicFsPromises.mkdir).mockImplementation(actualFsPromises.mkdir.bind(actualFsPromises));
  vi.mocked(classicFsPromises.readdir).mockImplementation(actualFsPromises.readdir.bind(actualFsPromises));
  vi.mocked(classicFsPromises.readFile).mockImplementation(actualFsPromises.readFile.bind(actualFsPromises));
  vi.mocked(classicFsPromises.realpath).mockImplementation(actualFsPromises.realpath.bind(actualFsPromises));
  vi.mocked(classicFsPromises.rename).mockImplementation(actualFsPromises.rename.bind(actualFsPromises));
  vi.mocked(classicFsPromises.rm).mockImplementation(actualFsPromises.rm.bind(actualFsPromises));
  vi.mocked(classicFsPromises.stat).mockImplementation(actualFsPromises.stat.bind(actualFsPromises));
  vi.mocked(classicFsPromises.unlink).mockImplementation(actualFsPromises.unlink.bind(actualFsPromises));
  vi.mocked(classicFsPromises.writeFile).mockImplementation(actualFsPromises.writeFile.bind(actualFsPromises));
}

// Lifecycle hooks
const originalCwd = process.cwd.bind(process);
const workspaceCwd = fileURLToPath(new URL('..', import.meta.url));

beforeEach(() => {
  process.cwd = (() => workspaceCwd) as typeof process.cwd;
  resetFsMocksToActuals();

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

afterAll(() => {
  process.cwd = originalCwd;
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

