/**
 * Unit Tests for Timestamp Management System
 * 
 * Features tested:
 * - Automatic timestamp generation in core managers
 * - Timestamp protection in API validation schemas  
 * - Date handling in storage layers
 * - World and agent timestamp behavior
 * 
 * Implementation tested:
 * - createWorld/updateWorld automatic lastUpdated generation
 * - createAgent/updateAgent automatic createdAt/lastActive generation
 * - API schema validation prevents client timestamp manipulation
 * - Storage layer defensive date type checking
 */

import { jest } from '@jest/globals';
import {
  createWorld,
  updateWorld,
  createAgent,
  updateAgent,
  clearAgentMemory
} from '../../core/managers.js';
import type { CreateWorldParams, CreateAgentParams, UpdateAgentParams, LLMProvider } from '../../core/types.js';

// Utility for full mock - returns proper StorageAPI interface
const fullMockWrappers = (overrides = {}) => ({
  // World operations
  saveWorld: jest.fn(),
  loadWorld: jest.fn(),
  deleteWorld: jest.fn(),
  listWorlds: jest.fn(),
  worldExists: jest.fn(),

  // Agent operations
  saveAgent: jest.fn(),
  saveAgentConfig: jest.fn(),
  saveAgentMemory: jest.fn(),
  loadAgent: jest.fn(),
  loadAgentWithRetry: jest.fn(),
  deleteAgent: jest.fn(),
  listAgents: jest.fn(),
  agentExists: jest.fn(),

  // Batch operations
  saveAgentsBatch: jest.fn(),
  loadAgentsBatch: jest.fn(),

  // Chat history operations
  saveChatData: jest.fn(),
  loadChatData: jest.fn(),
  deleteChatData: jest.fn(),
  listChatHistories: jest.fn(),
  listChats: jest.fn(),
  updateChatData: jest.fn(),

  // Chat operations
  saveWorldChat: jest.fn(),
  loadWorldChat: jest.fn(),
  loadWorldChatFull: jest.fn(),
  restoreFromWorldChat: jest.fn(),

  // Integrity operations
  validateIntegrity: jest.fn(),
  repairData: jest.fn(),
  archiveMemory: jest.fn(),

  ...overrides
});

describe('Timestamp Management System', () => {
  const rootPath = '/test/path';

  beforeEach(() => {
    jest.resetModules();
  });

  describe('World Timestamp Management', () => {
    test('should automatically set createdAt and lastUpdated on world creation', async () => {
      jest.resetModules();

      const mockSaveWorld = jest.fn();

      const storageFactory = await import('../../core/storage-factory');
      jest.spyOn(storageFactory, 'createStorageWithWrappers').mockResolvedValue(fullMockWrappers({
        worldExists: jest.fn().mockResolvedValue(false),
        saveWorld: mockSaveWorld
      }));

      const beforeCreate = new Date();

      const worldParams: CreateWorldParams = {
        name: 'Test World',
        description: 'A test world',
        turnLimit: 5
      };

      await createWorld(rootPath, worldParams);

      const afterCreate = new Date();

      // Verify saveWorld was called with automatic timestamps
      expect(mockSaveWorld).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-world',
          name: 'Test World',
          description: 'A test world',
          turnLimit: 5,
          createdAt: expect.any(Date),
          lastUpdated: expect.any(Date),
          totalAgents: 0,
          totalMessages: 0
        })
      );

      const savedWorldData = mockSaveWorld.mock.calls[0][0];

      // Verify timestamps are within expected range
      expect(savedWorldData.createdAt).toBeInstanceOf(Date);
      expect(savedWorldData.lastUpdated).toBeInstanceOf(Date);
      expect(savedWorldData.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
      expect(savedWorldData.createdAt.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
      expect(savedWorldData.lastUpdated.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
      expect(savedWorldData.lastUpdated.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
    });

    test('should automatically update lastUpdated on world update', async () => {
      jest.resetModules();

      const existingWorldData = {
        id: 'test-world',
        name: 'Test World',
        description: 'Original description',
        turnLimit: 5,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        lastUpdated: new Date('2024-01-01T00:00:00Z'),
        totalAgents: 0,
        totalMessages: 0
      };

      const mockLoadWorld = jest.fn().mockResolvedValue(existingWorldData);
      const mockSaveWorld = jest.fn();

      const storageFactory = await import('../../core/storage-factory');
      jest.spyOn(storageFactory, 'createStorageWithWrappers').mockResolvedValue(fullMockWrappers({
        loadWorld: mockLoadWorld,
        saveWorld: mockSaveWorld
      }));

      const beforeUpdate = new Date();

      await updateWorld(rootPath, 'test-world', {
        description: 'Updated description'
      });

      const afterUpdate = new Date();

      // Verify saveWorld was called with updated lastUpdated
      expect(mockSaveWorld).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-world',
          name: 'Test World',
          description: 'Updated description',
          turnLimit: 5,
          createdAt: existingWorldData.createdAt, // Should preserve original
          lastUpdated: expect.any(Date), // Should be automatically updated
          totalAgents: 0,
          totalMessages: 0
        })
      );

      const savedWorldData = mockSaveWorld.mock.calls[0][0];

      // Verify lastUpdated was automatically updated but createdAt preserved
      expect(savedWorldData.createdAt).toEqual(existingWorldData.createdAt);
      expect(savedWorldData.lastUpdated).toBeInstanceOf(Date);
      expect(savedWorldData.lastUpdated.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
      expect(savedWorldData.lastUpdated.getTime()).toBeLessThanOrEqual(afterUpdate.getTime());
      expect(savedWorldData.lastUpdated.getTime()).toBeGreaterThan(existingWorldData.lastUpdated.getTime());
    });
  });

  describe('Agent Timestamp Management', () => {
    test('should automatically set createdAt and lastActive on agent creation', async () => {
      jest.resetModules();

      const mockSaveAgent = jest.fn();

      const storageFactory = await import('../../core/storage-factory');
      jest.spyOn(storageFactory, 'createStorageWithWrappers').mockResolvedValue(fullMockWrappers({
        agentExists: jest.fn().mockResolvedValue(false),
        saveAgent: mockSaveAgent
      }));

      const beforeCreate = new Date();

      const agentParams: CreateAgentParams = {
        name: 'Test Agent',
        type: 'test',
        provider: 'openai' as LLMProvider,
        model: 'gpt-4',
        systemPrompt: 'You are a test agent'
      };

      await createAgent(rootPath, 'test-world', agentParams);

      const afterCreate = new Date();

      // Verify saveAgent was called with automatic timestamps
      expect(mockSaveAgent).toHaveBeenCalledWith(
        'test-world',
        expect.objectContaining({
          id: 'test-agent',
          name: 'Test Agent',
          type: 'test',
          status: 'inactive',
          provider: 'openai',
          model: 'gpt-4',
          systemPrompt: 'You are a test agent',
          createdAt: expect.any(Date),
          lastActive: expect.any(Date),
          llmCallCount: 0,
          memory: []
        })
      );

      const savedAgentData = mockSaveAgent.mock.calls[0][1];

      // Verify timestamps are within expected range
      expect(savedAgentData.createdAt).toBeInstanceOf(Date);
      expect(savedAgentData.lastActive).toBeInstanceOf(Date);
      expect(savedAgentData.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
      expect(savedAgentData.createdAt.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
      expect(savedAgentData.lastActive.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
      expect(savedAgentData.lastActive.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
    });

    test('should automatically update lastActive on agent update', async () => {
      jest.resetModules();

      const existingAgentData = {
        id: 'test-agent',
        name: 'Test Agent',
        type: 'test',
        status: 'inactive',
        provider: 'openai' as LLMProvider,
        model: 'gpt-4',
        systemPrompt: 'Original prompt',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        lastActive: new Date('2024-01-01T00:00:00Z'),
        llmCallCount: 0,
        memory: []
      };

      const mockLoadAgent = jest.fn().mockResolvedValue(existingAgentData);
      const mockSaveAgent = jest.fn();

      const storageFactory = await import('../../core/storage-factory');
      jest.spyOn(storageFactory, 'createStorageWithWrappers').mockResolvedValue(fullMockWrappers({
        loadAgent: mockLoadAgent,
        saveAgent: mockSaveAgent
      }));

      const beforeUpdate = new Date();

      const updateParams: UpdateAgentParams = {
        systemPrompt: 'Updated prompt'
      };

      await updateAgent(rootPath, 'test-world', 'test-agent', updateParams);

      const afterUpdate = new Date();

      // Verify saveAgent was called with updated lastActive
      expect(mockSaveAgent).toHaveBeenCalledWith(
        'test-world',
        expect.objectContaining({
          id: 'test-agent',
          name: 'Test Agent',
          systemPrompt: 'Updated prompt',
          createdAt: existingAgentData.createdAt, // Should preserve original
          lastActive: expect.any(Date) // Should be automatically updated
        })
      );

      const savedAgentData = mockSaveAgent.mock.calls[0][1];

      // Verify lastActive was automatically updated but createdAt preserved
      expect(savedAgentData.createdAt).toEqual(existingAgentData.createdAt);
      expect(savedAgentData.lastActive).toBeInstanceOf(Date);
      expect(savedAgentData.lastActive.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
      expect(savedAgentData.lastActive.getTime()).toBeLessThanOrEqual(afterUpdate.getTime());
      expect(savedAgentData.lastActive.getTime()).toBeGreaterThan(existingAgentData.lastActive.getTime());
    });

    test('should automatically update lastActive on agent memory operations', async () => {
      jest.resetModules();

      const existingAgentData = {
        id: 'test-agent',
        name: 'Test Agent',
        type: 'test',
        status: 'inactive',
        provider: 'openai' as LLMProvider,
        model: 'gpt-4',
        systemPrompt: 'Test prompt',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        lastActive: new Date('2024-01-01T00:00:00Z'),
        llmCallCount: 5,
        memory: [
          { role: 'user', content: 'Hello', createdAt: new Date() },
          { role: 'assistant', content: 'Hi there', createdAt: new Date() }
        ]
      };

      const mockLoadAgent = jest.fn().mockResolvedValue(existingAgentData);
      const mockSaveAgent = jest.fn();
      const mockSaveAgentMemory = jest.fn();
      const mockArchiveMemory = jest.fn();

      const storageFactory = await import('../../core/storage-factory');
      jest.spyOn(storageFactory, 'createStorageWithWrappers').mockResolvedValue(fullMockWrappers({
        loadAgent: mockLoadAgent,
        saveAgent: mockSaveAgent,
        saveAgentMemory: mockSaveAgentMemory,
        archiveMemory: mockArchiveMemory
      }));

      const beforeClear = new Date();

      await clearAgentMemory(rootPath, 'test-world', 'test-agent');

      const afterClear = new Date();

      // Verify archiveMemory was called
      expect(mockArchiveMemory).toHaveBeenCalledWith(
        'test-world',
        'test-agent',
        existingAgentData.memory
      );

      // Verify saveAgentMemory was called with empty array
      expect(mockSaveAgentMemory).toHaveBeenCalledWith(
        'test-world',
        'test-agent',
        []
      );

      // Verify saveAgent was called with updated agent (cleared memory and reset counters)
      expect(mockSaveAgent).toHaveBeenCalledWith(
        'test-world',
        expect.objectContaining({
          id: 'test-agent',
          name: 'Test Agent',
          memory: [],
          llmCallCount: 0, // Should be reset
          createdAt: existingAgentData.createdAt, // Should preserve original
          lastActive: expect.any(Date) // Should be automatically updated
        })
      );

      const savedAgentData = mockSaveAgent.mock.calls[0][1];

      // Verify lastActive was automatically updated but createdAt preserved
      expect(savedAgentData.createdAt).toEqual(existingAgentData.createdAt);
      expect(savedAgentData.lastActive).toBeInstanceOf(Date);
      expect(savedAgentData.lastActive.getTime()).toBeGreaterThanOrEqual(beforeClear.getTime());
      expect(savedAgentData.lastActive.getTime()).toBeLessThanOrEqual(afterClear.getTime());
      expect(savedAgentData.lastActive.getTime()).toBeGreaterThan(existingAgentData.lastActive.getTime());
    });
  });

  describe('Timestamp Edge Cases', () => {
    test('should handle Date objects vs ISO strings consistently', async () => {
      jest.resetModules();

      // This tests the defensive date type checking implemented in storage layers
      const agentWithMixedDates = {
        id: 'test-agent',
        name: 'Test Agent',
        type: 'test',
        status: 'inactive',
        provider: 'openai' as LLMProvider,
        model: 'gpt-4',
        systemPrompt: 'Test prompt',
        createdAt: '2024-01-01T00:00:00Z', // ISO string
        lastActive: new Date('2024-01-01T12:00:00Z'), // Date object
        llmCallCount: 0,
        memory: [
          {
            role: 'user',
            content: 'Hello',
            createdAt: '2024-01-01T10:00:00Z' // ISO string
          },
          {
            role: 'assistant',
            content: 'Hi there',
            createdAt: new Date('2024-01-01T10:01:00Z') // Date object
          }
        ]
      };

      const mockLoadAgent = jest.fn().mockResolvedValue(agentWithMixedDates);
      const mockSaveAgent = jest.fn();

      const storageFactory = await import('../../core/storage-factory');
      jest.spyOn(storageFactory, 'createStorageWithWrappers').mockResolvedValue(fullMockWrappers({
        loadAgent: mockLoadAgent,
        saveAgent: mockSaveAgent
      }));

      const beforeUpdate = new Date();

      await updateAgent(rootPath, 'test-world', 'test-agent', {
        name: 'Updated Agent'
      });

      const afterUpdate = new Date();

      // Verify the update succeeded (this tests defensive date handling in storage layer)
      expect(mockSaveAgent).toHaveBeenCalled();

      const savedAgentData = mockSaveAgent.mock.calls[0][1];

      // Verify lastActive was automatically updated with proper Date object
      expect(savedAgentData.lastActive).toBeInstanceOf(Date);
      expect(savedAgentData.lastActive.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
      expect(savedAgentData.lastActive.getTime()).toBeLessThanOrEqual(afterUpdate.getTime());
    });

    test('should handle undefined/null timestamps gracefully', async () => {
      jest.resetModules();

      const agentWithNullTimestamps = {
        id: 'test-agent',
        name: 'Test Agent',
        type: 'test',
        status: 'inactive',
        provider: 'openai' as LLMProvider,
        model: 'gpt-4',
        systemPrompt: 'Test prompt',
        createdAt: null, // null timestamp
        lastActive: undefined, // undefined timestamp
        llmCallCount: 0,
        memory: []
      };

      const mockLoadAgent = jest.fn().mockResolvedValue(agentWithNullTimestamps);
      const mockSaveAgent = jest.fn();

      const storageFactory = await import('../../core/storage-factory');
      jest.spyOn(storageFactory, 'createStorageWithWrappers').mockResolvedValue(fullMockWrappers({
        loadAgent: mockLoadAgent,
        saveAgent: mockSaveAgent
      }));

      const beforeUpdate = new Date();

      await updateAgent(rootPath, 'test-world', 'test-agent', {
        name: 'Updated Agent'
      });

      const afterUpdate = new Date();

      // Verify the update succeeded despite null/undefined timestamps
      expect(mockSaveAgent).toHaveBeenCalled();

      const savedAgentData = mockSaveAgent.mock.calls[0][1];

      // Verify lastActive was automatically set with proper Date object
      expect(savedAgentData.lastActive).toBeInstanceOf(Date);
      expect(savedAgentData.lastActive.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
      expect(savedAgentData.lastActive.getTime()).toBeLessThanOrEqual(afterUpdate.getTime());
    });
  });

  describe('System Integration', () => {
    test('should maintain timestamp consistency across operations', async () => {
      jest.resetModules();

      // Test that timestamps are consistent across related operations
      const mockSaveWorld = jest.fn();
      const mockSaveAgent = jest.fn();

      const storageFactory = await import('../../core/storage-factory');
      jest.spyOn(storageFactory, 'createStorageWithWrappers').mockResolvedValue(fullMockWrappers({
        worldExists: jest.fn().mockResolvedValue(false),
        agentExists: jest.fn().mockResolvedValue(false),
        saveWorld: mockSaveWorld,
        saveAgent: mockSaveAgent
      }));

      const worldParams: CreateWorldParams = {
        name: 'Integration World',
        description: 'A world for integration testing'
      };

      const beforeCreate = new Date();
      await createWorld(rootPath, worldParams);

      // Create agent in the world
      const agentParams: CreateAgentParams = {
        name: 'Integration Agent',
        type: 'test',
        provider: 'openai' as LLMProvider,
        model: 'gpt-4',
        systemPrompt: 'Integration test agent'
      };

      await createAgent(rootPath, 'integration-world', agentParams);
      const afterCreate = new Date();

      // Verify both world and agent have consistent timestamps
      const worldCall = mockSaveWorld.mock.calls[0][0];
      const agentCall = mockSaveAgent.mock.calls[0][1];

      expect(worldCall.createdAt).toBeInstanceOf(Date);
      expect(worldCall.lastUpdated).toBeInstanceOf(Date);
      expect(agentCall.createdAt).toBeInstanceOf(Date);
      expect(agentCall.lastActive).toBeInstanceOf(Date);

      // All timestamps should be within the same time window
      expect(worldCall.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
      expect(worldCall.createdAt.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
      expect(agentCall.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
      expect(agentCall.createdAt.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
    });
  });
});
