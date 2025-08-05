/**
 * Unit Tests for Agent Storage (Core System)
 *
 * Features:
 * - Tests for listAgents function with mocked file I/O
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

// We need to unmock agent-storage for this test since we're testing it
jest.unmock('../../../core/storage/agent-storage');

import {
  listAgents,
  loadAgent,
  saveAgent,
  deleteAgent,
  agentExists
} from '../../../core/storage/agent-storage';
import { Agent, LLMProvider } from '../../../core/types';
import { createMockAgent } from '../mock-helpers';

// Get the global fs mock from setup
const fs = require('fs').promises;

describe('Core Agent Storage with Mocks', () => {
  const worldId = 'test-world';

  beforeEach(async () => {
    // Setup environment for correct paths
    process.env.AGENT_WORLD_DATA_PATH = 'test-data/worlds';
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.AGENT_WORLD_DATA_PATH;
  });

  describe('listAgents', () => {
    test('should return empty array when no agents exist', async () => {
      // Mock empty directory
      fs.readdir.mockResolvedValue([]);

      const loadedAgents = await listAgents('test-data/worlds', worldId);
      expect(loadedAgents).toEqual([]);
    });

    test('should load single agent correctly with mocked files', async () => {
      const agentId = 'test-agent-1';

      // Mock directory listing
      fs.readdir.mockResolvedValue([{ name: agentId, isDirectory: () => true }]);

      // Mock agent files
      fs.readFile.mockImplementation(async (path: string) => {
        if (path.includes('config.json')) {
          return JSON.stringify({
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
        }
        if (path.includes('system-prompt.md')) {
          return 'You are a mock agent for testing.';
        }
        if (path.includes('memory.json')) {
          return JSON.stringify([]);
        }
        throw new Error('File not found');
      });

      const loadedAgents = await listAgents('test-data/worlds', worldId);

      expect(loadedAgents).toHaveLength(1);
      expect(loadedAgents[0].id).toBe(agentId);
      expect(loadedAgents[0].name).toBe('Mock Agent');
      expect(loadedAgents[0].createdAt).toBeInstanceOf(Date);
    });

    test('should handle corrupted agent files gracefully with mocks', async () => {
      const agentId = 'corrupted-agent';

      // Mock directory listing
      fs.readdir.mockResolvedValue([{ name: agentId, isDirectory: () => true }]);

      // Mock corrupted config file
      fs.readFile.mockImplementation(async (path: string) => {
        if (path.includes('config.json')) {
          return '{ invalid json }';
        }
        throw new Error('File not found');
      });

      const loadedAgents = await listAgents('test-data/worlds', worldId);

      // Should skip corrupted agent and return empty array
      expect(loadedAgents).toEqual([]);
    });

    test('should preserve agent memory with Date objects using mocks', async () => {
      const agentId = 'memory-agent';

      // Mock directory listing
      fs.readdir.mockResolvedValue([{ name: agentId, isDirectory: () => true }]);

      // Mock agent files with memory
      fs.readFile.mockImplementation(async (path: string) => {
        if (path.includes('config.json')) {
          return JSON.stringify({
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
        }
        if (path.includes('system-prompt.md')) {
          return 'You are a memory agent.';
        }
        if (path.includes('memory.json')) {
          return JSON.stringify([
            { role: 'user', content: 'Hello', createdAt: '2023-01-01T00:00:00.000Z' },
            { role: 'assistant', content: 'Hi there!', createdAt: '2023-01-01T00:01:00.000Z' }
          ]);
        }
        throw new Error('File not found');
      });

      const loadedAgents = await listAgents('test-data/worlds', worldId);

      expect(loadedAgents).toHaveLength(1);
      expect(loadedAgents[0].memory).toHaveLength(2);
      expect(loadedAgents[0].memory[0].createdAt).toBeInstanceOf(Date);
      expect(loadedAgents[0].memory[1].createdAt).toBeInstanceOf(Date);
    });
  });

  describe('loadAgent', () => {
    test('should return null for non-existent agent', async () => {
      // Mock file access failure
      fs.readFile.mockRejectedValue(new Error('ENOENT: no such file or directory'));

      const loadedAgent = await loadAgent('test-data/worlds', worldId, 'non-existent');
      expect(loadedAgent).toBeNull();
    });

    test('should load agent with all data correctly using mocks', async () => {
      const agentId = 'mock-agent';

      // Mock agent files
      fs.readFile.mockImplementation(async (path: string) => {
        if (path.includes('config.json')) {
          return JSON.stringify({
            id: agentId,
            name: 'Mock Agent',
            type: 'test',
            status: 'active',
            provider: 'openai',
            model: 'gpt-4',
            createdAt: '2023-01-01T00:00:00.000Z',
            lastActive: '2023-01-01T00:00:00.000Z',
            llmCallCount: 5
          });
        }
        if (path.includes('system-prompt.md')) {
          return 'You are a mock agent for testing.';
        }
        if (path.includes('memory.json')) {
          return JSON.stringify([]);
        }
        throw new Error('File not found');
      });

      const loadedAgent = await loadAgent('test-data/worlds', worldId, agentId);

      expect(loadedAgent).not.toBeNull();
      expect(loadedAgent!.id).toBe('mock-agent');
      expect(loadedAgent!.name).toBe('Mock Agent');
      expect(loadedAgent!.llmCallCount).toBe(5);
    });
  });

  describe('saveAgent', () => {
    test('should create proper directory structure with mocks', async () => {
      const agentId = 'save-agent';
      const agent = createMockAgent({
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
      });

      await saveAgent('test-data/worlds', worldId, agent);

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
      const agent = createMockAgent({
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
      });

      // Should not throw and should save successfully
      await expect(saveAgent('test-data/worlds', worldId, agent)).resolves.toBeUndefined();

      // Verify files were written
      expect(fs.writeFile).toHaveBeenCalledTimes(3); // config, system-prompt, memory
    });
  });

  describe('deleteAgent', () => {
    test('should return false for non-existent agent', async () => {
      // Mock access failure
      fs.access.mockRejectedValue(new Error('ENOENT: no such file or directory'));

      const result = await deleteAgent('test-data/worlds', worldId, 'non-existent');
      expect(result).toBe(false);
    });

    test('should delete agent and return true with mocks', async () => {
      const agentId = 'delete-agent';

      // Mock successful access
      fs.access.mockResolvedValue(undefined);

      const result = await deleteAgent('test-data/worlds', worldId, agentId);
      expect(result).toBe(true);

      // Verify deletion was called
      expect(fs.rm).toHaveBeenCalledWith(
        expect.stringContaining(agentId),
        { recursive: true, force: true }
      );
    });
  });

  describe('agentExists', () => {
    test('should return false for non-existent agent', async () => {
      // Mock access failure
      fs.access.mockRejectedValue(new Error('ENOENT: no such file or directory'));

      const exists = await agentExists('test-data/worlds', worldId, 'non-existent');
      expect(exists).toBe(false);
    });

    test('should return true for existing agent with mocks', async () => {
      const agentId = 'existing-agent';

      // Mock successful access
      fs.access.mockResolvedValue(undefined);

      const exists = await agentExists('test-data/worlds', worldId, agentId);
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

      // Mock directory listing
      fs.readdir.mockResolvedValue([{ name: agentId, isDirectory: () => true }]);

      // Mock permission error for config file
      fs.readFile.mockImplementation(async (path: string) => {
        if (path.includes('config.json')) {
          const error = new Error('EACCES: permission denied');
          (error as any).code = 'EACCES';
          throw error;
        }
        throw new Error('File not found');
      });

      const loadedAgents = await listAgents('test-data/worlds', worldId);
      expect(loadedAgents).toEqual([]);
    });

    test('should handle disk full errors during save', async () => {
      const agent = createMockAgent({
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
      });

      // Mock disk full error
      const diskError = new Error('ENOSPC: no space left on device');
      (diskError as any).code = 'ENOSPC';
      fs.writeFile.mockRejectedValue(diskError);

      await expect(saveAgent('test-data/worlds', worldId, agent))
        .rejects.toThrow('ENOSPC: no space left on device');
    });
  });
});
