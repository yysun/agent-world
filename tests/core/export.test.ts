/**
 * Export Module Tests
 * 
 * Tests for the comprehensive world export functionality with enhanced chat support.
 * Validates export format, content accuracy, and chat message inclusion.
 */

import { jest } from '@jest/globals';
import { exportWorldToMarkdown } from '../../core/export.js';
import * as managers from '../../core/managers.js';
import * as storageFactory from '../../core/storage/storage-factory.js';
import { LLMProvider } from '../../core/types.js';
import { EventEmitter } from 'events';

// Mock the managers module
jest.mock('../../core/managers.js', () => ({
  getWorld: jest.fn(),
  listAgents: jest.fn(),
  getAgent: jest.fn(),
  listChats: jest.fn(),
}));

// Mock the storage factory
jest.mock('../../core/storage/storage-factory.js', () => ({
  createStorageWithWrappers: jest.fn(),
}));

describe('Export Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('exportWorldToMarkdown', () => {
    it('should export world with complete information including chats', async () => {
      // Mock world data
      const mockWorld = {
        id: 'test-world',
        name: 'Test World',
        description: 'A test world',
        turnLimit: 5,
        chatLLMProvider: 'openai',
        chatLLMModel: 'gpt-4',
        currentChatId: 'chat-1',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        lastUpdated: new Date('2025-01-02T00:00:00.000Z'),
        totalAgents: 1,
        totalMessages: 2,
        eventEmitter: new EventEmitter(),
        agents: new Map(),
        chats: new Map(),
      };

      // Mock agents
      const mockAgents = [
        {
          id: 'agent-1',
          name: 'Test Agent',
          type: 'assistant',
          provider: LLMProvider.OPENAI,
          model: 'gpt-4',
          status: 'active' as const,
          temperature: 0.7,
          maxTokens: 1000,
          llmCallCount: 5,
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
          lastActive: new Date('2025-01-01T12:00:00.000Z'),
          systemPrompt: 'You are a helpful assistant.',
          memory: [
            {
              role: 'user' as const,
              sender: 'human',
              content: 'Hello',
              createdAt: new Date('2025-01-01T10:00:00.000Z'),
              chatId: 'chat-1',
            },
            {
              role: 'assistant' as const,
              sender: 'agent-1',
              content: 'Hi there!',
              createdAt: new Date('2025-01-01T10:01:00.000Z'),
              chatId: 'chat-1',
            },
          ],
        },
      ];

      // Mock chats
      const mockChats = [
        {
          id: 'chat-1',
          worldId: 'test-world',
          name: 'Test Chat',
          description: 'A test chat session',
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
          updatedAt: new Date('2025-01-01T12:00:00.000Z'),
          messageCount: 2,
        },
      ];

      // Mock WorldChat with messages
      const mockWorldChat = {
        world: mockWorld,
        agents: mockAgents,
        messages: [
          {
            role: 'user' as const,
            sender: 'human',
            content: 'Hello from chat',
            createdAt: new Date('2025-01-01T10:00:00.000Z'),
            chatId: 'chat-1',
          },
          {
            role: 'assistant' as const,
            sender: 'agent-1',
            content: 'Hello from agent in chat',
            createdAt: new Date('2025-01-01T10:01:00.000Z'),
            chatId: 'chat-1',
          },
        ],
        metadata: {
          capturedAt: new Date('2025-01-01T12:00:00.000Z'),
          version: '1.0',
          totalMessages: 2,
          activeAgents: 1,
        },
      };

      // Mock storage
      const mockStorage = {
        loadWorldChatFull: jest.fn(),
      } as any;
      mockStorage.loadWorldChatFull.mockResolvedValue(mockWorldChat);

      // Setup mocks
      (managers.getWorld as jest.MockedFunction<typeof managers.getWorld>).mockResolvedValue(mockWorld);
      (managers.listAgents as jest.MockedFunction<typeof managers.listAgents>).mockResolvedValue(mockAgents);
      (managers.getAgent as jest.MockedFunction<typeof managers.getAgent>).mockResolvedValue(mockAgents[0]);
      (managers.listChats as jest.MockedFunction<typeof managers.listChats>).mockResolvedValue(mockChats);
      (storageFactory.createStorageWithWrappers as jest.MockedFunction<typeof storageFactory.createStorageWithWrappers>).mockResolvedValue(mockStorage as any);

      // Execute export
      const result = await exportWorldToMarkdown('test-world');

      // Verify the result contains expected sections
      expect(result).toContain('# World Export: Test World');
      expect(result).toContain('## World Configuration');
      expect(result).toContain('## Agents (1)');
      expect(result).toContain('## Chats (1)');
      expect(result).toContain('## Export Metadata');

      // Verify world information
      expect(result).toContain('- **Name:** Test World');
      expect(result).toContain('- **ID:** test-world');
      expect(result).toContain('- **Description:** A test world');
      expect(result).toContain('- **Turn Limit:** 5');
      expect(result).toContain('- **Chat LLM Provider:** openai');
      expect(result).toContain('- **Chat LLM Model:** gpt-4');
      expect(result).toContain('- **Current Chat ID:** chat-1');

      // Verify agent information
      expect(result).toContain('### Test Agent');
      expect(result).toContain('- **ID:** agent-1');
      expect(result).toContain('- **Type:** assistant');
      expect(result).toContain('- **LLM Provider:** openai');
      expect(result).toContain('- **Model:** gpt-4');
      expect(result).toContain('- **Status:** active');
      expect(result).toContain('- **LLM Calls:** 5');
      expect(result).toContain('You are a helpful assistant.');

      // Verify agent memory
      expect(result).toContain('**Memory (2 messages):**');
      expect(result).toContain('1. **user** (human)');
      expect(result).toContain('2. **assistant** (agent-1)');

      // Verify chat information
      expect(result).toContain('### Test Chat');
      expect(result).toContain('- **ID:** chat-1');
      expect(result).toContain('- **Name:** Test Chat');
      expect(result).toContain('- **Description:** A test chat session');
      expect(result).toContain('- **Message Count:** 2');
      expect(result).toContain('- **Status:** Current active chat');

      // Verify chat messages (should fall back to agent memories when WorldChat isn't available)
      expect(result).toContain('**Messages (2 from agent memories):**');
      expect(result).toContain('Hello');
      expect(result).toContain('Hi there!');

      // Verify export metadata
      expect(result).toContain('- **Export Format Version:** 1.0');
      expect(result).toContain('- **Sections:** World Configuration, Agents (1), Chats (1)');
    });

    it('should handle world not found', async () => {
      (managers.getWorld as jest.MockedFunction<typeof managers.getWorld>).mockResolvedValue(null);

      await expect(exportWorldToMarkdown('non-existent-world')).rejects.toThrow('World \'non-existent-world\' not found');
    });

    it('should handle world with no agents or chats', async () => {
      const mockWorld = {
        id: 'empty-world',
        name: 'Empty World',
        description: 'An empty world',
        turnLimit: 5,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        lastUpdated: new Date('2025-01-02T00:00:00.000Z'),
        totalAgents: 0,
        totalMessages: 0,
        eventEmitter: new EventEmitter(),
        agents: new Map(),
        chats: new Map(),
      };

      const mockStorage = {
        loadWorldChatFull: jest.fn(),
      } as any;
      mockStorage.loadWorldChatFull.mockResolvedValue(null);

      (managers.getWorld as jest.MockedFunction<typeof managers.getWorld>).mockResolvedValue(mockWorld);
      (managers.listAgents as jest.MockedFunction<typeof managers.listAgents>).mockResolvedValue([]);
      (managers.listChats as jest.MockedFunction<typeof managers.listChats>).mockResolvedValue([]);
      (storageFactory.createStorageWithWrappers as jest.MockedFunction<typeof storageFactory.createStorageWithWrappers>).mockResolvedValue(mockStorage as any);

      const result = await exportWorldToMarkdown('empty-world');

      expect(result).toContain('# World Export: Empty World');
      expect(result).toContain('- **Total Agents:** 0');
      expect(result).toContain('- **Total Chats:** 0');
      expect(result).toContain('No agents found in this world.');
      expect(result).toContain('No chats found in this world.');
    });

    it('should handle agents with no memory', async () => {
      const mockWorld = {
        id: 'test-world',
        name: 'Test World',
        turnLimit: 5,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        lastUpdated: new Date('2025-01-02T00:00:00.000Z'),
        totalAgents: 1,
        totalMessages: 0,
        eventEmitter: new EventEmitter(),
        agents: new Map(),
        chats: new Map(),
      };

      const mockAgents = [
        {
          id: 'agent-1',
          name: 'Agent Without Memory',
          type: 'assistant',
          provider: LLMProvider.OPENAI,
          model: 'gpt-4',
          llmCallCount: 0,
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
          lastActive: new Date('2025-01-01T12:00:00.000Z'),
          memory: [],
        },
      ];

      const mockStorage = {
        loadWorldChatFull: jest.fn(),
      } as any;
      mockStorage.loadWorldChatFull.mockResolvedValue(null);

      (managers.getWorld as jest.MockedFunction<typeof managers.getWorld>).mockResolvedValue(mockWorld);
      (managers.listAgents as jest.MockedFunction<typeof managers.listAgents>).mockResolvedValue(mockAgents);
      (managers.getAgent as jest.MockedFunction<typeof managers.getAgent>).mockResolvedValue(mockAgents[0]);
      (managers.listChats as jest.MockedFunction<typeof managers.listChats>).mockResolvedValue([]);
      (storageFactory.createStorageWithWrappers as jest.MockedFunction<typeof storageFactory.createStorageWithWrappers>).mockResolvedValue(mockStorage as any);

      const result = await exportWorldToMarkdown('test-world');

      expect(result).toContain('### Agent Without Memory');
      expect(result).toContain('**Memory:** No messages');
    });

    it('should handle chat messages fallback from agent memories', async () => {
      const mockWorld = {
        id: 'test-world',
        name: 'Test World',
        turnLimit: 5,
        currentChatId: 'chat-1',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        lastUpdated: new Date('2025-01-02T00:00:00.000Z'),
        totalAgents: 1,
        totalMessages: 2,
        eventEmitter: new EventEmitter(),
        agents: new Map(),
        chats: new Map(),
      };

      const mockAgents = [
        {
          id: 'agent-1',
          name: 'Test Agent',
          type: 'assistant',
          provider: LLMProvider.OPENAI,
          model: 'gpt-4',
          llmCallCount: 2,
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
          lastActive: new Date('2025-01-01T12:00:00.000Z'),
          memory: [
            {
              role: 'user' as const,
              sender: 'human',
              content: 'Memory message 1',
              createdAt: new Date('2025-01-01T10:00:00.000Z'),
              chatId: 'chat-1',
            },
            {
              role: 'assistant' as const,
              sender: 'agent-1',
              content: 'Memory message 2',
              createdAt: new Date('2025-01-01T10:01:00.000Z'),
              chatId: 'chat-1',
            },
          ],
        },
      ];

      const mockChats = [
        {
          id: 'chat-1',
          worldId: 'test-world',
          name: 'Test Chat',
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
          updatedAt: new Date('2025-01-01T12:00:00.000Z'),
          messageCount: 2,
        },
      ];

      // Mock storage that returns null for loadWorldChatFull (triggering fallback)
      const mockStorage = {
        loadWorldChatFull: jest.fn(),
      } as any;
      mockStorage.loadWorldChatFull.mockResolvedValue(null);

      (managers.getWorld as jest.MockedFunction<typeof managers.getWorld>).mockResolvedValue(mockWorld);
      (managers.listAgents as jest.MockedFunction<typeof managers.listAgents>).mockResolvedValue(mockAgents);
      (managers.getAgent as jest.MockedFunction<typeof managers.getAgent>).mockResolvedValue(mockAgents[0]);
      (managers.listChats as jest.MockedFunction<typeof managers.listChats>).mockResolvedValue(mockChats);
      (storageFactory.createStorageWithWrappers as jest.MockedFunction<typeof storageFactory.createStorageWithWrappers>).mockResolvedValue(mockStorage as any);

      const result = await exportWorldToMarkdown('test-world');

      expect(result).toContain('### Test Chat');
      expect(result).toContain('**Messages (2 from agent memories):**');
      expect(result).toContain('Memory message 1');
      expect(result).toContain('Memory message 2');
    });
  });
});
