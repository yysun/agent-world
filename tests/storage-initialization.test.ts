/*
 * Storage Initialization Tests - Tests for core storage functionality
 *
 * This test file covers:
 * - Storage initialization and configuration
 * - Event data storage functionality (non-deprecated functions)
 * - Error handling for uninitialized storage
 * 
 * Note: Agent storage functions have been moved to world.ts for proper name-based folder handling.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// Mock only logger, use real fs operations  
jest.mock('../src/logger');

// Test data directory
const TEST_DATA_PATH = path.join(process.cwd(), 'test-data');

describe('Storage Core Functionality', () => {
  // Clear module cache before each test to ensure fresh global state
  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();
    
    // Clean up test data
    try {
      await fs.rm(TEST_DATA_PATH, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  afterEach(async () => {
    jest.resetModules();
    
    // Clean up test data
    try {
      await fs.rm(TEST_DATA_PATH, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
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

    it('should throw error when accessing options before initialization', () => {
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
    it('should provide clear documentation about agent storage migration', () => {
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

    it('should still export core storage functions', () => {
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
