/**
 * Unit Tests for Agent Storage (Core System)
 *
 * Features:
 * - Tests for loadAllAgentsFromDisk function with mocked file I/O
 * - Tests for agent creation and persistence with mocked file system
 * - Tests for error handling with corrupted files using mocks
 * - Tests for missing files and recovery using mocked scenarios
 * - Tests for data validation and consistency with mocked data
 *
 * Implementation:
 * - Uses mock helpers for consistent test data and file system mocking
 * - Tests only core/agent-storage.ts functions with mocked dependencies
 * - Validates proper Date object reconstruction with mocked data
 * - Tests file system error scenarios using mock failures
 * - Verifies agent memory structure integrity with mocked file content
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  loadAllAgentsFromDisk,
  loadAgentFromDisk,
  saveAgentToDisk,
  deleteAgentFromDisk,
  agentExistsOnDisk
} from '../../core/agent-storage.js';
import { Agent, LLMProvider } from '../../core/types.js';

// Mock fs module - this will be the mocked version
jest.mock('fs');
const fs = require('fs').promises;

describe('Core Agent Storage with Mocks', () => {
  const worldId = 'test-world';

  // Mock file system state - maps file paths to content
  let mockFileSystem: { [path: string]: string } = {};

  beforeEach(async () => {
    // Clear mock file system state for test isolation
    mockFileSystem = {};

    // Setup environment for correct paths
    process.env.AGENT_WORLD_DATA_PATH = 'test-data/worlds';

    // Setup mocks for each test with isolated state
    fs.readFile.mockImplementation(async (path: any, encoding?: any): Promise<any> => {
      const pathStr = path.toString();

      if (mockFileSystem[pathStr]) {
        return mockFileSystem[pathStr];
      }

      // Throw ENOENT error if file doesn't exist in mock system
      const error = new Error(`ENOENT: no such file or directory, open '${pathStr}'`);
      (error as any).code = 'ENOENT';
      throw error;
    });

    fs.writeFile.mockImplementation(async (path: any, data: any, encoding?: any): Promise<any> => {
      const pathStr = path.toString();
      mockFileSystem[pathStr] = data.toString();
    });

    fs.mkdir.mockResolvedValue(undefined);

    fs.rm.mockImplementation(async (path: any, options?: any): Promise<any> => {
      const pathStr = path.toString();
      // Remove files that start with the path (directory removal)
      Object.keys(mockFileSystem).forEach(filePath => {
        if (filePath.startsWith(pathStr)) {
          delete mockFileSystem[filePath];
        }
      });
    });

    fs.access.mockImplementation(async (path: any): Promise<any> => {
      const pathStr = path.toString();
      if (!mockFileSystem[pathStr]) {
        const error = new Error(`ENOENT: no such file or directory, access '${pathStr}'`);
        (error as any).code = 'ENOENT';
        throw error;
      }
    });

    fs.readdir.mockImplementation(async (path: any, options?: any): Promise<any> => {
      const pathStr = path.toString();
      const entries: string[] = [];

      // Find all directories that are direct children of the given path
      Object.keys(mockFileSystem).forEach(filePath => {
        if (filePath.startsWith(pathStr + '/')) {
          const relativePath = filePath.substring(pathStr.length + 1);
          const dirName = relativePath.split('/')[0];
          if (!entries.includes(dirName)) {
            entries.push(dirName);
          }
        }
      });

      // Return as directory entries
      return entries.map(name => ({ name, isDirectory: () => true }));
    });
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.AGENT_WORLD_DATA_PATH;

    // Clear mocks
    jest.clearAllMocks();
  });

  // Helper function to create mock agent files
  function createMockAgentFiles(agentId: string) {
    const basePath = `test-data/worlds/${worldId}/agents/${agentId}`;

    // Config file
    mockFileSystem[`${basePath}/config.json`] = JSON.stringify({
      id: agentId,
      name: 'Mock Agent',
      type: 'test',
      status: 'active',
      provider: 'openai',
      model: 'gpt-4',
      createdAt: '2023-01-01T00:00:00.000Z',
      lastActive: '2023-01-01T00:00:00.000Z',
      llmCallCount: 5,
      lastLLMCall: '2023-01-02T00:00:00.000Z'
    });

    // System prompt file
    mockFileSystem[`${basePath}/system-prompt.md`] = 'You are a mock agent for testing.';

    // Memory file
    mockFileSystem[`${basePath}/memory.json`] = JSON.stringify([]);
  }

  describe('loadAllAgentsFromDisk', () => {
    test('should return empty array when no agents exist', async () => {
      const loadedAgents = await loadAllAgentsFromDisk('test-data/worlds', worldId);
      expect(loadedAgents).toEqual([]);
    });

    test('should load single agent correctly with mocked files', async () => {
      const agentId = 'test-agent-1';
      createMockAgentFiles(agentId);

      const loadedAgents = await loadAllAgentsFromDisk('test-data/worlds', worldId);

      expect(loadedAgents).toHaveLength(1);
      expect(loadedAgents[0].id).toBe(agentId);
      expect(loadedAgents[0].name).toBe('Mock Agent');
      expect(loadedAgents[0].createdAt).toBeInstanceOf(Date);
    });

    test('should load multiple agents correctly with mocked files', async () => {
      // Create multiple mock agents
      for (let i = 1; i <= 3; i++) {
        createMockAgentFiles(`test-agent-${i}`);
      }

      const loadedAgents = await loadAllAgentsFromDisk('test-data/worlds', worldId);

      expect(loadedAgents).toHaveLength(3);

      // Verify all agents loaded correctly
      for (let i = 0; i < 3; i++) {
        expect(loadedAgents[i].id).toBe(`test-agent-${i + 1}`);
        expect(loadedAgents[i].name).toBe('Mock Agent');
        expect(loadedAgents[i].createdAt).toBeInstanceOf(Date);
      }
    });

    test('should handle corrupted agent files gracefully with mocks', async () => {
      const agentId = 'corrupted-agent';
      const basePath = `test-data/worlds/${worldId}/agents/${agentId}`;

      // Create corrupted config file
      mockFileSystem[`${basePath}/config.json`] = '{ invalid json }';

      const loadedAgents = await loadAllAgentsFromDisk('test-data/worlds', worldId);

      // Should skip corrupted agent and return empty array
      expect(loadedAgents).toEqual([]);
    });

    test('should preserve agent memory with Date objects using mocks', async () => {
      const agentId = 'memory-agent';
      const basePath = `test-data/worlds/${worldId}/agents/${agentId}`;

      // Create agent with memory
      mockFileSystem[`${basePath}/config.json`] = JSON.stringify({
        id: agentId,
        name: 'Memory Agent',
        type: 'test',
        status: 'active',
        provider: 'openai',
        model: 'gpt-4',
        createdAt: '2023-01-01T00:00:00.000Z',
        lastActive: '2023-01-01T00:00:00.000Z',
        llmCallCount: 0
      });

      mockFileSystem[`${basePath}/system-prompt.md`] = 'You are a memory agent.';
      mockFileSystem[`${basePath}/memory.json`] = JSON.stringify([
        { role: 'user', content: 'Hello', createdAt: '2023-01-01T00:00:00.000Z' },
        { role: 'assistant', content: 'Hi there!', createdAt: '2023-01-01T00:01:00.000Z' }
      ]);

      const loadedAgents = await loadAllAgentsFromDisk('test-data/worlds', worldId);

      expect(loadedAgents).toHaveLength(1);
      expect(loadedAgents[0].memory).toHaveLength(2);
      expect(loadedAgents[0].memory[0].createdAt).toBeInstanceOf(Date);
      expect(loadedAgents[0].memory[1].createdAt).toBeInstanceOf(Date);
    });
  });

  describe('loadAgentFromDisk', () => {
    test('should return null for non-existent agent', async () => {
      const loadedAgent = await loadAgentFromDisk('test-data/worlds', worldId, 'non-existent');
      expect(loadedAgent).toBeNull();
    });

    test('should load agent with all data correctly using mocks', async () => {
      const agentId = 'mock-agent';
      createMockAgentFiles(agentId);

      const loadedAgent = await loadAgentFromDisk('test-data/worlds', worldId, agentId);

      expect(loadedAgent).not.toBeNull();
      expect(loadedAgent!.id).toBe('mock-agent');
      expect(loadedAgent!.name).toBe('Mock Agent');
      expect(loadedAgent!.llmCallCount).toBe(5);
    });
  });

  describe('saveAgentToDisk', () => {
    test('should create proper directory structure with mocks', async () => {
      const agentId = 'save-agent';
      const agent: Agent = {
        id: agentId,
        name: 'Test Agent',
        type: 'test',
        status: 'active',
        provider: LLMProvider.OPENAI,
        model: 'gpt-4',
        systemPrompt: 'You are a test agent',
        createdAt: new Date(),
        lastActive: new Date(),
        llmCallCount: 0,
        memory: []
      };

      await saveAgentToDisk('test-data/worlds', worldId, agent);

      // Verify directory creation
      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining(agentId),
        { recursive: true }
      );

      // Verify files were written
      expect(fs.writeFile).toHaveBeenCalledTimes(3); // config, system-prompt, memory
    });

    test('should handle agents with complex memory using mocks', async () => {
      const agentId = 'complex-memory-agent';
      const agent: Agent = {
        id: agentId,
        name: 'Test Agent',
        type: 'test',
        status: 'active',
        provider: LLMProvider.OPENAI,
        model: 'gpt-4',
        systemPrompt: 'You are a test agent',
        createdAt: new Date(),
        lastActive: new Date(),
        llmCallCount: 0,
        memory: [
          {
            role: 'user',
            content: 'Complex message with unicode: 你好 🌟',
            createdAt: new Date(),
            sender: 'test-user'
          },
          {
            role: 'assistant',
            content: 'Response with special chars: @#$%^&*()',
            createdAt: new Date()
          }
        ]
      };

      // Should not throw and should save successfully
      await expect(saveAgentToDisk('test-data/worlds', worldId, agent)).resolves.toBeUndefined();

      // Verify files were written
      expect(fs.writeFile).toHaveBeenCalledTimes(3); // config, system-prompt, memory
    });
  });

  describe('deleteAgentFromDisk', () => {
    test('should return false for non-existent agent', async () => {
      const result = await deleteAgentFromDisk('test-data/worlds', worldId, 'non-existent');
      expect(result).toBe(false);
    });

    test('should delete agent and return true with mocks', async () => {
      const agentId = 'delete-agent';
      createMockAgentFiles(agentId);

      // Mock the access call to succeed for this agent (indicating it exists)
      const basePath = `test-data/worlds/${worldId}/agents/${agentId}`;
      fs.access.mockImplementation(async (path: any): Promise<any> => {
        const pathStr = path.toString();
        if (pathStr.includes(agentId) || mockFileSystem[pathStr]) {
          return; // Success - don't throw
        }
        const error = new Error(`ENOENT: no such file or directory, access '${pathStr}'`);
        (error as any).code = 'ENOENT';
        throw error;
      });

      const result = await deleteAgentFromDisk('test-data/worlds', worldId, agentId);
      expect(result).toBe(true);

      // Verify deletion was called
      expect(fs.rm).toHaveBeenCalledWith(
        expect.stringContaining(agentId),
        { recursive: true, force: true }
      );
    });
  });

  describe('agentExistsOnDisk', () => {
    test('should return false for non-existent agent', async () => {
      const exists = await agentExistsOnDisk('test-data/worlds', worldId, 'non-existent');
      expect(exists).toBe(false);
    });

    test('should return true for existing agent with mocks', async () => {
      const agentId = 'existing-agent';
      createMockAgentFiles(agentId);

      const exists = await agentExistsOnDisk('test-data/worlds', worldId, agentId);
      expect(exists).toBe(true);

      // Verify access was called with config path
      expect(fs.access).toHaveBeenCalledWith(
        expect.stringContaining('config.json')
      );
    });
  });

  describe('Enhanced Error Scenarios', () => {
    test('should handle file read permission errors', async () => {
      const agentId = 'permission-test';
      createMockAgentFiles(agentId);

      // Mock permission error for config file
      const basePath = `test-data/worlds/${worldId}/agents/${agentId}`;
      fs.readFile.mockImplementation(async (path: any) => {
        if (path.toString() === `${basePath}/config.json`) {
          const error = new Error('EACCES: permission denied');
          (error as any).code = 'EACCES';
          throw error;
        }
        return mockFileSystem[path.toString()] || '';
      });

      const loadedAgents = await loadAllAgentsFromDisk('test-data/worlds', worldId);
      expect(loadedAgents).toEqual([]);
    });

    test('should handle disk full errors during save', async () => {
      const agent: Agent = {
        id: 'save-error-test',
        name: 'Save Error Agent',
        type: 'test',
        status: 'active',
        provider: LLMProvider.OPENAI,
        model: 'gpt-4',
        systemPrompt: 'Test agent',
        temperature: 0.7,
        maxTokens: 1000,
        createdAt: new Date('2023-01-01T00:00:00Z'),
        lastActive: new Date('2023-01-01T00:00:00Z'),
        llmCallCount: 0,
        memory: []
      };

      // Mock disk full error as proper Error object
      const diskError = new Error('ENOSPC: no space left on device');
      (diskError as any).code = 'ENOSPC';
      fs.writeFile.mockRejectedValue(diskError);

      await expect(saveAgentToDisk('test-data/worlds', worldId, agent))
        .rejects.toThrow('ENOSPC: no space left on device');
    });

    test('should handle corrupted JSON in config file', async () => {
      const agentId = 'corrupted-config';
      const basePath = `test-data/worlds/${worldId}/agents/${agentId}`;

      // Create corrupted config file
      mockFileSystem[`${basePath}/config.json`] = '{ invalid json content }';
      mockFileSystem[`${basePath}/system-prompt.md`] = 'Test prompt';
      mockFileSystem[`${basePath}/memory.json`] = '[]';

      const loadedAgents = await loadAllAgentsFromDisk('test-data/worlds', worldId);
      expect(loadedAgents).toEqual([]);
    });

    test('should handle corrupted JSON in memory file', async () => {
      const agentId = 'corrupted-memory';
      const basePath = `test-data/worlds/${worldId}/agents/${agentId}`;

      mockFileSystem[`${basePath}/config.json`] = JSON.stringify({
        id: agentId,
        name: 'Test Agent',
        type: 'test',
        status: 'active',
        provider: 'openai',
        model: 'gpt-4',
        createdAt: '2023-01-01T00:00:00.000Z',
        lastActive: '2023-01-01T00:00:00.000Z',
        llmCallCount: 0
      });
      mockFileSystem[`${basePath}/system-prompt.md`] = 'Test prompt';
      mockFileSystem[`${basePath}/memory.json`] = '{ invalid json }';

      const loadedAgents = await loadAllAgentsFromDisk('test-data/worlds', worldId);
      // The agent should still be loaded with empty memory array due to partial loading recovery
      expect(loadedAgents).toHaveLength(1);
      expect(loadedAgents[0].id).toBe(agentId);
      expect(loadedAgents[0].memory).toEqual([]);
    });

    test('should handle missing required files gracefully', async () => {
      const agentId = 'incomplete-agent';
      const basePath = `test-data/worlds/${worldId}/agents/${agentId}`;

      // Only create config file, missing system prompt and memory
      mockFileSystem[`${basePath}/config.json`] = JSON.stringify({
        id: agentId,
        name: 'Incomplete Agent',
        type: 'test',
        status: 'active',
        provider: 'openai',
        model: 'gpt-4',
        createdAt: '2023-01-01T00:00:00.000Z',
        lastActive: '2023-01-01T00:00:00.000Z',
        llmCallCount: 0
      });

      const loadedAgents = await loadAllAgentsFromDisk('test-data/worlds', worldId);
      // The agent should be loaded with default system prompt and empty memory due to partial loading recovery
      expect(loadedAgents).toHaveLength(1);
      expect(loadedAgents[0].id).toBe(agentId);
      expect(loadedAgents[0].systemPrompt).toBe(`You are ${agentId}, an AI agent.`);
      expect(loadedAgents[0].memory).toEqual([]);
    });
  });

  describe('Batch Loading Operations', () => {
    test('should handle loading multiple agents concurrently', async () => {
      // Create multiple agent files
      const agentIds = ['agent-1', 'agent-2', 'agent-3', 'agent-4', 'agent-5'];
      agentIds.forEach(id => createMockAgentFiles(id));

      const loadedAgents = await loadAllAgentsFromDisk('test-data/worlds', worldId);

      expect(loadedAgents).toHaveLength(5);
      agentIds.forEach(id => {
        expect(loadedAgents.find(agent => agent.id === id)).toBeDefined();
      });
    });

    test('should handle mixed valid and invalid agents', async () => {
      // Create some valid agents
      createMockAgentFiles('valid-1');
      createMockAgentFiles('valid-2');

      // Create invalid agent with corrupted config
      const basePath = `test-data/worlds/${worldId}/agents/invalid-1`;
      mockFileSystem[`${basePath}/config.json`] = 'invalid json';
      mockFileSystem[`${basePath}/system-prompt.md`] = 'Test';
      mockFileSystem[`${basePath}/memory.json`] = '[]';

      const loadedAgents = await loadAllAgentsFromDisk('test-data/worlds', worldId);

      expect(loadedAgents).toHaveLength(2);
      expect(loadedAgents.find(agent => agent.id === 'valid-1')).toBeDefined();
      expect(loadedAgents.find(agent => agent.id === 'valid-2')).toBeDefined();
      expect(loadedAgents.find(agent => agent.id === 'invalid-1')).toBeUndefined();
    });

    test('should handle concurrent save operations', async () => {
      const agents = [
        {
          id: 'concurrent-1',
          name: 'Concurrent Agent 1',
          type: 'test',
          status: 'active' as const,
          provider: LLMProvider.OPENAI,
          model: 'gpt-4',
          systemPrompt: 'Test 1',
          temperature: 0.7,
          maxTokens: 1000,
          createdAt: new Date('2023-01-01T00:00:00Z'),
          lastActive: new Date('2023-01-01T00:00:00Z'),
          llmCallCount: 0,
          memory: []
        },
        {
          id: 'concurrent-2',
          name: 'Concurrent Agent 2',
          type: 'test',
          status: 'active' as const,
          provider: LLMProvider.OPENAI,
          model: 'gpt-4',
          systemPrompt: 'Test 2',
          temperature: 0.7,
          maxTokens: 1000,
          createdAt: new Date('2023-01-01T00:00:00Z'),
          lastActive: new Date('2023-01-01T00:00:00Z'),
          llmCallCount: 0,
          memory: []
        }
      ];

      // Save agents concurrently
      const savePromises = agents.map(agent =>
        saveAgentToDisk('test-data/worlds', worldId, agent)
      );

      await Promise.all(savePromises);

      // Verify both agents were saved
      expect(fs.writeFile).toHaveBeenCalledTimes(6); // 3 files per agent
    });
  });

  describe('Agent Validation Edge Cases', () => {
    test('should handle agent with extreme configuration values', async () => {
      const agent: Agent = {
        id: 'extreme-config',
        name: 'Extreme Configuration Agent',
        type: 'test',
        status: 'active',
        provider: LLMProvider.OPENAI,
        model: 'gpt-4',
        systemPrompt: 'A'.repeat(10000), // Very long system prompt
        temperature: 2.0, // Above normal range
        maxTokens: 100000, // Very high token limit
        createdAt: new Date('1970-01-01T00:00:00Z'), // Very old date
        lastActive: new Date('2099-12-31T23:59:59Z'), // Future date
        llmCallCount: 999999, // Very high call count
        memory: Array.from({ length: 1000 }, (_, i) => ({
          role: 'user',
          content: `Message ${i}`,
          createdAt: new Date(),
          sender: 'user'
        })) // Very large memory
      };

      await saveAgentToDisk('test-data/worlds', worldId, agent);

      // Verify all files were written
      expect(fs.writeFile).toHaveBeenCalledTimes(3);
    });

    test('should handle agent with special characters in content', async () => {
      const agent: Agent = {
        id: 'special-chars',
        name: 'Agent with "quotes" & <symbols>',
        type: 'test & special',
        status: 'active',
        provider: LLMProvider.OPENAI,
        model: 'gpt-4',
        systemPrompt: 'You are an agent with 🤖 emojis and \n newlines \t tabs',
        temperature: 0.7,
        maxTokens: 1000,
        createdAt: new Date('2023-01-01T00:00:00Z'),
        lastActive: new Date('2023-01-01T00:00:00Z'),
        llmCallCount: 0,
        memory: [
          {
            role: 'user',
            content: 'Message with "quotes", \n newlines, and 🦄 emojis',
            createdAt: new Date(),
            sender: 'user with spaces'
          }
        ]
      };

      await saveAgentToDisk('test-data/worlds', worldId, agent);

      // Verify agent was saved despite special characters
      expect(fs.writeFile).toHaveBeenCalledTimes(3);
    });

    test('should handle agents with minimal required fields only', async () => {
      const minimalAgent: Agent = {
        id: 'minimal',
        name: 'Minimal Agent',
        type: 'test',
        status: 'active',
        provider: LLMProvider.OPENAI,
        model: 'gpt-3.5-turbo',
        systemPrompt: '',
        temperature: 0,
        maxTokens: 1,
        createdAt: new Date('2023-01-01T00:00:00Z'),
        lastActive: new Date('2023-01-01T00:00:00Z'),
        llmCallCount: 0,
        memory: []
      };

      await saveAgentToDisk('test-data/worlds', worldId, minimalAgent);

      expect(fs.writeFile).toHaveBeenCalledTimes(3);
    });
  });
});
