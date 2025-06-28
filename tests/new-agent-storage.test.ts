/**
 * Unit Tests for Agent Storage Module
 *
 * Features:
 * - Mock file I/O operations to avoid actual file system access
 * - Test agent configuration persistence and loading
 * - Test system prompt and memory file operations
 * - Test Date serialization/deserialization
 * - Test error handling and edge cases
 *
 * Implementation:
 * - Mock fs/promises module for isolated testing
 * - Test all core functions with proper assertions
 * - Cover kebab-case directory naming
 * - Test three-file structure (config.json, system-prompt.md, memory.json)
 */

import { jest } from '@jest/globals';
import { Agent, AgentMessage, LLMProvider } from '../../src/types.js';

// Mock fs/promises
const mockFs = {
  mkdir: jest.fn(),
  writeFile: jest.fn(),
  readFile: jest.fn(),
  rm: jest.fn(),
  access: jest.fn(),
  readdir: jest.fn(),
  rename: jest.fn()
};

jest.unstable_mockModule('fs', () => ({
  promises: mockFs
}));

// Import after mocking
const {
  saveAgentToDisk,
  loadAgentFromDisk,
  deleteAgentFromDisk,
  loadAllAgentsFromDisk,
  agentExistsOnDisk,
  getAgentDir,
  ensureAgentDirectory
} = await import('../../src/managers/agent-storage.js');

describe('Agent Storage Module', () => {
  const worldId = 'test-world';
  const agentId = 'test-agent';

  const mockAgent: Agent = {
    id: agentId,
    type: 'assistant',
    status: 'active',
    config: {
      name: 'Test Agent',
      type: 'assistant',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4',
      systemPrompt: 'You are a helpful assistant.',
      temperature: 0.7,
      maxTokens: 1000
    },
    createdAt: new Date('2024-01-01T00:00:00Z'),
    lastActive: new Date('2024-01-01T12:00:00Z'),
    llmCallCount: 5,
    lastLLMCall: new Date('2024-01-01T11:30:00Z'),
    memory: [
      {
        role: 'user',
        content: 'Hello',
        createdAt: new Date('2024-01-01T10:00:00Z'),
        sender: 'user1'
      },
      {
        role: 'assistant',
        content: 'Hi there!',
        createdAt: new Date('2024-01-01T10:01:00Z')
      }
    ]
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Set up default successful mock implementations
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.rename.mockResolvedValue(undefined);
    mockFs.access.mockResolvedValue(undefined);
  });

  describe('getAgentDir', () => {
    it('should return correct agent directory path', () => {
      const result = getAgentDir(worldId, agentId);
      expect(result).toMatch(/test-world[/\\]agents[/\\]test-agent$/);
    });
  });

  describe('ensureAgentDirectory', () => {
    it('should create agent directory', async () => {
      await ensureAgentDirectory(worldId, agentId);

      expect(mockFs.mkdir).toHaveBeenCalledWith(
        expect.stringMatching(/test-world[/\\]agents[/\\]test-agent$/),
        { recursive: true }
      );
    });
  });

  describe('agentExistsOnDisk', () => {
    it('should return true when agent config exists', async () => {
      mockFs.access.mockResolvedValue(undefined);

      const result = await agentExistsOnDisk(worldId, agentId);

      expect(result).toBe(true);
      expect(mockFs.access).toHaveBeenCalledWith(
        expect.stringMatching(/test-world[/\\]agents[/\\]test-agent[/\\]config\\.json$/)
      );
    });

    it('should return false when agent config does not exist', async () => {
      mockFs.access.mockRejectedValue(new Error('File not found'));

      const result = await agentExistsOnDisk(worldId, agentId);

      expect(result).toBe(false);
    });
  });

  describe('saveAgentToDisk', () => {
    it('should save agent to three separate files', async () => {
      await saveAgentToDisk(worldId, mockAgent);

      // Check directory creation
      expect(mockFs.mkdir).toHaveBeenCalledWith(
        expect.stringMatching(/test-world[/\\]agents[/\\]test-agent$/),
        { recursive: true }
      );

      // Check config.json
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/config\\.json\\.tmp$/),
        expect.stringContaining('"name":"Test Agent"'),
        'utf8'
      );

      // Check system-prompt.md
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/system-prompt\\.md$/),
        'You are a helpful assistant.',
        'utf8'
      );

      // Check memory.json
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/memory\\.json\\.tmp$/),
        expect.stringContaining('"role":"user"'),
        'utf8'
      );

      // Check atomic renames
      expect(mockFs.rename).toHaveBeenCalledTimes(2);
    });

    it('should handle agent with empty system prompt', async () => {
      const agentWithoutPrompt = { ...mockAgent };
      agentWithoutPrompt.config.systemPrompt = undefined;

      await saveAgentToDisk(worldId, agentWithoutPrompt);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/system-prompt\\.md$/),
        '',
        'utf8'
      );
    });

    it('should serialize dates correctly', async () => {
      await saveAgentToDisk(worldId, mockAgent);

      const configCall = mockFs.writeFile.mock.calls.find(call =>
        call[0].includes('config.json.tmp')
      );
      const configData = JSON.parse(configCall[1]);

      expect(configData.createdAt).toBe('2024-01-01T00:00:00.000Z');
      expect(configData.lastActive).toBe('2024-01-01T12:00:00.000Z');
      expect(configData.lastLLMCall).toBe('2024-01-01T11:30:00.000Z');
    });
  });

  describe('loadAgentFromDisk', () => {
    beforeEach(() => {
      // Mock file reads
      mockFs.readFile
        .mockImplementation((filePath: string) => {
          if (filePath.includes('config.json')) {
            return Promise.resolve(JSON.stringify({
              id: agentId,
              type: 'assistant',
              status: 'active',
              config: {
                name: 'Test Agent',
                type: 'assistant',
                provider: 'openai',
                model: 'gpt-4',
                temperature: 0.7,
                maxTokens: 1000
              },
              createdAt: '2024-01-01T00:00:00.000Z',
              lastActive: '2024-01-01T12:00:00.000Z',
              llmCallCount: 5,
              lastLLMCall: '2024-01-01T11:30:00.000Z'
            }));
          }
          if (filePath.includes('system-prompt.md')) {
            return Promise.resolve('You are a helpful assistant.');
          }
          if (filePath.includes('memory.json')) {
            return Promise.resolve(JSON.stringify([
              {
                role: 'user',
                content: 'Hello',
                createdAt: '2024-01-01T10:00:00.000Z',
                sender: 'user1'
              },
              {
                role: 'assistant',
                content: 'Hi there!',
                createdAt: '2024-01-01T10:01:00.000Z'
              }
            ]));
          }
          return Promise.reject(new Error('File not found'));
        });
    });

    it('should load agent from disk with proper date reconstruction', async () => {
      const result = await loadAgentFromDisk(worldId, agentId);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(agentId);
      expect(result!.config.name).toBe('Test Agent');
      expect(result!.config.systemPrompt).toBe('You are a helpful assistant.');
      expect(result!.memory).toHaveLength(2);
      expect(result!.memory[0].content).toBe('Hello');
      expect(result!.memory[0].sender).toBe('user1');

      // Check date reconstruction
      expect(result!.createdAt).toBeInstanceOf(Date);
      expect(result!.createdAt!.toISOString()).toBe('2024-01-01T00:00:00.000Z');
      expect(result!.lastActive).toBeInstanceOf(Date);
      expect(result!.memory[0].createdAt).toBeInstanceOf(Date);
    });

    it('should return null when agent does not exist', async () => {
      mockFs.readFile.mockRejectedValue(new Error('File not found'));

      const result = await loadAgentFromDisk(worldId, 'nonexistent');

      expect(result).toBeNull();
    });

    it('should handle missing system prompt file', async () => {
      mockFs.readFile.mockImplementation((filePath: string) => {
        if (filePath.includes('system-prompt.md')) {
          return Promise.reject(new Error('File not found'));
        }
        return mockFs.readFile(filePath); // Use original mock for other files
      });

      const result = await loadAgentFromDisk(worldId, agentId);

      expect(result).not.toBeNull();
      expect(result!.config.systemPrompt).toBe('');
    });

    it('should handle missing memory file', async () => {
      mockFs.readFile.mockImplementation((filePath: string) => {
        if (filePath.includes('memory.json')) {
          return Promise.reject(new Error('File not found'));
        }
        return mockFs.readFile(filePath); // Use original mock for other files
      });

      const result = await loadAgentFromDisk(worldId, agentId);

      expect(result).not.toBeNull();
      expect(result!.memory).toEqual([]);
    });
  });

  describe('deleteAgentFromDisk', () => {
    it('should delete agent directory recursively', async () => {
      mockFs.rm.mockResolvedValue(undefined);

      const result = await deleteAgentFromDisk(worldId, agentId);

      expect(result).toBe(true);
      expect(mockFs.rm).toHaveBeenCalledWith(
        expect.stringMatching(/test-world[/\\]agents[/\\]test-agent$/),
        { recursive: true, force: true }
      );
    });

    it('should return false when deletion fails', async () => {
      mockFs.rm.mockRejectedValue(new Error('Permission denied'));

      const result = await deleteAgentFromDisk(worldId, agentId);

      expect(result).toBe(false);
    });
  });

  describe('loadAllAgentsFromDisk', () => {
    beforeEach(() => {
      mockFs.readdir.mockResolvedValue([
        { name: 'agent1', isDirectory: () => true },
        { name: 'agent2', isDirectory: () => true },
        { name: 'somefile.txt', isDirectory: () => false }
      ]);

      mockFs.readFile.mockImplementation((filePath: string) => {
        if (filePath.includes('agent1') && filePath.includes('config.json')) {
          return Promise.resolve(JSON.stringify({
            id: 'agent1',
            type: 'assistant',
            status: 'active',
            config: { name: 'Agent 1', type: 'assistant', provider: 'openai', model: 'gpt-4' },
            createdAt: '2024-01-01T00:00:00.000Z',
            lastActive: '2024-01-01T12:00:00.000Z',
            llmCallCount: 0
          }));
        }
        if (filePath.includes('agent2') && filePath.includes('config.json')) {
          return Promise.resolve(JSON.stringify({
            id: 'agent2',
            type: 'assistant',
            status: 'inactive',
            config: { name: 'Agent 2', type: 'assistant', provider: 'openai', model: 'gpt-3.5-turbo' },
            createdAt: '2024-01-02T00:00:00.000Z',
            lastActive: '2024-01-02T12:00:00.000Z',
            llmCallCount: 3
          }));
        }
        if (filePath.includes('system-prompt.md')) {
          return Promise.resolve('System prompt');
        }
        if (filePath.includes('memory.json')) {
          return Promise.resolve('[]');
        }
        return Promise.reject(new Error('File not found'));
      });
    });

    it('should load all agents from world directory', async () => {
      const result = await loadAllAgentsFromDisk(worldId);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('agent1');
      expect(result[0].config.name).toBe('Agent 1');
      expect(result[1].id).toBe('agent2');
      expect(result[1].config.name).toBe('Agent 2');
    });

    it('should handle empty agents directory', async () => {
      mockFs.readdir.mockResolvedValue([]);

      const result = await loadAllAgentsFromDisk(worldId);

      expect(result).toEqual([]);
    });

    it('should skip invalid agent directories', async () => {
      mockFs.readFile.mockImplementation((filePath: string) => {
        if (filePath.includes('agent1')) {
          return Promise.reject(new Error('Invalid config'));
        }
        return mockFs.readFile(filePath);
      });

      const result = await loadAllAgentsFromDisk(worldId);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('agent2');
    });

    it('should return empty array when directory read fails', async () => {
      mockFs.readdir.mockRejectedValue(new Error('Directory not found'));

      const result = await loadAllAgentsFromDisk(worldId);

      expect(result).toEqual([]);
    });
  });
});
