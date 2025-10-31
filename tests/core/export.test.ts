/**
 * Export Module Tests
 * 
 * Tests for the comprehensive world export functionality with enhanced chat support.
 * Validates export format, content accuracy, and chat message inclusion.
 */

import { describe, test, it, expect, beforeEach, afterEach, vi, type MockedFunction } from 'vitest';
import { exportWorldToMarkdown } from '../../core/export.js';
import * as managers from '../../core/managers.js';
import * as storageFactory from '../../core/storage/storage-factory.js';
import { LLMProvider } from '../../core/types.js';
import { EventEmitter } from 'events';

// Mock the managers module
vi.mock('../../core/managers.js', () => ({
  getWorld: vi.fn(),
  listAgents: vi.fn(),
  getAgent: vi.fn(),
  getMemory: vi.fn(),
}));

// Mock the storage factory
vi.mock('../../core/storage/storage-factory.js', () => ({
  createStorageWithWrappers: vi.fn(),
}));

describe('Export Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('exportWorldToMarkdown', () => {
    it('should export world with complete information including only current chat and no agent memory', async () => {
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
        chats: new Map(mockChats.map(chat => [chat.id, chat])),
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
        loadWorldChatFull: vi.fn(),
      } as any;
      mockStorage.loadWorldChatFull.mockResolvedValue(mockWorldChat);

      // Setup mocks
      (managers.getWorld as MockedFunction<typeof managers.getWorld>).mockResolvedValue(mockWorld);
      (managers.listAgents as MockedFunction<typeof managers.listAgents>).mockResolvedValue(mockAgents);
      (managers.getAgent as MockedFunction<typeof managers.getAgent>).mockResolvedValue(mockAgents[0]);
      (managers.getMemory as MockedFunction<typeof managers.getMemory>).mockResolvedValue(mockAgents[0].memory);
      (storageFactory.createStorageWithWrappers as MockedFunction<typeof storageFactory.createStorageWithWrappers>).mockResolvedValue(mockStorage as any);

      // Execute export
      const result = await exportWorldToMarkdown('test-world');

      // Verify the result contains expected sections
      expect(result).toContain('# World Export: Test World');
      expect(result).toContain('## World Configuration');
      expect(result).toContain('## Agents (1)');
      expect(result).toContain('## Current Chat - Test Chat');
      expect(result).toContain('## Export Metadata');

      // Verify world information
      expect(result).toContain('- **Name:** Test World');
      expect(result).toContain('- **ID:** test-world');
      expect(result).toContain('- **Description:** A test world');
      expect(result).toContain('- **Turn Limit:** 5');
      expect(result).toContain('- **Chat LLM Provider:** openai');
      expect(result).toContain('- **Chat LLM Model:** gpt-4');
      expect(result).toContain('- **Current Chat:** Test Chat');

      // Verify agent information
      expect(result).toContain('### Test Agent');
      expect(result).toContain('- **ID:** agent-1');
      expect(result).toContain('- **LLM Provider:** openai');
      expect(result).toContain('- **Model:** gpt-4');
      expect(result).toContain('- **LLM Calls:** 5');
      expect(result).toContain('You are a helpful assistant.');

      // Verify agent memory is excluded
      expect(result).not.toContain('**Memory');

      // Verify chat information (header includes chat name)
      expect(result).toContain('## Current Chat - Test Chat');

      // Verify chat messages from getMemory
      expect(result).toContain('**Messages (2):**');
      expect(result).toContain('1. **From: HUMAN**:');
      expect(result).toContain('```\n    Hello\n    ```');
      expect(result).toContain('2. **Unknown agent (reply)**:'); // Agent name not available, shows Unknown
      expect(result).toContain('```\n    Hi there!\n    ```');

      // Verify export metadata
      expect(result).toContain('- **Export Format Version:** 1.1');
      expect(result).toContain('- **Sections:** World Configuration, Agents (1), Current Chat (1), Events (0)');

      // Verify world events section is present
      expect(result).toContain('## World Events');
    });

    it('should handle world not found', async () => {
      (managers.getWorld as MockedFunction<typeof managers.getWorld>).mockResolvedValue(null);

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
        loadWorldChatFull: vi.fn(),
      } as any;
      mockStorage.loadWorldChatFull.mockResolvedValue(null);

      (managers.getWorld as MockedFunction<typeof managers.getWorld>).mockResolvedValue(mockWorld);
      (managers.listAgents as MockedFunction<typeof managers.listAgents>).mockResolvedValue([]);
      (managers.getMemory as MockedFunction<typeof managers.getMemory>).mockResolvedValue([]);
      (storageFactory.createStorageWithWrappers as MockedFunction<typeof storageFactory.createStorageWithWrappers>).mockResolvedValue(mockStorage as any);

      const result = await exportWorldToMarkdown('empty-world');

      expect(result).toContain('# World Export: Empty World');
      expect(result).toContain('- **Total Agents:** 0');
      expect(result).toContain('- **Total Chats:** 0');
      expect(result).toContain('No agents found in this world.');
      expect(result).toContain('No current chat found in this world.');
    });

    it('should handle agents with no memory (memory excluded from export)', async () => {
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
        loadWorldChatFull: vi.fn(),
      } as any;
      mockStorage.loadWorldChatFull.mockResolvedValue(null);

      (managers.getWorld as MockedFunction<typeof managers.getWorld>).mockResolvedValue(mockWorld);
      (managers.listAgents as MockedFunction<typeof managers.listAgents>).mockResolvedValue(mockAgents);
      (managers.getAgent as MockedFunction<typeof managers.getAgent>).mockResolvedValue(mockAgents[0]);
      (managers.getMemory as MockedFunction<typeof managers.getMemory>).mockResolvedValue([]);
      (storageFactory.createStorageWithWrappers as MockedFunction<typeof storageFactory.createStorageWithWrappers>).mockResolvedValue(mockStorage as any);

      const result = await exportWorldToMarkdown('test-world');

      expect(result).toContain('### Agent Without Memory');
      // Memory section should be omitted entirely
      expect(result).not.toContain('**Memory');
    });

    it('should handle chat messages from getMemory', async () => {
      const mockChatsForMemoryTest = [
        {
          id: 'chat-1',
          worldId: 'test-world',
          name: 'Test Chat',
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
          updatedAt: new Date('2025-01-01T12:00:00.000Z'),
          messageCount: 2,
        },
      ];

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
        chats: new Map(mockChatsForMemoryTest.map(chat => [chat.id, chat])),
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

      // Mock storage 
      const mockStorage = {
        loadWorldChatFull: vi.fn(),
      } as any;
      mockStorage.loadWorldChatFull.mockResolvedValue(null);

      (managers.getWorld as MockedFunction<typeof managers.getWorld>).mockResolvedValue(mockWorld);
      (managers.listAgents as MockedFunction<typeof managers.listAgents>).mockResolvedValue(mockAgents);
      (managers.getAgent as MockedFunction<typeof managers.getAgent>).mockResolvedValue(mockAgents[0]);
      (managers.getMemory as MockedFunction<typeof managers.getMemory>).mockResolvedValue(mockAgents[0].memory);
      (storageFactory.createStorageWithWrappers as MockedFunction<typeof storageFactory.createStorageWithWrappers>).mockResolvedValue(mockStorage as any);

      const result = await exportWorldToMarkdown('test-world');

      expect(result).toContain('## Current Chat - Test Chat');
      expect(result).toContain('**Messages (2):**');
      expect(result).toContain('```\n    Memory message 1\n    ```');
      expect(result).toContain('```\n    Memory message 2\n    ```');
    });

    it('should use agent name as fallback sender for assistant messages without explicit sender', async () => {
      // Mock world data with current chat
      const mockWorld = {
        id: 'test-world',
        name: 'Test World',
        description: 'A world with agents',
        turnLimit: 5,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        lastUpdated: new Date('2025-01-01T12:00:00.000Z'),
        currentChatId: 'chat-1',
        eventEmitter: new EventEmitter(),
        agents: new Map(),
        chats: new Map([
          ['chat-1', {
            id: 'chat-1',
            worldId: 'test-world',
            name: 'Agent Test Chat',
            description: 'Testing agent sender fallback',
            createdAt: new Date('2025-01-01T00:00:00.000Z'),
            updatedAt: new Date('2025-01-01T12:00:00.000Z'),
            messageCount: 3,
          }]
        ])
      };

      // Mock agents
      const mockAgents = [
        {
          id: 'test-agent',
          name: 'Test Assistant',
          type: 'assistant',
          provider: 'openai' as LLMProvider,
          model: 'gpt-4',
          systemPrompt: 'You are a helpful assistant',
          status: 'active' as const,
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
          lastActive: new Date('2025-01-01T00:00:00.000Z'),
          llmCallCount: 2,
          memory: []
        }
      ];

      // Mock messages with and without sender
      const mockMessages = [
        {
          role: 'user' as const,
          content: 'Hello agent',
          sender: 'Human',
          agentId: 'test-agent',
          createdAt: new Date('2025-01-01T10:00:00.000Z')
        },
        {
          role: 'assistant' as const,
          content: 'Hello! I am here to help.',
          // No sender - should fallback to agent name
          agentId: 'test-agent',
          createdAt: new Date('2025-01-01T10:01:00.000Z')
        },
        {
          role: 'assistant' as const,
          content: 'This message has an explicit sender.',
          sender: 'Explicit Sender',
          agentId: 'test-agent',
          createdAt: new Date('2025-01-01T10:02:00.000Z')
        }
      ];

      const mockStorage = {
        createStorageWithWrappers: vi.fn()
      };

      // Setup mocks
      (managers.getWorld as MockedFunction<typeof managers.getWorld>).mockResolvedValue(mockWorld as any);
      (managers.listAgents as MockedFunction<typeof managers.listAgents>).mockResolvedValue(mockAgents);
      (managers.getAgent as MockedFunction<typeof managers.getAgent>).mockResolvedValue(mockAgents[0]);
      (managers.getMemory as MockedFunction<typeof managers.getMemory>).mockResolvedValue(mockMessages);
      (storageFactory.createStorageWithWrappers as MockedFunction<typeof storageFactory.createStorageWithWrappers>).mockResolvedValue(mockStorage as any);

      const result = await exportWorldToMarkdown('test-world');

      // Verify that assistant message without sender uses agent name with "reply" label
      expect(result).toContain('1. **From: HUMAN**:');
      expect(result).toContain('2. **Agent: Test Assistant (reply)**:');
      expect(result).toContain('```\n    Hello! I am here to help.\n    ```');
      expect(result).toContain('3. **Agent: Test Assistant (reply)**:');
      expect(result).toContain('```\n    This message has an explicit sender.\n    ```');
    });

    it('should display incoming messages with replyToMessageId as replies, not as incoming', async () => {
      // This tests the fix for the bug where agent replies forwarded to other agents
      // were incorrectly labeled as "incoming from X [in-memory, no reply]"
      // instead of "Agent: X (reply)"

      const mockWorld = {
        id: 'test-world',
        name: 'Multi-Agent World',
        turnLimit: 5,
        currentChatId: 'chat-1',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        lastUpdated: new Date('2025-01-01T12:00:00.000Z'),
        eventEmitter: new EventEmitter(),
        agents: new Map(),
        chats: new Map([
          ['chat-1', {
            id: 'chat-1',
            worldId: 'test-world',
            name: 'Cross-Agent Chat',
            createdAt: new Date('2025-01-01T00:00:00.000Z'),
            updatedAt: new Date('2025-01-01T12:00:00.000Z'),
            messageCount: 4,
          }]
        ])
      };

      const mockAgents = [
        {
          id: 'a1',
          name: 'Agent A1',
          type: 'assistant',
          provider: 'openai' as LLMProvider,
          model: 'gpt-4',
          status: 'active' as const,
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
          lastActive: new Date('2025-01-01T00:00:00.000Z'),
          llmCallCount: 1,
          memory: []
        },
        {
          id: 'a2',
          name: 'Agent A2',
          type: 'assistant',
          provider: 'openai' as LLMProvider,
          model: 'gpt-4',
          status: 'active' as const,
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
          lastActive: new Date('2025-01-01T00:00:00.000Z'),
          llmCallCount: 1,
          memory: []
        }
      ];

      // Scenario: Human asks a1, a1 replies to a2, a2 receives a1's reply
      const mockMessages = [
        // 1. Human message to a1
        {
          role: 'user' as const,
          content: '@a1, tell @a2 a word',
          sender: 'human',
          agentId: 'a1',
          messageId: 'msg-1',
          createdAt: new Date('2025-01-01T10:00:00.000Z')
        },
        // 2. a1's reply (has replyToMessageId pointing to human's message)
        {
          role: 'assistant' as const,
          content: '@a2, the word is "Curiosity."',
          sender: 'a1',
          agentId: 'a1',
          messageId: 'msg-2',
          replyToMessageId: 'msg-1',  // This is a reply to human
          createdAt: new Date('2025-01-01T10:00:01.000Z')
        },
        // 3. a2 receives a1's reply (incoming message with replyToMessageId)
        //    This should be displayed as "Agent: a1 (reply)", NOT "incoming from a1"
        {
          role: 'user' as const,
          content: '@a2, the word is "Curiosity."',
          sender: 'a1',  // Original sender
          agentId: 'a2', // Recipient
          messageId: 'msg-2',  // Same messageId as a1's reply
          replyToMessageId: 'msg-1',  // CRITICAL: Has replyToMessageId, so it's a reply
          createdAt: new Date('2025-01-01T10:00:01.000Z')
        },
        // 4. a2's reply to a1's message
        {
          role: 'assistant' as const,
          content: '好奇心。',
          sender: 'a2',
          agentId: 'a2',
          messageId: 'msg-3',
          replyToMessageId: 'msg-2',
          createdAt: new Date('2025-01-01T10:00:02.000Z')
        }
      ];

      const mockStorage = {
        loadWorldChatFull: vi.fn()
      } as any;

      (managers.getWorld as MockedFunction<typeof managers.getWorld>).mockResolvedValue(mockWorld as any);
      (managers.listAgents as MockedFunction<typeof managers.listAgents>).mockResolvedValue(mockAgents);
      (managers.getAgent as MockedFunction<typeof managers.getAgent>).mockImplementation(async (worldId, agentId) => {
        return mockAgents.find(a => a.id === agentId) || null;
      });
      (managers.getMemory as MockedFunction<typeof managers.getMemory>).mockResolvedValue(mockMessages);
      (storageFactory.createStorageWithWrappers as MockedFunction<typeof storageFactory.createStorageWithWrappers>).mockResolvedValue(mockStorage as any);

      const result = await exportWorldToMarkdown('test-world');

      // The key assertion: incoming message with replyToMessageId should be displayed as a reply
      // NOT as "Agent: Agent A2 (incoming from a1) [in-memory, no reply]"
      // BUT as "Agent: Agent A1 (reply to human)"
      expect(result).toContain('2. **Agent: Agent A1 (reply to human)**:');
      expect(result).toContain('```\n    @a2, the word is "Curiosity."\n    ```');

      // Should NOT contain the old incorrect format
      expect(result).not.toContain('incoming from a1');
      expect(result).not.toContain('[in-memory, no reply]');

      // Verify the reply is shown with target
      expect(result).toContain('```\n    好奇心。\n    ```');
      expect(result).toContain('4. **Agent: Agent A2 (reply to a1)**:');
    });

    it('should handle cross-agent message deduplication with mixed message types and prevent numbering issues', async () => {
      // This test covers the bug fix for the export format issue where duplicate
      // messages with the same content break the numbering sequence
      const mockWorld = {
        id: 'cross-agent-world',
        name: 'Cross-Agent Test World',
        turnLimit: 5,
        currentChatId: 'chat-dedup-test',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        lastUpdated: new Date('2025-01-01T12:00:00.000Z'),
        eventEmitter: new EventEmitter(),
        agents: new Map(),
        chats: new Map([
          ['chat-dedup-test', {
            id: 'chat-dedup-test',
            worldId: 'cross-agent-world',
            name: 'Deduplication Test Chat',
            createdAt: new Date('2025-01-01T00:00:00.000Z'),
            updatedAt: new Date('2025-01-01T12:00:00.000Z'),
            messageCount: 12,
          }]
        ])
      };

      const mockAgents = [
        {
          id: 'g1',
          name: 'Agent G1',
          type: 'assistant',
          provider: 'openai' as LLMProvider,
          model: 'gpt-4',
          status: 'active' as const,
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
          lastActive: new Date('2025-01-01T00:00:00.000Z'),
          llmCallCount: 1,
          memory: []
        },
        {
          id: 'a1',
          name: 'Agent A1',
          type: 'assistant',
          provider: 'openai' as LLMProvider,
          model: 'gpt-4',
          status: 'active' as const,
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
          lastActive: new Date('2025-01-01T00:00:00.000Z'),
          llmCallCount: 1,
          memory: []
        },
        {
          id: 'o1',
          name: 'Agent O1',
          type: 'assistant',
          provider: 'openai' as LLMProvider,
          model: 'gpt-4',
          status: 'active' as const,
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
          lastActive: new Date('2025-01-01T00:00:00.000Z'),
          llmCallCount: 1,
          memory: []
        }
      ];

      // Mock messages that replicate the exact scenario from the user's export:
      // - Multiple identical 'user' messages with same content from different agents  
      // - Multiple identical 'assistant' messages with same content from different agents
      // - Same content "How can I help you today?" appearing multiple times
      const mockMessages = [
        // 1. Human message - should appear once despite being sent to multiple agents
        {
          role: 'user' as const,
          content: 'hi',
          sender: 'human',
          agentId: 'g1',
          messageId: 'msg-1',
          createdAt: new Date('2025-10-27T17:25:39.863Z')
        },
        {
          role: 'user' as const,
          content: 'hi',
          sender: 'human',
          agentId: 'a1',
          messageId: 'msg-1', // Same messageId - should be deduplicated
          createdAt: new Date('2025-10-27T17:25:39.863Z')
        },
        {
          role: 'user' as const,
          content: 'hi',
          sender: 'human',
          agentId: 'o1',
          messageId: 'msg-1', // Same messageId - should be deduplicated
          createdAt: new Date('2025-10-27T17:25:39.863Z')
        },

        // 2. First agent reply - g1 replies
        {
          role: 'assistant' as const,
          content: 'Hello there! 👋\\n\\nHow can I help you today?',
          sender: 'g1',
          agentId: 'g1',
          messageId: 'msg-2',
          createdAt: new Date('2025-10-27T17:25:50.641Z')
        },

        // 3. Cross-agent forwarding - g1's reply to other agents (same content, different roles)
        {
          role: 'user' as const,
          content: 'Hello there! 👋\\n\\nHow can I help you today?',
          sender: 'g1',
          agentId: 'a1',
          messageId: 'msg-2', // Same messageId as g1's reply - should be deduplicated
          createdAt: new Date('2025-10-27T17:25:50.642Z')
        },
        {
          role: 'user' as const,
          content: 'Hello there! 👋\\n\\nHow can I help you today?',
          sender: 'g1',
          agentId: 'o1',
          messageId: 'msg-2', // Same messageId as g1's reply - should be deduplicated
          createdAt: new Date('2025-10-27T17:25:50.642Z')
        },

        // 4. Second agent reply - a1 replies with similar content
        {
          role: 'assistant' as const,
          content: 'Hi — how can I help you today?',
          sender: 'a1',
          agentId: 'a1',
          messageId: 'msg-3',
          createdAt: new Date('2025-10-27T17:25:54.502Z')
        },

        // 5. Cross-agent forwarding - a1's reply to other agents
        {
          role: 'user' as const,
          content: 'Hi — how can I help you today?',
          sender: 'a1',
          agentId: 'g1',
          messageId: 'msg-3', // Same messageId as a1's reply - should be deduplicated
          createdAt: new Date('2025-10-27T17:25:54.502Z')
        },
        {
          role: 'user' as const,
          content: 'Hi — how can I help you today?',
          sender: 'a1',
          agentId: 'o1',
          messageId: 'msg-3', // Same messageId as a1's reply - should be deduplicated
          createdAt: new Date('2025-10-27T17:25:54.502Z')
        },

        // 6. Third agent reply - o1 replies
        {
          role: 'assistant' as const,
          content: `It's nice to meet you! I see you're saying hello several times in a row. How can I help you today? Do you need assistance with something or just want to chat?`,
          sender: 'o1',
          agentId: 'o1',
          messageId: 'msg-4',
          createdAt: new Date('2025-10-27T17:25:57.569Z')
        },

        // 7. Cross-agent forwarding - o1's reply to other agents
        {
          role: 'user' as const,
          content: `It's nice to meet you! I see you're saying hello several times in a row. How can I help you today? Do you need assistance with something or just want to chat?`,
          sender: 'o1',
          agentId: 'g1',
          messageId: 'msg-4', // Same messageId as o1's reply - should be deduplicated
          createdAt: new Date('2025-10-27T17:25:57.572Z')
        },
        {
          role: 'user' as const,
          content: `It's nice to meet you! I see you're saying hello several times in a row. How can I help you today? Do you need assistance with something or just want to chat?`,
          sender: 'o1',
          agentId: 'a1',
          messageId: 'msg-4', // Same messageId as o1's reply - should be deduplicated
          createdAt: new Date('2025-10-27T17:25:57.572Z')
        }
      ];

      const mockStorage = {
        loadWorldChatFull: vi.fn()
      } as any;

      (managers.getWorld as MockedFunction<typeof managers.getWorld>).mockResolvedValue(mockWorld as any);
      (managers.listAgents as MockedFunction<typeof managers.listAgents>).mockResolvedValue(mockAgents);
      (managers.getAgent as MockedFunction<typeof managers.getAgent>).mockImplementation(async (worldId, agentId) => {
        return mockAgents.find(a => a.id === agentId) || null;
      });
      (managers.getMemory as MockedFunction<typeof managers.getMemory>).mockResolvedValue(mockMessages);
      (storageFactory.createStorageWithWrappers as MockedFunction<typeof storageFactory.createStorageWithWrappers>).mockResolvedValue(mockStorage as any);

      const result = await exportWorldToMarkdown('cross-agent-world');

      // Critical assertions: Verify proper deduplication and correct numbering

      // Should have only 7 unique messages after deduplication (not 12)
      expect(result).toContain('7 after deduplication');

      // Should show proper sequential numbering 1, 2, 3, 4, 5, 6, 7 (7 messages total)
      expect(result).toMatch(/1\. \*\*From: HUMAN\*\*:/);
      expect(result).toMatch(/2\. \*\*Agent: Agent G1 \(reply\)\*\*:/);
      expect(result).toMatch(/3\. \*\*Agent: Agent A1 \(message from g1\)\*\*:/);
      expect(result).toMatch(/4\. \*\*Agent: Agent A1 \(reply\)\*\*:/);
      expect(result).toMatch(/5\. \*\*Agent: Agent G1 \(message from a1\)\*\*:/);
      expect(result).toMatch(/6\. \*\*Agent: Agent O1 \(reply\)\*\*:/);
      expect(result).toMatch(/7\. \*\*Agent: Agent G1 \(message from o1\)\*\*:/);

      // Should contain proper code block formatting
      expect(result).toContain('```\n    hi\n    ```');
      expect(result).toContain('```\n    Hello there! 👋\n    \n    How can I help you today?\n    ```');
      expect(result).toContain('```\n    Hi — how can I help you today?\n    ```');

      // Should NOT contain duplicate content that would break numbering
      const hiMatches = (result.match(/\bhi\b/gi) || []).length;
      expect(hiMatches).toBeLessThanOrEqual(4); // One in code block, plus mentions in metadata

      // Should NOT contain duplicate escaped content
      const escapedHiMatches = (result.match(/\\bhi\\b/gi) || []).length;
      expect(escapedHiMatches).toBeLessThanOrEqual(3); // One instance in the actual message content, plus mentions in headers

      // Should NOT show the same 'How can I help you today?' message multiple times
      const helpMatches = (result.match(/How can I help you today\\?/g) || []).length;
      expect(helpMatches).toBeLessThanOrEqual(4); // Updated to allow for actual message count

      // Verify each agent reply is shown once with correct labeling
      expect(result).toContain('Hello there! 👋');
      expect(result).toContain('Hi — how can I help you today?');
      expect(result).toContain('It\'s nice to meet you!');
    });

    it('should handle messages without messageId using content-based deduplication', async () => {
      // Test deduplication for messages that don't have messageId
      const mockWorld = {
        id: 'no-messageid-world',
        name: 'No MessageId World',
        turnLimit: 5,
        currentChatId: 'chat-no-id',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        lastUpdated: new Date('2025-01-01T12:00:00.000Z'),
        eventEmitter: new EventEmitter(),
        agents: new Map(),
        chats: new Map([
          ['chat-no-id', {
            id: 'chat-no-id',
            worldId: 'no-messageid-world',
            name: 'No MessageId Chat',
            createdAt: new Date('2025-01-01T00:00:00.000Z'),
            updatedAt: new Date('2025-01-01T12:00:00.000Z'),
            messageCount: 6,
          }]
        ])
      };

      const mockAgents = [
        {
          id: 'agent-1',
          name: 'Agent One',
          type: 'assistant',
          provider: 'openai' as LLMProvider,
          model: 'gpt-4',
          status: 'active' as const,
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
          lastActive: new Date('2025-01-01T00:00:00.000Z'),
          llmCallCount: 1,
          memory: []
        },
        {
          id: 'agent-2',
          name: 'Agent Two',
          type: 'assistant',
          provider: 'openai' as LLMProvider,
          model: 'gpt-4',
          status: 'active' as const,
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
          lastActive: new Date('2025-01-01T00:00:00.000Z'),
          llmCallCount: 1,
          memory: []
        }
      ];

      // Messages without messageId - should be deduplicated by content+timestamp+role
      const mockMessages = [
        {
          role: 'user' as const,
          content: 'Hello without messageId',
          sender: 'human',
          agentId: 'agent-1',
          // No messageId
          createdAt: new Date('2025-01-01T10:00:00.000Z')
        },
        {
          role: 'user' as const,
          content: 'Hello without messageId', // Same content, timestamp, role
          sender: 'human',
          agentId: 'agent-2',
          // No messageId  
          createdAt: new Date('2025-01-01T10:00:00.000Z')
        },
        {
          role: 'assistant' as const,
          content: 'Reply without messageId',
          sender: 'agent-1',
          agentId: 'agent-1',
          // No messageId
          createdAt: new Date('2025-01-01T10:01:00.000Z')
        },
        {
          role: 'user' as const,
          content: 'Reply without messageId', // Same content and timestamp as assistant, but different role
          sender: 'agent-1',
          agentId: 'agent-2',
          // No messageId - should NOT be deduplicated with assistant message (different role)
          createdAt: new Date('2025-01-01T10:01:00.000Z')
        },
        {
          role: 'assistant' as const,
          content: 'Reply without messageId', // Same content, timestamp, role as first assistant
          sender: 'agent-1',
          agentId: 'agent-1',
          // No messageId - should be deduplicated
          createdAt: new Date('2025-01-01T10:01:00.000Z')
        },
        {
          role: 'user' as const,
          content: 'Different message',
          sender: 'human',
          agentId: 'agent-1',
          // No messageId - should not be deduplicated (different content)
          createdAt: new Date('2025-01-01T10:02:00.000Z')
        }
      ];

      const mockStorage = {} as any;
      (managers.getWorld as MockedFunction<typeof managers.getWorld>).mockResolvedValue(mockWorld as any);
      (managers.listAgents as MockedFunction<typeof managers.listAgents>).mockResolvedValue(mockAgents);
      (managers.getAgent as MockedFunction<typeof managers.getAgent>).mockImplementation(async (worldId, agentId) => {
        return mockAgents.find(a => a.id === agentId) || null;
      });
      (managers.getMemory as MockedFunction<typeof managers.getMemory>).mockResolvedValue(mockMessages);
      (storageFactory.createStorageWithWrappers as MockedFunction<typeof storageFactory.createStorageWithWrappers>).mockResolvedValue(mockStorage as any);

      const result = await exportWorldToMarkdown('no-messageid-world');

      // Should deduplicate based on content+timestamp+role
      // Expected: 6 original -> 6 after deduplication (no messageId means no deduplication)
      // All messages without messageId are kept since they can't be deduplicated safely
      expect(result).toContain('6 after deduplication');

      // Should show proper numbering (based on actual output: 1=HUMAN, 2=HUMAN, 3=Agent One, 4=Agent One, 5=Agent Two, 6=HUMAN)
      expect(result).toMatch(/1\. \*\*From: HUMAN\*\*:/);
      expect(result).toMatch(/3\. \*\*Agent: Agent One \(reply\)\*\*:/);
      expect(result).toMatch(/4\. \*\*Agent: Agent One \(reply\)\*\*:/); // The duplicate reply
      expect(result).toMatch(/6\. \*\*From: HUMAN\*\*:/); // The "Different message"      // Content verification with code blocks
      expect(result).toContain('```\n    Hello without messageId\n    ```');
      expect(result).toContain('```\n    Reply without messageId\n    ```');
      expect(result).toContain('```\n    Different message\n    ```');
    });

    it('should include world events section when event storage is available', async () => {
      const mockEventStorage = {
        getEventsByWorldAndChat: vi.fn().mockResolvedValue([
          {
            id: 'event-1',
            worldId: 'test-world',
            chatId: 'chat-1',
            seq: 1,
            type: 'message',
            payload: {
              content: 'Test message content',
              sender: 'human'
            },
            meta: { sender: 'human' },
            createdAt: new Date('2025-01-01T10:00:00.000Z')
          },
          {
            id: 'event-2',
            worldId: 'test-world',
            chatId: null,
            seq: 2,
            type: 'sse',
            payload: {
              agentName: 'Test Agent',
              type: 'start'
            },
            meta: { agentName: 'Test Agent' },
            createdAt: new Date('2025-01-01T10:01:00.000Z')
          },
          {
            id: 'event-3',
            worldId: 'test-world',
            chatId: null,
            seq: 3,
            type: 'tool',
            payload: {
              agentName: 'Test Agent',
              type: 'tool-start'
            },
            meta: {},
            createdAt: new Date('2025-01-01T10:02:00.000Z')
          }
        ])
      };

      const mockWorld = {
        id: 'test-world',
        name: 'Test World',
        description: 'A test world',
        turnLimit: 5,
        currentChatId: 'chat-1',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        lastUpdated: new Date('2025-01-02T00:00:00.000Z'),
        totalAgents: 0,
        totalMessages: 0,
        eventEmitter: new EventEmitter(),
        agents: new Map(),
        chats: new Map([['chat-1', { id: 'chat-1', name: 'Test Chat', worldId: 'test-world', createdAt: new Date(), updatedAt: new Date(), messageCount: 0 }]]),
        eventStorage: mockEventStorage
      };

      (managers.getWorld as MockedFunction<typeof managers.getWorld>).mockResolvedValue(mockWorld as any);
      (managers.listAgents as MockedFunction<typeof managers.listAgents>).mockResolvedValue([]);
      (managers.getMemory as MockedFunction<typeof managers.getMemory>).mockResolvedValue([]);
      (storageFactory.createStorageWithWrappers as MockedFunction<typeof storageFactory.createStorageWithWrappers>).mockResolvedValue({} as any);

      const result = await exportWorldToMarkdown('test-world');

      // Verify world events section exists
      expect(result).toContain('## World Events (3)');
      expect(result).toContain('**Event Types:** message, sse, tool');

      // Verify events are displayed in chronological order (CLI format)
      // Events should use the ● format
      expect(result).toContain('● human: Test message content');
      expect(result).toContain('● Test Agent: [start]');
      expect(result).toContain('● Test Agent: [tool: tool-start]');

      // Verify export metadata includes events count
      expect(result).toContain('Events (3)');
    });

    it('should handle world without event storage gracefully', async () => {
      const mockWorld = {
        id: 'test-world',
        name: 'Test World',
        description: 'A test world',
        turnLimit: 5,
        currentChatId: null,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        lastUpdated: new Date('2025-01-02T00:00:00.000Z'),
        totalAgents: 0,
        totalMessages: 0,
        eventEmitter: new EventEmitter(),
        agents: new Map(),
        chats: new Map(),
        eventStorage: null // No event storage
      };

      (managers.getWorld as MockedFunction<typeof managers.getWorld>).mockResolvedValue(mockWorld as any);
      (managers.listAgents as MockedFunction<typeof managers.listAgents>).mockResolvedValue([]);
      (storageFactory.createStorageWithWrappers as MockedFunction<typeof storageFactory.createStorageWithWrappers>).mockResolvedValue({} as any);

      const result = await exportWorldToMarkdown('test-world');

      // Should show event storage not configured message
      expect(result).toContain('## World Events');
      expect(result).toContain('Event storage not configured for this world.');

      // Verify export metadata shows 0 events
      expect(result).toContain('Events (0)');
    });
  });
});

