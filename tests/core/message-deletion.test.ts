/**
 * Unit Tests for Message Deletion Feature
 * 
 * Tests the removeMessagesFrom function which handles deletion of user messages
 * and all subsequent messages in a chat conversation.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Agent, AgentMessage, World } from '../../core/types.js';
import { LLMProvider } from '../../core/types.js';

// Initialize mock storage API before jest.mock
const mockStorageAPI: any = {
  getMemory: jest.fn(),
  loadAgent: jest.fn(),
  saveAgentMemory: jest.fn(),
  worldExists: jest.fn(),
  loadWorld: jest.fn(),
  saveWorld: jest.fn(),
  deleteWorld: jest.fn(),
  listWorlds: jest.fn(),
  saveAgent: jest.fn(),
  loadAgentsList: jest.fn(),
  listAgents: jest.fn(),
  deleteAgent: jest.fn(),
  listChats: jest.fn(),
  saveChat: jest.fn(),
  loadChat: jest.fn(),
  deleteChat: jest.fn()
};

// Mock storage factory
// TypeScript limitation: mockStorageAPI must be defined before jest.mock, but TypeScript
// can't see it at compile time. This is a known pattern for Jest ESM mocks.
jest.mock('../../core/storage/storage-factory.js', () => ({
  // @ts-expect-error - mockStorageAPI is defined before jest.mock but TS doesn't see it in factory scope
  createStorageWithWrappers: jest.fn().mockResolvedValue(mockStorageAPI),
  getDefaultRootPath: jest.fn().mockReturnValue('/test/data')
}));

// Import after mocks are set up
import { removeMessagesFrom } from '../../core/index.js';

// Helper to create a mock world
function createMockWorld(overrides: Partial<World> = {}): World {
  return {
    id: 'test-world',
    name: 'Test World',
    currentChatId: 'chat-1',
    totalAgents: 1,
    totalMessages: 0,
    turnLimit: 5,
    createdAt: new Date(),
    lastUpdated: new Date(),
    agents: new Map(),
    chats: new Map(),
    ...overrides
  } as World;
}

// Helper to create a mock agent
function createMockAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent-1',
    name: 'Test Agent',
    type: 'assistant',
    provider: LLMProvider.OPENAI,
    model: 'gpt-4',
    systemPrompt: 'Test',
    memory: [],
    llmCallCount: 0,
    createdAt: new Date(),
    lastActive: new Date(),
    ...overrides
  };
}

describe('Message Deletion Feature - Unit Tests', () => {
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup default return values for storage methods
    mockStorageAPI.listAgents.mockResolvedValue([]);
    mockStorageAPI.listChats.mockResolvedValue([{ id: 'default-chat', name: 'Chat' }]);
  });

  describe('Error Handling', () => {
    it('should throw error for non-existent world', async () => {
      mockStorageAPI.loadWorld.mockResolvedValue(null);

      await expect(
        removeMessagesFrom('nonexistent-world-xyz', 'msg-1', 'chat-1')
      ).rejects.toThrow(/not found/);
    });

    it('should validate world exists before attempting deletion', async () => {
      mockStorageAPI.loadWorld.mockResolvedValue(null);

      const result = removeMessagesFrom('invalid-world-id', 'msg-1', 'chat-1');
      await expect(result).rejects.toThrow();
    });
  });

  describe('RemovalResult Structure', () => {
    it('should return correct result structure with required fields', async () => {
      const mockMemory: AgentMessage[] = [
        { role: 'user', content: 'msg1', messageId: 'msg-1', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:00:00Z'), agentId: 'agent-1' },
        { role: 'assistant', content: 'msg2', messageId: 'msg-2', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:01:00Z'), agentId: 'agent-1' },
        { role: 'user', content: 'msg3', messageId: 'msg-3', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:02:00Z'), agentId: 'agent-1' }
      ];

      const mockAgent = createMockAgent({ memory: mockMemory });
      const mockWorld = createMockWorld({ totalMessages: 3 });

      mockStorageAPI.loadWorld.mockResolvedValue(mockWorld);
      mockStorageAPI.listAgents.mockResolvedValue([mockAgent]);
      mockStorageAPI.getMemory.mockResolvedValue(mockMemory);
      mockStorageAPI.loadAgent.mockResolvedValue(mockAgent);
      mockStorageAPI.saveAgentMemory.mockResolvedValue();

      const result = await removeMessagesFrom('test-world', 'msg-2', 'chat-1');

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('messageId', 'msg-2');
      expect(result).toHaveProperty('totalAgents', 1);
      expect(result).toHaveProperty('processedAgents');
      expect(result).toHaveProperty('failedAgents');
      expect(result).toHaveProperty('messagesRemovedTotal');
      expect(result).toHaveProperty('requiresRetry');
      expect(result).toHaveProperty('resubmissionStatus');
      expect(result.success).toBe(true);
      expect(result.processedAgents).toEqual(['agent-1']);
      expect(result.failedAgents).toHaveLength(0);
      expect(result.messagesRemovedTotal).toBe(2); // msg-2 and msg-3 removed
    });

    it('should include failure details when agents fail to process', async () => {
      const mockAgent = createMockAgent();
      const mockWorld = createMockWorld();

      mockStorageAPI.loadWorld.mockResolvedValue(mockWorld);
      mockStorageAPI.listAgents.mockResolvedValue([mockAgent]);
      mockStorageAPI.getMemory.mockResolvedValue([]);

      const result = await removeMessagesFrom('test-world', 'msg-1', 'chat-1');

      expect(result.success).toBe(false);
      expect(result.failedAgents).toHaveLength(1);
      expect(result.failedAgents[0]).toMatchObject({
        agentId: 'agent-1',
        error: expect.stringContaining('No messages found')
      });
      expect(result.requiresRetry).toBe(false);
    });
  });

  describe('Function Signature', () => {
    it('should accept worldId, messageId, and chatId parameters', () => {
      expect(typeof removeMessagesFrom).toBe('function');
      expect(removeMessagesFrom.length).toBe(3); // Takes 3 parameters
    });
  });

  describe('Timestamp-Based Removal Logic', () => {
    it('should remove messages based on timestamp comparison', async () => {
      const mockMemory: AgentMessage[] = [
        { role: 'user', content: 'msg1', messageId: 'msg-1', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:00:00Z'), agentId: 'agent-1' },
        { role: 'assistant', content: 'msg2', messageId: 'msg-2', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:01:00Z'), agentId: 'agent-1' },
        { role: 'user', content: 'msg3', messageId: 'msg-3', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:02:00Z'), agentId: 'agent-1' },
        { role: 'assistant', content: 'msg4', messageId: 'msg-4', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:03:00Z'), agentId: 'agent-1' },
        { role: 'user', content: 'msg5', messageId: 'msg-5', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:04:00Z'), agentId: 'agent-1' }
      ];

      const mockAgent = createMockAgent({ memory: mockMemory });
      const mockWorld = createMockWorld({ totalMessages: 5 });

      mockStorageAPI.loadWorld.mockResolvedValue(mockWorld);
      mockStorageAPI.listAgents.mockResolvedValue([mockAgent]);
      mockStorageAPI.getMemory.mockResolvedValue(mockMemory);
      mockStorageAPI.loadAgent.mockResolvedValue(mockAgent);
      mockStorageAPI.saveAgentMemory.mockResolvedValue();

      await removeMessagesFrom('test-world', 'msg-3', 'chat-1');

      // Should save memory with only messages before msg-3 (msg-1 and msg-2)
      const savedMemory = mockStorageAPI.saveAgentMemory.mock.calls[0][2];
      expect(savedMemory).toHaveLength(2);
      expect(savedMemory.find((m: AgentMessage) => m.messageId === 'msg-3')).toBeUndefined();
      expect(savedMemory.find((m: AgentMessage) => m.messageId === 'msg-4')).toBeUndefined();
      expect(savedMemory.find((m: AgentMessage) => m.messageId === 'msg-5')).toBeUndefined();
    });

    it('should handle messages without createdAt timestamps', async () => {
      const mockMemory: AgentMessage[] = [
        { role: 'user', content: 'msg1', messageId: 'msg-1', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:00:00Z'), agentId: 'agent-1' },
        { role: 'assistant', content: 'msg2', messageId: 'msg-2', chatId: 'chat-1', agentId: 'agent-1' } as AgentMessage // No createdAt
      ];

      const mockAgent = createMockAgent({ memory: mockMemory });
      const mockWorld = createMockWorld({ totalMessages: 2 });

      mockStorageAPI.loadWorld.mockResolvedValue(mockWorld);
      mockStorageAPI.listAgents.mockResolvedValue([mockAgent]);
      mockStorageAPI.getMemory.mockResolvedValue(mockMemory);
      mockStorageAPI.loadAgent.mockResolvedValue(mockAgent);
      mockStorageAPI.saveAgentMemory.mockResolvedValue();

      const result = await removeMessagesFrom('test-world', 'msg-1', 'chat-1');

      // Should not throw an error
      expect(result.success).toBe(true);
      expect(result.messagesRemovedTotal).toBeGreaterThanOrEqual(1);
    });

    it('should handle Date objects and ISO strings', async () => {
      const mockMemory: AgentMessage[] = [
        { role: 'user', content: 'msg1', messageId: 'msg-1', chatId: 'chat-1', createdAt: '2024-01-01T10:00:00Z' as any, agentId: 'agent-1' },
        { role: 'assistant', content: 'msg2', messageId: 'msg-2', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:01:00Z'), agentId: 'agent-1' }
      ];

      const mockAgent = createMockAgent({ memory: mockMemory });
      const mockWorld = createMockWorld({ totalMessages: 2 });

      mockStorageAPI.loadWorld.mockResolvedValue(mockWorld);
      mockStorageAPI.listAgents.mockResolvedValue([mockAgent]);
      mockStorageAPI.getMemory.mockResolvedValue(mockMemory);
      mockStorageAPI.loadAgent.mockResolvedValue(mockAgent);
      mockStorageAPI.saveAgentMemory.mockResolvedValue();

      const result = await removeMessagesFrom('test-world', 'msg-1', 'chat-1');

      // Should handle both formats correctly
      expect(result.success).toBe(true);
      expect(result.messagesRemovedTotal).toBe(2);
    });
  });

  describe('Chat Isolation Behavior', () => {
    it('should only affect messages in the specified chat', async () => {
      const mockMemory: AgentMessage[] = [
        // Chat-1 messages
        { role: 'user', content: 'chat1-msg1', messageId: 'msg-1', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:00:00Z'), agentId: 'agent-1' },
        { role: 'assistant', content: 'chat1-msg2', messageId: 'msg-2', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:01:00Z'), agentId: 'agent-1' },
        { role: 'user', content: 'chat1-msg3', messageId: 'msg-3', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:02:00Z'), agentId: 'agent-1' },
        // Chat-2 messages (should be preserved)
        { role: 'user', content: 'chat2-msg1', messageId: 'msg-4', chatId: 'chat-2', createdAt: new Date('2024-01-01T10:00:00Z'), agentId: 'agent-1' },
        { role: 'assistant', content: 'chat2-msg2', messageId: 'msg-5', chatId: 'chat-2', createdAt: new Date('2024-01-01T10:01:00Z'), agentId: 'agent-1' },
        { role: 'user', content: 'chat2-msg3', messageId: 'msg-6', chatId: 'chat-2', createdAt: new Date('2024-01-01T10:02:00Z'), agentId: 'agent-1' }
      ];

      const mockAgent = createMockAgent({ memory: mockMemory });
      const mockWorld = createMockWorld({ totalMessages: 6 });

      mockStorageAPI.loadWorld.mockResolvedValue(mockWorld);
      mockStorageAPI.listAgents.mockResolvedValue([mockAgent]);
      mockStorageAPI.getMemory.mockResolvedValue(mockMemory);
      mockStorageAPI.loadAgent.mockResolvedValue(mockAgent);
      mockStorageAPI.saveAgentMemory.mockResolvedValue();

      await removeMessagesFrom('test-world', 'msg-2', 'chat-1');

      const savedMemory = mockStorageAPI.saveAgentMemory.mock.calls[0][2];

      // Chat-1: Only msg-1 should remain (msg-2 and msg-3 removed)
      const chat1Messages = savedMemory.filter((m: AgentMessage) => m.chatId === 'chat-1');
      expect(chat1Messages).toHaveLength(1);
      expect(chat1Messages[0].messageId).toBe('msg-1');

      // Chat-2: All messages should be preserved
      const chat2Messages = savedMemory.filter((m: AgentMessage) => m.chatId === 'chat-2');
      expect(chat2Messages).toHaveLength(3);
    });

    it('should preserve all messages from other chats', async () => {
      const mockMemory: AgentMessage[] = [
        // Chat-A: 4 messages
        { role: 'user', content: 'a1', messageId: 'a-1', chatId: 'chat-a', createdAt: new Date('2024-01-01T10:00:00Z'), agentId: 'agent-1' },
        { role: 'assistant', content: 'a2', messageId: 'a-2', chatId: 'chat-a', createdAt: new Date('2024-01-01T10:01:00Z'), agentId: 'agent-1' },
        { role: 'user', content: 'a3', messageId: 'a-3', chatId: 'chat-a', createdAt: new Date('2024-01-01T10:02:00Z'), agentId: 'agent-1' },
        { role: 'assistant', content: 'a4', messageId: 'a-4', chatId: 'chat-a', createdAt: new Date('2024-01-01T10:03:00Z'), agentId: 'agent-1' },
        // Chat-B: 3 messages (target for deletion, message 2)
        { role: 'user', content: 'b1', messageId: 'b-1', chatId: 'chat-b', createdAt: new Date('2024-01-01T10:00:00Z'), agentId: 'agent-1' },
        { role: 'assistant', content: 'b2', messageId: 'b-2', chatId: 'chat-b', createdAt: new Date('2024-01-01T10:01:00Z'), agentId: 'agent-1' },
        { role: 'user', content: 'b3', messageId: 'b-3', chatId: 'chat-b', createdAt: new Date('2024-01-01T10:02:00Z'), agentId: 'agent-1' },
        // Chat-C: 3 messages
        { role: 'user', content: 'c1', messageId: 'c-1', chatId: 'chat-c', createdAt: new Date('2024-01-01T10:00:00Z'), agentId: 'agent-1' },
        { role: 'assistant', content: 'c2', messageId: 'c-2', chatId: 'chat-c', createdAt: new Date('2024-01-01T10:01:00Z'), agentId: 'agent-1' },
        { role: 'user', content: 'c3', messageId: 'c-3', chatId: 'chat-c', createdAt: new Date('2024-01-01T10:02:00Z'), agentId: 'agent-1' }
      ];

      const mockAgent = createMockAgent({ memory: mockMemory });
      const mockWorld = createMockWorld({ totalMessages: 10, currentChatId: 'chat-b' });

      mockStorageAPI.loadWorld.mockResolvedValue(mockWorld);
      mockStorageAPI.listAgents.mockResolvedValue([mockAgent]);
      mockStorageAPI.getMemory.mockResolvedValue(mockMemory);
      mockStorageAPI.loadAgent.mockResolvedValue(mockAgent);
      mockStorageAPI.saveAgentMemory.mockResolvedValue();

      await removeMessagesFrom('test-world', 'b-2', 'chat-b');

      const savedMemory = mockStorageAPI.saveAgentMemory.mock.calls[0][2];

      // Chat-A: 4 messages (unchanged)
      const chatAMessages = savedMemory.filter((m: AgentMessage) => m.chatId === 'chat-a');
      expect(chatAMessages).toHaveLength(4);

      // Chat-B: 1 message (only b-1 kept)
      const chatBMessages = savedMemory.filter((m: AgentMessage) => m.chatId === 'chat-b');
      expect(chatBMessages).toHaveLength(1);
      expect(chatBMessages[0].messageId).toBe('b-1');

      // Chat-C: 3 messages (unchanged)
      const chatCMessages = savedMemory.filter((m: AgentMessage) => m.chatId === 'chat-c');
      expect(chatCMessages).toHaveLength(3);

      // Total: 8 messages kept
      expect(savedMemory).toHaveLength(8);
    });
  });

  describe('Multi-Agent Behavior', () => {
    it('should process all agents in the world', async () => {
      const mockMemory: AgentMessage[] = [
        { role: 'user', content: 'msg1', messageId: 'msg-1', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:00:00Z'), agentId: 'agent-1' },
        { role: 'assistant', content: 'msg2', messageId: 'msg-2', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:01:00Z'), agentId: 'agent-1' },
        { role: 'user', content: 'msg3', messageId: 'msg-3', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:02:00Z'), agentId: 'agent-1' }
      ];

      const mockAgent1 = createMockAgent({ id: 'agent-1', memory: mockMemory });
      const mockAgent2 = createMockAgent({ id: 'agent-2', memory: mockMemory });
      const mockWorld = createMockWorld({ totalAgents: 2, totalMessages: 6 });

      mockStorageAPI.loadWorld.mockResolvedValue(mockWorld);
      mockStorageAPI.listAgents.mockResolvedValue([mockAgent1, mockAgent2]);
      mockStorageAPI.getMemory.mockResolvedValue(mockMemory);
      mockStorageAPI.loadAgent.mockImplementation(async (worldId: string, agentId: string) => {
        if (agentId === 'agent-1') return mockAgent1;
        if (agentId === 'agent-2') return mockAgent2;
        return null;
      });
      mockStorageAPI.saveAgentMemory.mockResolvedValue();

      const result = await removeMessagesFrom('test-world', 'msg-2', 'chat-1');

      expect(result.totalAgents).toBe(2);
      expect(result.processedAgents).toHaveLength(2);
      expect(result.processedAgents).toContain('agent-1');
      expect(result.processedAgents).toContain('agent-2');
      expect(mockStorageAPI.saveAgentMemory).toHaveBeenCalledTimes(2);
    });

    it('should continue processing if one agent fails', async () => {
      const mockMemory: AgentMessage[] = [
        { role: 'user', content: 'msg1', messageId: 'msg-1', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:00:00Z'), agentId: 'agent-1' }
      ];

      const mockAgent1 = createMockAgent({ id: 'agent-1' });
      const mockAgent2 = createMockAgent({ id: 'agent-2', memory: mockMemory });
      const mockWorld = createMockWorld({ totalAgents: 2, totalMessages: 3 });

      mockStorageAPI.loadWorld.mockResolvedValue(mockWorld);
      mockStorageAPI.listAgents.mockResolvedValue([mockAgent1, mockAgent2]);
      mockStorageAPI.getMemory.mockResolvedValue(mockMemory);
      
      // Agent 1 fails, Agent 2 succeeds
      mockStorageAPI.loadAgent.mockImplementation(async (worldId: string, agentId: string) => {
        if (agentId === 'agent-1') throw new Error('Storage error for agent-1');
        if (agentId === 'agent-2') return mockAgent2;
        return null;
      });
      mockStorageAPI.saveAgentMemory.mockResolvedValue();

      const result = await removeMessagesFrom('test-world', 'msg-1', 'chat-1');

      expect(result.success).toBe(false); // Failed because one agent failed
      expect(result.processedAgents).toContain('agent-2');
      expect(result.failedAgents).toHaveLength(1);
      expect(result.failedAgents[0]).toMatchObject({
        agentId: 'agent-1',
        error: expect.stringContaining('Storage error')
      });
      expect(result.requiresRetry).toBe(true);
    });

    it('should aggregate removal counts across all agents', async () => {
      const mockMemory: AgentMessage[] = [
        { role: 'user', content: 'msg1', messageId: 'msg-1', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:00:00Z'), agentId: 'agent-1' },
        { role: 'assistant', content: 'msg2', messageId: 'msg-2', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:01:00Z'), agentId: 'agent-1' },
        { role: 'user', content: 'msg3', messageId: 'msg-3', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:02:00Z'), agentId: 'agent-1' }
      ];

      const mockAgent1 = createMockAgent({ id: 'agent-1', memory: mockMemory });
      const mockAgent2 = createMockAgent({ id: 'agent-2', memory: mockMemory });
      const mockWorld = createMockWorld({ totalAgents: 2, totalMessages: 6 });

      mockStorageAPI.loadWorld.mockResolvedValue(mockWorld);
      mockStorageAPI.listAgents.mockResolvedValue([mockAgent1, mockAgent2]);
      mockStorageAPI.getMemory.mockResolvedValue(mockMemory);
      mockStorageAPI.loadAgent.mockImplementation(async (worldId: string, agentId: string) => {
        if (agentId === 'agent-1') return mockAgent1;
        if (agentId === 'agent-2') return mockAgent2;
        return null;
      });
      mockStorageAPI.saveAgentMemory.mockResolvedValue();

      const result = await removeMessagesFrom('test-world', 'msg-2', 'chat-1');

      // Both agents had 2 messages removed (msg-2 and msg-3)
      expect(result.messagesRemovedTotal).toBe(4); // 2 from agent-1 + 2 from agent-2
      expect(result.totalAgents).toBe(2);
      expect(result.processedAgents).toHaveLength(2);
    });
  });

  describe('Storage Persistence', () => {
    it('should use direct saveAgentMemory call', async () => {
      const mockMemory: AgentMessage[] = [
        { role: 'user', content: 'msg1', messageId: 'msg-1', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:00:00Z'), agentId: 'agent-1' },
        { role: 'assistant', content: 'msg2', messageId: 'msg-2', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:01:00Z'), agentId: 'agent-1' }
      ];

      const mockAgent = createMockAgent({ memory: mockMemory });
      const mockWorld = createMockWorld({ totalMessages: 2 });

      mockStorageAPI.loadWorld.mockResolvedValue(mockWorld);
      mockStorageAPI.listAgents.mockResolvedValue([mockAgent]);
      mockStorageAPI.getMemory.mockResolvedValue(mockMemory);
      mockStorageAPI.loadAgent.mockResolvedValue(mockAgent);
      mockStorageAPI.saveAgentMemory.mockResolvedValue();

      await removeMessagesFrom('test-world', 'msg-1', 'chat-1');

      // Verify saveAgentMemory was called directly
      expect(mockStorageAPI.saveAgentMemory).toHaveBeenCalledWith(
        'test-world',
        'agent-1',
        expect.any(Array)
      );
      expect(mockStorageAPI.saveAgentMemory).toHaveBeenCalledTimes(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle deletion of first message', async () => {
      const mockMemory: AgentMessage[] = [
        { role: 'user', content: 'msg1', messageId: 'msg-1', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:00:00Z'), agentId: 'agent-1' },
        { role: 'assistant', content: 'msg2', messageId: 'msg-2', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:01:00Z'), agentId: 'agent-1' },
        { role: 'user', content: 'msg3', messageId: 'msg-3', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:02:00Z'), agentId: 'agent-1' }
      ];

      const mockAgent = createMockAgent({ memory: mockMemory });
      const mockWorld = createMockWorld({ totalMessages: 3 });

      mockStorageAPI.loadWorld.mockResolvedValue(mockWorld);
      mockStorageAPI.listAgents.mockResolvedValue([mockAgent]);
      mockStorageAPI.getMemory.mockResolvedValue(mockMemory);
      mockStorageAPI.loadAgent.mockResolvedValue(mockAgent);
      mockStorageAPI.saveAgentMemory.mockResolvedValue();

      const result = await removeMessagesFrom('test-world', 'msg-1', 'chat-1');

      // All messages in chat should be removed
      const savedMemory = mockStorageAPI.saveAgentMemory.mock.calls[0][2];
      expect(savedMemory).toHaveLength(0);
      expect(result.messagesRemovedTotal).toBe(3);
    });

    it('should handle deletion of last message', async () => {
      const mockMemory: AgentMessage[] = [
        { role: 'user', content: 'msg1', messageId: 'msg-1', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:00:00Z'), agentId: 'agent-1' },
        { role: 'assistant', content: 'msg2', messageId: 'msg-2', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:01:00Z'), agentId: 'agent-1' },
        { role: 'user', content: 'msg3', messageId: 'msg-3', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:02:00Z'), agentId: 'agent-1' }
      ];

      const mockAgent = createMockAgent({ memory: mockMemory });
      const mockWorld = createMockWorld({ totalMessages: 3 });

      mockStorageAPI.loadWorld.mockResolvedValue(mockWorld);
      mockStorageAPI.listAgents.mockResolvedValue([mockAgent]);
      mockStorageAPI.getMemory.mockResolvedValue(mockMemory);
      mockStorageAPI.loadAgent.mockResolvedValue(mockAgent);
      mockStorageAPI.saveAgentMemory.mockResolvedValue();

      const result = await removeMessagesFrom('test-world', 'msg-3', 'chat-1');

      // Only the last message should be removed
      const savedMemory = mockStorageAPI.saveAgentMemory.mock.calls[0][2];
      expect(savedMemory).toHaveLength(2);
      expect(savedMemory[0].messageId).toBe('msg-1');
      expect(savedMemory[1].messageId).toBe('msg-2');
      expect(result.messagesRemovedTotal).toBe(1);
    });

    it('should handle empty agent memory', async () => {
      const mockAgent = createMockAgent();
      const mockWorld = createMockWorld();

      mockStorageAPI.loadWorld.mockResolvedValue(mockWorld);
      mockStorageAPI.listAgents.mockResolvedValue([mockAgent]);
      mockStorageAPI.getMemory.mockResolvedValue([]);

      const result = await removeMessagesFrom('test-world', 'msg-1', 'chat-1');

      // Should not throw error
      expect(result.success).toBe(false);
      expect(result.failedAgents).toHaveLength(1);
      expect(result.failedAgents[0].error).toContain('No messages found');
      expect(mockStorageAPI.saveAgentMemory).not.toHaveBeenCalled();
    });

    it('should handle message not found in agent memory', async () => {
      const mockMemory: AgentMessage[] = [
        { role: 'user', content: 'msg1', messageId: 'msg-1', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:00:00Z'), agentId: 'agent-1' },
        { role: 'assistant', content: 'msg2', messageId: 'msg-2', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:01:00Z'), agentId: 'agent-1' }
      ];

      const mockAgent = createMockAgent({ memory: mockMemory });
      const mockWorld = createMockWorld({ totalMessages: 2 });

      mockStorageAPI.loadWorld.mockResolvedValue(mockWorld);
      mockStorageAPI.listAgents.mockResolvedValue([mockAgent]);
      mockStorageAPI.getMemory.mockResolvedValue(mockMemory);
      mockStorageAPI.loadAgent.mockResolvedValue(mockAgent);
      mockStorageAPI.saveAgentMemory.mockResolvedValue();

      const result = await removeMessagesFrom('test-world', 'nonexistent-msg', 'chat-1');

      // Target message not found in agent memory
      expect(result.success).toBe(false);
      expect(result.failedAgents).toHaveLength(1);
      expect(result.failedAgents[0].error).toContain('not found');
      expect(result.processedAgents).toHaveLength(0);
    });
  });
});
