/**
 * Integration Test for StorageAPI Refactoring
 *
 * Validates that the new StorageAPI interface works correctly and that
 * createStorageWrappers function properly delegates to storage instances.
 *
 * Features:
 * - Tests createStorageWrappers function
 * - Tests StorageAPI interface compliance
 * - Tests backward compatibility with old function names
 * - Tests that storage methods are properly delegated
 */

import { describe, test, expect } from '@jest/globals';
import { createStorageWrappers, createStorageWithWrappers } from '../../core/storage-factory.js';
import { StorageAPI } from '../../core/types.js';

describe('StorageAPI Refactoring Integration', () => {
  test('createStorageWrappers implements StorageAPI interface', () => {
    // Create a mock storage instance
    const mockStorage = {
      saveWorld: jest.fn(),
      loadWorld: jest.fn(),
      deleteWorld: jest.fn(),
      listWorlds: jest.fn(),
      saveAgent: jest.fn(),
      loadAgent: jest.fn(),
      deleteAgent: jest.fn(),
      listAgents: jest.fn(),
      saveAgentsBatch: jest.fn(),
      loadAgentsBatch: jest.fn(),
      saveChat: jest.fn(),
      loadChat: jest.fn(),
      deleteChat: jest.fn(),
      listChats: jest.fn(),
      updateChat: jest.fn(),
      saveSnapshot: jest.fn(),
      loadSnapshot: jest.fn(),
      restoreFromSnapshot: jest.fn(),
      validateIntegrity: jest.fn(),
      repairData: jest.fn(),
    };

    // Create storage wrappers using function
    const wrappers = createStorageWrappers(mockStorage);

    // Verify it implements StorageAPI interface
    const storageAPI: StorageAPI = wrappers;

    // Test interface compliance - these should not throw TypeScript errors
    expect(typeof storageAPI.saveWorld).toBe('function');
    expect(typeof storageAPI.loadWorld).toBe('function');
    expect(typeof storageAPI.deleteWorld).toBe('function');
    expect(typeof storageAPI.listWorlds).toBe('function');
    expect(typeof storageAPI.worldExists).toBe('function');
    
    expect(typeof storageAPI.saveAgent).toBe('function');
    expect(typeof storageAPI.loadAgent).toBe('function');
    expect(typeof storageAPI.deleteAgent).toBe('function');
    expect(typeof storageAPI.listAgents).toBe('function');
    expect(typeof storageAPI.agentExists).toBe('function');
    
    expect(typeof storageAPI.saveChat).toBe('function');
    expect(typeof storageAPI.loadChat).toBe('function');
    expect(typeof storageAPI.deleteChat).toBe('function');
    expect(typeof storageAPI.listChats).toBe('function');
    expect(typeof storageAPI.updateChat).toBe('function');
    
    expect(typeof storageAPI.validateIntegrity).toBe('function');
    expect(typeof storageAPI.repairData).toBe('function');
    expect(typeof storageAPI.archiveMemory).toBe('function');
  });

  test('createStorageWrappers delegates to storage instance', async () => {
    // Create a mock storage instance with spies
    const mockStorage = {
      saveWorld: jest.fn().mockResolvedValue(undefined),
      loadWorld: jest.fn().mockResolvedValue({ id: 'test-world' }),
      deleteWorld: jest.fn().mockResolvedValue(true),
      listWorlds: jest.fn().mockResolvedValue([]),
      saveAgent: jest.fn().mockResolvedValue(undefined),
      loadAgent: jest.fn().mockResolvedValue({ id: 'test-agent' }),
      deleteAgent: jest.fn().mockResolvedValue(true),
      listAgents: jest.fn().mockResolvedValue([]),
      saveAgentsBatch: jest.fn().mockResolvedValue(undefined),
      loadAgentsBatch: jest.fn().mockResolvedValue([]),
      saveChat: jest.fn().mockResolvedValue(undefined),
      loadChat: jest.fn().mockResolvedValue({ id: 'test-chat' }),
      deleteChat: jest.fn().mockResolvedValue(true),
      listChats: jest.fn().mockResolvedValue([]),
      updateChat: jest.fn().mockResolvedValue({ id: 'test-chat' }),
      saveSnapshot: jest.fn().mockResolvedValue(undefined),
      loadSnapshot: jest.fn().mockResolvedValue({ world: {} }),
      restoreFromSnapshot: jest.fn().mockResolvedValue(true),
      validateIntegrity: jest.fn().mockResolvedValue(true),
      repairData: jest.fn().mockResolvedValue(true),
    };

    // Create storage wrappers using function
    const wrappers = createStorageWrappers(mockStorage);

    // Test world operations
    await wrappers.saveWorld({ id: 'test-world', name: 'Test World', turnLimit: 5 });
    expect(mockStorage.saveWorld).toHaveBeenCalledWith({ id: 'test-world', name: 'Test World', turnLimit: 5 });

    const world = await wrappers.loadWorld('test-world');
    expect(mockStorage.loadWorld).toHaveBeenCalledWith('test-world');
    expect(world).toEqual({ id: 'test-world' });

    const deleteResult = await wrappers.deleteWorld('test-world');
    expect(mockStorage.deleteWorld).toHaveBeenCalledWith('test-world');
    expect(deleteResult).toBe(true);

    // Test agent operations
    const testAgent = { id: 'test-agent', name: 'Test Agent', memory: [] };
    await wrappers.saveAgent('test-world', testAgent);
    expect(mockStorage.saveAgent).toHaveBeenCalledWith('test-world', testAgent);

    const agent = await wrappers.loadAgent('test-world', 'test-agent');
    expect(mockStorage.loadAgent).toHaveBeenCalledWith('test-world', 'test-agent');
    expect(agent).toEqual({ id: 'test-agent' });
  });

  test('createStorageWrappers handles null storage instance gracefully', async () => {
    // Create storage wrappers with null storage (browser environment simulation)
    const wrappers = createStorageWrappers(null);

    // All operations should return sensible defaults without throwing
    expect(await wrappers.saveWorld({ id: 'test' })).toBeUndefined();
    expect(await wrappers.loadWorld('test')).toBeNull();
    expect(await wrappers.deleteWorld('test')).toBe(false);
    expect(await wrappers.listWorlds()).toEqual([]);
    expect(await wrappers.worldExists('test')).toBe(false);

    expect(await wrappers.saveAgent('world', { id: 'agent' })).toBeUndefined();
    expect(await wrappers.loadAgent('world', 'agent')).toBeNull();
    expect(await wrappers.deleteAgent('world', 'agent')).toBe(false);
    expect(await wrappers.listAgents('world')).toEqual([]);
    expect(await wrappers.agentExists('world', 'agent')).toBe(false);

    expect(await wrappers.validateIntegrity('world', 'agent')).toEqual({ isValid: false });
    expect(await wrappers.repairData('world', 'agent')).toBe(false);
  });

  test('Backward compatibility function names exist in storage modules', async () => {
    // Test that old function names are still exported for backward compatibility
    const agentStorage = await import('../../core/agent-storage.js');
    const worldStorage = await import('../../core/world-storage.js');

    // Agent storage backward compatibility
    expect(typeof agentStorage.saveAgentToDisk).toBe('function');
    expect(typeof agentStorage.loadAgentFromDisk).toBe('function');
    expect(typeof agentStorage.deleteAgentFromDisk).toBe('function');
    expect(typeof agentStorage.loadAllAgentsFromDisk).toBe('function');
    expect(typeof agentStorage.agentExistsOnDisk).toBe('function');

    // World storage backward compatibility
    expect(typeof worldStorage.saveWorldToDisk).toBe('function');
    expect(typeof worldStorage.loadWorldFromDisk).toBe('function');
    expect(typeof worldStorage.deleteWorldFromDisk).toBe('function');
    expect(typeof worldStorage.loadAllWorldsFromDisk).toBe('function');
    expect(typeof worldStorage.worldExistsOnDisk).toBe('function');

    // New function names should also exist
    expect(typeof agentStorage.saveAgent).toBe('function');
    expect(typeof agentStorage.loadAgent).toBe('function');
    expect(typeof agentStorage.deleteAgent).toBe('function');
    expect(typeof agentStorage.listAgents).toBe('function');
    expect(typeof agentStorage.agentExists).toBe('function');

    expect(typeof worldStorage.saveWorld).toBe('function');
    expect(typeof worldStorage.loadWorld).toBe('function');
    expect(typeof worldStorage.deleteWorld).toBe('function');
    expect(typeof worldStorage.listWorlds).toBe('function');
    expect(typeof worldStorage.worldExists).toBe('function');
  });

  test('createStorageWithWrappers returns StorageAPI object', async () => {
    // This will test the factory function
    const wrappers = await createStorageWithWrappers();
    
    // Should return an object implementing StorageAPI
    expect(typeof wrappers).toBe('object');
    expect(wrappers).not.toBeNull();
    
    // Should implement StorageAPI interface
    const storageAPI: StorageAPI = wrappers;
    expect(storageAPI).toBeDefined();
    
    // Should have all required methods
    expect(typeof wrappers.saveWorld).toBe('function');
    expect(typeof wrappers.loadWorld).toBe('function');
    expect(typeof wrappers.saveAgent).toBe('function');
    expect(typeof wrappers.loadAgent).toBe('function');
  });
});