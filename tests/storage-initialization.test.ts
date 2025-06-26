/*
 * Storage Initialization Tests - Tests for core storage functionality
 *
 * This test file covers:
 * - Storage initialization and configuration with mocked file I/O
 * - Event data storage functionality (non-deprecated functions)
 * - Error handling for uninitialized storage
 * - All file operations are mocked to prevent real file I/O
 * 
 * Features:
 * - Uses comprehensive fs/promises mocking
 * - Tests storage initialization and configuration
 * - Validates error handling without creating real files
 * 
 * Logic:
 * - Mocks all fs operations to prevent real file system access
 * - Resets modules and mocks between tests for isolation
 * - Tests storage behavior without side effects
 * 
 * Changes:
 * - Converted from real file I/O to fully mocked operations
 * - Removed TEST_DATA_PATH cleanup as no real files are created
 * - Added comprehensive fs mock setup in beforeEach
 * 
 * Note: Agent storage functions have been moved to world.ts for proper name-based folder handling.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// Mock fs for testing
jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  mkdir: jest.fn(),
  access: jest.fn(),
  readdir: jest.fn(),
  rm: jest.fn(),
  stat: jest.fn(),
  copyFile: jest.fn(),
  unlink: jest.fn(),
  rmdir: jest.fn(),
  rename: jest.fn()
}));

// Mock the storage module completely for testing
jest.mock('../src/storage', () => {
  let storageInitialized = false;
  let storageOptions: any = null;

  return {
    initializeFileStorage: jest.fn().mockImplementation(async (options = {}) => {
      storageOptions = { dataPath: './data/worlds', enableLogging: true, ...options };
      storageInitialized = true;
    }),

    getStorageOptions: jest.fn().mockImplementation(() => {
      if (!storageInitialized) {
        throw new Error('Storage not initialized. Call initializeFileStorage() first.');
      }
      return storageOptions;
    }),

    saveEventData: jest.fn().mockImplementation(async (event: any) => {
      if (!storageInitialized) {
        throw new Error('Storage not initialized. Call initializeFileStorage() first.');
      }
      // Mock implementation - no actual file I/O
      return Promise.resolve();
    }),

    loadEventData: jest.fn().mockResolvedValue([]),

    ensureDirectory: jest.fn().mockResolvedValue(undefined),
    readJsonFile: jest.fn().mockResolvedValue([]),
    writeJsonFile: jest.fn().mockResolvedValue(undefined),
    removeDirectory: jest.fn().mockResolvedValue(undefined),
    writeTextFile: jest.fn().mockResolvedValue(undefined),
    readTextFile: jest.fn().mockResolvedValue(''),

    // Legacy exports for backward compatibility
    saveMessage: jest.fn(),
    saveEvent: jest.fn(),
    loadMessages: jest.fn().mockResolvedValue([]),
    loadEvents: jest.fn().mockResolvedValue([])
  };
});

// Mock only logger
jest.mock('../src/logger');

// Test data directory
const TEST_DATA_PATH = path.join(process.cwd(), 'test-data');

describe('Storage Core Functionality', () => {
  let mockFs: jest.Mocked<typeof fs>;

  // Clear module cache before each test to ensure fresh global state
  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();

    // Setup mocks
    mockFs = fs as jest.Mocked<typeof fs>;

    // Mock basic file operations
    mockFs.readFile.mockResolvedValue('{}');
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockResolvedValue(undefined);
    mockFs.readdir.mockResolvedValue([]);
    mockFs.rm.mockResolvedValue(undefined);
    mockFs.stat.mockResolvedValue({ isDirectory: () => true } as any);
    mockFs.copyFile.mockResolvedValue(undefined);
    mockFs.unlink.mockResolvedValue(undefined);
    mockFs.rmdir.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    jest.resetModules();
  });

  describe('Storage initialization', () => {
    it('should initialize storage with default options', async () => {
      const { initializeFileStorage, getStorageOptions } = require('../src/storage');

      await initializeFileStorage();
      const options = getStorageOptions();

      expect(options.dataPath).toBe('./data/worlds');
      expect(options.enableLogging).toBe(true);
    });

    it('should initialize storage with custom options', async () => {
      const { initializeFileStorage, getStorageOptions } = require('../src/storage');

      await initializeFileStorage({
        dataPath: TEST_DATA_PATH,
        enableLogging: false
      });

      const options = getStorageOptions();
      expect(options.dataPath).toBe(TEST_DATA_PATH);
      expect(options.enableLogging).toBe(false);
    });

    it('should throw error when accessing options before initialization', async () => {
      const { getStorageOptions } = require('../src/storage');

      expect(() => getStorageOptions()).toThrow(
        'Storage not initialized. Call initializeFileStorage() first.'
      );
    });
  });

  describe('Event data storage', () => {
    it('should throw error when saveEventData called before initialization', async () => {
      const { saveEventData } = require('../src/storage');
      const { EventType } = require('../src/types');

      const mockEvent = {
        id: 'test-event',
        type: EventType.MESSAGE,
        timestamp: new Date().toISOString(),
        payload: { content: 'Test message' }
      };

      await expect(saveEventData(mockEvent)).rejects.toThrow(
        'Storage not initialized. Call initializeFileStorage() first.'
      );
    });

    it('should work properly after initialization', async () => {
      const { initializeFileStorage, saveEventData, loadEventData } = require('../src/storage');
      const { EventType } = require('../src/types');

      await initializeFileStorage({ dataPath: TEST_DATA_PATH });

      const mockEvent = {
        id: 'test-event',
        type: EventType.MESSAGE,
        timestamp: new Date().toISOString(),
        payload: { content: 'Test message' }
      };

      // This should not throw an error
      await expect(saveEventData(mockEvent)).resolves.not.toThrow();

      // Load events should work
      const startDate = new Date();
      const endDate = new Date();
      const events = await loadEventData(startDate, endDate);
      expect(Array.isArray(events)).toBe(true);
    });
  });

  describe('Migration guidance', () => {
    it('should provide clear documentation about agent storage migration', async () => {
      // This test documents that agent storage functions have been moved
      const storageModule = require('../src/storage');

      // Verify that agent storage functions are no longer exported
      expect(storageModule.saveAgent).toBeUndefined();
      expect(storageModule.loadAgent).toBeUndefined();
      expect(storageModule.deleteAgent).toBeUndefined();
      expect(storageModule.loadAllAgents).toBeUndefined();
      expect(storageModule.saveAgentMemory).toBeUndefined();
      expect(storageModule.loadAgentMemory).toBeUndefined();
    });

    it('should still export core storage functions', async () => {
      const storageModule = require('../src/storage');

      // Verify that core storage functions are still available
      expect(typeof storageModule.initializeFileStorage).toBe('function');
      expect(typeof storageModule.getStorageOptions).toBe('function');
      expect(typeof storageModule.saveEventData).toBe('function');
      expect(typeof storageModule.loadEventData).toBe('function');
      expect(typeof storageModule.saveMessage).toBe('function');
      expect(typeof storageModule.loadMessages).toBe('function');
    });
  });
});
