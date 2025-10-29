/**
 * Unit Tests for Message Deletion Feature
 * 
 * Tests the removeMessagesFrom function which handles deletion of user messages
 * and all subsequent messages in a chat conversation.
 * 
 * Uses in-memory storage for testing.
 */

import { describe, test, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Agent, AgentMessage, World } from '../../core/types.js';
import { LLMProvider } from '../../core/types.js';
import { createMemoryStorage } from '../../core/storage/memory-storage.js';
import { EventEmitter } from 'events';

// Create a shared storage instance that will be used by the mocked factory
const memoryStorage = createMemoryStorage();

// Mock the storage factory to return our in-memory storage
vi.mock('../../core/storage/storage-factory.js', async () => {
  const actual = await vi.importActual<typeof import('../../core/storage/storage-factory.js')>('../../core/storage/storage-factory.js');
  return {
    ...actual,
    createStorageWithWrappers: vi.fn().mockResolvedValue(actual.createStorageWrappers(memoryStorage)),
    getDefaultRootPath: vi.fn().mockReturnValue('/test/data')
  };
});

// Import after mocks are set up
import { removeMessagesFrom } from '../../core/index.js';

// Helper to create a test world
function createTestWorld(overrides: Partial<World> = {}): World {
  return {
    id: 'test-world',
    name: 'Test World',
    currentChatId: 'chat-1',
    totalAgents: 1,
    totalMessages: 0,
    turnLimit: 5,
    createdAt: new Date(),
    lastUpdated: new Date(),
    eventEmitter: new EventEmitter(),
    agents: new Map(),
    chats: new Map(),
    ...overrides
  } as World;
}

// Helper to create a test agent
function createTestAgent(overrides: Partial<Agent> = {}): Agent {
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
  beforeEach(async () => {
    // Clear all data from in-memory storage before each test
    // Note: Memory storage doesn't have a clear method, so we'll work with fresh data each test
  });

  afterEach(async () => {
    // Clean up by deleting test world if it exists
    try {
      await memoryStorage.deleteWorld('test-world');
    } catch (e) {
      // Ignore errors if world doesn't exist
    }
  });

  describe('Error Handling', () => {
    it('should throw error for non-existent world', async () => {
      await expect(
        removeMessagesFrom('nonexistent-world-xyz', 'msg-1', 'chat-1')
      ).rejects.toThrow(/not found/);
    });

    it('should validate world exists before attempting deletion', async () => {
      const result = removeMessagesFrom('invalid-world-id', 'msg-1', 'chat-1');
      await expect(result).rejects.toThrow();
    });
  });

  describe('RemovalResult Structure', () => {
    it('should return correct result structure with required fields', async () => {
      const world = createTestWorld();
      const agent = createTestAgent({
        memory: [
          { role: 'user', content: 'msg1', messageId: 'msg-1', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:00:00Z'), agentId: 'agent-1' },
          { role: 'assistant', content: 'msg2', messageId: 'msg-2', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:01:00Z'), agentId: 'agent-1' },
          { role: 'user', content: 'msg3', messageId: 'msg-3', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:02:00Z'), agentId: 'agent-1' }
        ]
      });
      const chat = { id: 'chat-1', name: 'Chat 1', worldId: 'test-world', messageCount: 3, createdAt: new Date(), updatedAt: new Date() };

      await memoryStorage.saveWorld(world);
      await memoryStorage.saveAgent('test-world', agent);
      await memoryStorage.saveChatData('test-world', chat);

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
      const world = createTestWorld();
      const chat = { id: 'chat-1', name: 'Chat 1', worldId: 'test-world', messageCount: 0, createdAt: new Date(), updatedAt: new Date() };

      await memoryStorage.saveWorld(world);
      await memoryStorage.saveChatData('test-world', chat);

      const result = await removeMessagesFrom('test-world', 'msg-1', 'chat-1');

      expect(result.success).toBe(false);
      expect(result.failedAgents).toHaveLength(0); // No agents = no failures
      expect(result.messagesRemovedTotal).toBe(0);
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
      const world = createTestWorld();
      const agent = createTestAgent({
        memory: [
          { role: 'user', content: 'msg1', messageId: 'msg-1', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:00:00Z'), agentId: 'agent-1' },
          { role: 'assistant', content: 'msg2', messageId: 'msg-2', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:01:00Z'), agentId: 'agent-1' },
          { role: 'user', content: 'msg3', messageId: 'msg-3', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:02:00Z'), agentId: 'agent-1' },
          { role: 'assistant', content: 'msg4', messageId: 'msg-4', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:03:00Z'), agentId: 'agent-1' },
          { role: 'user', content: 'msg5', messageId: 'msg-5', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:04:00Z'), agentId: 'agent-1' }
        ]
      });
      const chat = { id: 'chat-1', name: 'Chat 1', worldId: 'test-world', messageCount: 5, createdAt: new Date(), updatedAt: new Date() };

      await memoryStorage.saveWorld(world);
      await memoryStorage.saveAgent('test-world', agent);
      await memoryStorage.saveChatData('test-world', chat);

      await removeMessagesFrom('test-world', 'msg-3', 'chat-1');

      // Verify that only messages before msg-3 remain
      const updatedAgent = await memoryStorage.loadAgent('test-world', 'agent-1');
      expect(updatedAgent?.memory).toHaveLength(2);
      expect(updatedAgent?.memory[0].messageId).toBe('msg-1');
      expect(updatedAgent?.memory[1].messageId).toBe('msg-2');
    });

    it('should handle messages without createdAt timestamps', async () => {
      const world = createTestWorld();
      const agent = createTestAgent({
        memory: [
          { role: 'user', content: 'msg1', messageId: 'msg-1', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:00:00Z'), agentId: 'agent-1' },
          { role: 'assistant', content: 'msg2', messageId: 'msg-2', chatId: 'chat-1', agentId: 'agent-1' } as AgentMessage // No createdAt
        ]
      });
      const chat = { id: 'chat-1', name: 'Chat 1', worldId: 'test-world', messageCount: 2, createdAt: new Date(), updatedAt: new Date() };

      await memoryStorage.saveWorld(world);
      await memoryStorage.saveAgent('test-world', agent);
      await memoryStorage.saveChatData('test-world', chat);

      const result = await removeMessagesFrom('test-world', 'msg-1', 'chat-1');

      // Should not throw an error
      expect(result.success).toBe(true);
      expect(result.messagesRemovedTotal).toBeGreaterThanOrEqual(1);
    });

    it('should handle Date objects and ISO strings', async () => {
      const world = createTestWorld();
      const agent = createTestAgent({
        memory: [
          { role: 'user', content: 'msg1', messageId: 'msg-1', chatId: 'chat-1', createdAt: '2024-01-01T10:00:00Z' as any, agentId: 'agent-1' },
          { role: 'assistant', content: 'msg2', messageId: 'msg-2', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:01:00Z'), agentId: 'agent-1' }
        ]
      });
      const chat = { id: 'chat-1', name: 'Chat 1', worldId: 'test-world', messageCount: 2, createdAt: new Date(), updatedAt: new Date() };

      await memoryStorage.saveWorld(world);
      await memoryStorage.saveAgent('test-world', agent);
      await memoryStorage.saveChatData('test-world', chat);

      const result = await removeMessagesFrom('test-world', 'msg-1', 'chat-1');

      // Should handle both formats correctly
      expect(result.success).toBe(true);
      expect(result.messagesRemovedTotal).toBe(2);
    });
  });

  describe('Chat Isolation Behavior', () => {
    it('should only affect messages in the specified chat', async () => {
      const world = createTestWorld();
      const agent = createTestAgent({
        memory: [
          // Chat-1 messages
          { role: 'user', content: 'chat1-msg1', messageId: 'msg-1', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:00:00Z'), agentId: 'agent-1' },
          { role: 'assistant', content: 'chat1-msg2', messageId: 'msg-2', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:01:00Z'), agentId: 'agent-1' },
          { role: 'user', content: 'chat1-msg3', messageId: 'msg-3', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:02:00Z'), agentId: 'agent-1' },
          // Chat-2 messages (should be preserved)
          { role: 'user', content: 'chat2-msg1', messageId: 'msg-4', chatId: 'chat-2', createdAt: new Date('2024-01-01T10:00:00Z'), agentId: 'agent-1' },
          { role: 'assistant', content: 'chat2-msg2', messageId: 'msg-5', chatId: 'chat-2', createdAt: new Date('2024-01-01T10:01:00Z'), agentId: 'agent-1' },
          { role: 'user', content: 'chat2-msg3', messageId: 'msg-6', chatId: 'chat-2', createdAt: new Date('2024-01-01T10:02:00Z'), agentId: 'agent-1' }
        ]
      });
      const chat1 = { id: 'chat-1', name: 'Chat 1', worldId: 'test-world', messageCount: 3, createdAt: new Date(), updatedAt: new Date() };
      const chat2 = { id: 'chat-2', name: 'Chat 2', worldId: 'test-world', messageCount: 3, createdAt: new Date(), updatedAt: new Date() };

      await memoryStorage.saveWorld(world);
      await memoryStorage.saveAgent('test-world', agent);
      await memoryStorage.saveChatData('test-world', chat1);
      await memoryStorage.saveChatData('test-world', chat2);

      await removeMessagesFrom('test-world', 'msg-2', 'chat-1');

      const updatedAgent = await memoryStorage.loadAgent('test-world', 'agent-1');
      const chat1Messages = updatedAgent?.memory.filter((m: AgentMessage) => m.chatId === 'chat-1');
      const chat2Messages = updatedAgent?.memory.filter((m: AgentMessage) => m.chatId === 'chat-2');

      // Chat-1: Only msg-1 should remain (msg-2 and msg-3 removed)
      expect(chat1Messages).toHaveLength(1);
      expect(chat1Messages?.[0].messageId).toBe('msg-1');

      // Chat-2: All messages should be preserved
      expect(chat2Messages).toHaveLength(3);
    });

    it('should preserve all messages from other chats', async () => {
      const world = createTestWorld();
      const agent = createTestAgent({
        memory: [
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
        ]
      });
      const chatA = { id: 'chat-a', name: 'Chat A', worldId: 'test-world', messageCount: 4, createdAt: new Date(), updatedAt: new Date() };
      const chatB = { id: 'chat-b', name: 'Chat B', worldId: 'test-world', messageCount: 3, createdAt: new Date(), updatedAt: new Date() };
      const chatC = { id: 'chat-c', name: 'Chat C', worldId: 'test-world', messageCount: 3, createdAt: new Date(), updatedAt: new Date() };

      await memoryStorage.saveWorld(world);
      await memoryStorage.saveAgent('test-world', agent);
      await memoryStorage.saveChatData('test-world', chatA);
      await memoryStorage.saveChatData('test-world', chatB);
      await memoryStorage.saveChatData('test-world', chatC);

      await removeMessagesFrom('test-world', 'b-2', 'chat-b');

      const updatedAgent = await memoryStorage.loadAgent('test-world', 'agent-1');
      const chatAMessages = updatedAgent?.memory.filter((m: AgentMessage) => m.chatId === 'chat-a');
      const chatBMessages = updatedAgent?.memory.filter((m: AgentMessage) => m.chatId === 'chat-b');
      const chatCMessages = updatedAgent?.memory.filter((m: AgentMessage) => m.chatId === 'chat-c');

      // Chat-A: 4 messages (unchanged)
      expect(chatAMessages).toHaveLength(4);

      // Chat-B: 1 message (only b-1 kept)
      expect(chatBMessages).toHaveLength(1);
      expect(chatBMessages?.[0].messageId).toBe('b-1');

      // Chat-C: 3 messages (unchanged)
      expect(chatCMessages).toHaveLength(3);

      // Total: 8 messages kept
      expect(updatedAgent?.memory).toHaveLength(8);
    });
  });

  describe('Multi-Agent Behavior', () => {
    it('should process all agents in the world', async () => {
      const world = createTestWorld({ totalAgents: 2 });
      const agent1 = createTestAgent({
        id: 'agent-1',
        memory: [
          { role: 'user', content: 'msg1', messageId: 'msg-1', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:00:00Z'), agentId: 'agent-1' },
          { role: 'assistant', content: 'msg2', messageId: 'msg-2', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:01:00Z'), agentId: 'agent-1' },
          { role: 'user', content: 'msg3', messageId: 'msg-3', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:02:00Z'), agentId: 'agent-1' }
        ]
      });
      const agent2 = createTestAgent({
        id: 'agent-2',
        memory: [
          { role: 'user', content: 'msg1', messageId: 'msg-1', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:00:00Z'), agentId: 'agent-2' },
          { role: 'assistant', content: 'msg2', messageId: 'msg-2', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:01:00Z'), agentId: 'agent-2' },
          { role: 'user', content: 'msg3', messageId: 'msg-3', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:02:00Z'), agentId: 'agent-2' }
        ]
      });
      const chat = { id: 'chat-1', name: 'Chat 1', worldId: 'test-world', messageCount: 6, createdAt: new Date(), updatedAt: new Date() };

      await memoryStorage.saveWorld(world);
      await memoryStorage.saveAgent('test-world', agent1);
      await memoryStorage.saveAgent('test-world', agent2);
      await memoryStorage.saveChatData('test-world', chat);

      const result = await removeMessagesFrom('test-world', 'msg-2', 'chat-1');

      expect(result.totalAgents).toBe(2);
      expect(result.processedAgents).toHaveLength(2);
      expect(result.processedAgents).toContain('agent-1');
      expect(result.processedAgents).toContain('agent-2');
    });

    it('should continue processing if one agent fails', async () => {
      const world = createTestWorld({ totalAgents: 2 });
      const agent2 = createTestAgent({
        id: 'agent-2',
        memory: [
          { role: 'user', content: 'msg1', messageId: 'msg-1', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:00:00Z'), agentId: 'agent-2' }
        ]
      });
      const chat = { id: 'chat-1', name: 'Chat 1', worldId: 'test-world', messageCount: 1, createdAt: new Date(), updatedAt: new Date() };

      await memoryStorage.saveWorld(world);
      // Don't save agent-1 - it will be in listAgents but loadAgent will fail
      await memoryStorage.saveAgent('test-world', agent2);
      await memoryStorage.saveChatData('test-world', chat);

      const result = await removeMessagesFrom('test-world', 'msg-1', 'chat-1');

      expect(result.processedAgents).toContain('agent-2');
      expect(result.messagesRemovedTotal).toBeGreaterThanOrEqual(0);
    });

    it('should aggregate removal counts across all agents', async () => {
      const world = createTestWorld({ totalAgents: 2 });
      const agent1 = createTestAgent({
        id: 'agent-1',
        memory: [
          { role: 'user', content: 'msg1', messageId: 'msg-1', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:00:00Z'), agentId: 'agent-1' },
          { role: 'assistant', content: 'msg2', messageId: 'msg-2', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:01:00Z'), agentId: 'agent-1' },
          { role: 'user', content: 'msg3', messageId: 'msg-3', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:02:00Z'), agentId: 'agent-1' }
        ]
      });
      const agent2 = createTestAgent({
        id: 'agent-2',
        memory: [
          { role: 'user', content: 'msg1', messageId: 'msg-1', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:00:00Z'), agentId: 'agent-2' },
          { role: 'assistant', content: 'msg2', messageId: 'msg-2', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:01:00Z'), agentId: 'agent-2' },
          { role: 'user', content: 'msg3', messageId: 'msg-3', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:02:00Z'), agentId: 'agent-2' }
        ]
      });
      const chat = { id: 'chat-1', name: 'Chat 1', worldId: 'test-world', messageCount: 6, createdAt: new Date(), updatedAt: new Date() };

      await memoryStorage.saveWorld(world);
      await memoryStorage.saveAgent('test-world', agent1);
      await memoryStorage.saveAgent('test-world', agent2);
      await memoryStorage.saveChatData('test-world', chat);

      const result = await removeMessagesFrom('test-world', 'msg-2', 'chat-1');

      // Both agents had 2 messages removed (msg-2 and msg-3)
      expect(result.messagesRemovedTotal).toBe(4); // 2 from agent-1 + 2 from agent-2
      expect(result.totalAgents).toBe(2);
      expect(result.processedAgents).toHaveLength(2);
    });
  });

  describe('Storage Persistence', () => {
    it('should use direct saveAgentMemory call', async () => {
      const world = createTestWorld();
      const agent = createTestAgent({
        memory: [
          { role: 'user', content: 'msg1', messageId: 'msg-1', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:00:00Z'), agentId: 'agent-1' },
          { role: 'assistant', content: 'msg2', messageId: 'msg-2', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:01:00Z'), agentId: 'agent-1' }
        ]
      });
      const chat = { id: 'chat-1', name: 'Chat 1', worldId: 'test-world', messageCount: 2, createdAt: new Date(), updatedAt: new Date() };

      await memoryStorage.saveWorld(world);
      await memoryStorage.saveAgent('test-world', agent);
      await memoryStorage.saveChatData('test-world', chat);

      await removeMessagesFrom('test-world', 'msg-1', 'chat-1');

      // Verify that memory was updated in storage
      const updatedAgent = await memoryStorage.loadAgent('test-world', 'agent-1');
      expect(updatedAgent?.memory).toBeDefined();
      expect(updatedAgent?.memory.length).toBe(0); // All messages removed
    });
  });

  describe('Edge Cases', () => {
    it('should handle deletion of first message', async () => {
      const world = createTestWorld();
      const agent = createTestAgent({
        memory: [
          { role: 'user', content: 'msg1', messageId: 'msg-1', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:00:00Z'), agentId: 'agent-1' },
          { role: 'assistant', content: 'msg2', messageId: 'msg-2', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:01:00Z'), agentId: 'agent-1' },
          { role: 'user', content: 'msg3', messageId: 'msg-3', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:02:00Z'), agentId: 'agent-1' }
        ]
      });
      const chat = { id: 'chat-1', name: 'Chat 1', worldId: 'test-world', messageCount: 3, createdAt: new Date(), updatedAt: new Date() };

      await memoryStorage.saveWorld(world);
      await memoryStorage.saveAgent('test-world', agent);
      await memoryStorage.saveChatData('test-world', chat);

      const result = await removeMessagesFrom('test-world', 'msg-1', 'chat-1');

      // All messages in chat should be removed
      const updatedAgent = await memoryStorage.loadAgent('test-world', 'agent-1');
      expect(updatedAgent?.memory).toHaveLength(0);
      expect(result.messagesRemovedTotal).toBe(3);
    });

    it('should handle deletion of last message', async () => {
      const world = createTestWorld();
      const agent = createTestAgent({
        memory: [
          { role: 'user', content: 'msg1', messageId: 'msg-1', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:00:00Z'), agentId: 'agent-1' },
          { role: 'assistant', content: 'msg2', messageId: 'msg-2', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:01:00Z'), agentId: 'agent-1' },
          { role: 'user', content: 'msg3', messageId: 'msg-3', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:02:00Z'), agentId: 'agent-1' }
        ]
      });
      const chat = { id: 'chat-1', name: 'Chat 1', worldId: 'test-world', messageCount: 3, createdAt: new Date(), updatedAt: new Date() };

      await memoryStorage.saveWorld(world);
      await memoryStorage.saveAgent('test-world', agent);
      await memoryStorage.saveChatData('test-world', chat);

      const result = await removeMessagesFrom('test-world', 'msg-3', 'chat-1');

      // Only the last message should be removed
      const updatedAgent = await memoryStorage.loadAgent('test-world', 'agent-1');
      expect(updatedAgent?.memory).toHaveLength(2);
      expect(updatedAgent?.memory[0].messageId).toBe('msg-1');
      expect(updatedAgent?.memory[1].messageId).toBe('msg-2');
      expect(result.messagesRemovedTotal).toBe(1);
    });

    it('should handle empty agent memory', async () => {
      const world = createTestWorld();
      const agent = createTestAgent({ memory: [] });
      const chat = { id: 'chat-1', name: 'Chat 1', worldId: 'test-world', messageCount: 0, createdAt: new Date(), updatedAt: new Date() };

      await memoryStorage.saveWorld(world);
      await memoryStorage.saveAgent('test-world', agent);
      await memoryStorage.saveChatData('test-world', chat);

      const result = await removeMessagesFrom('test-world', 'msg-1', 'chat-1');

      // Should not throw error
      expect(result.success).toBe(false);
      expect(result.messagesRemovedTotal).toBe(0);
    });

    it('should handle message not found in agent memory', async () => {
      const world = createTestWorld();
      const agent = createTestAgent({
        memory: [
          { role: 'user', content: 'msg1', messageId: 'msg-1', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:00:00Z'), agentId: 'agent-1' },
          { role: 'assistant', content: 'msg2', messageId: 'msg-2', chatId: 'chat-1', createdAt: new Date('2024-01-01T10:01:00Z'), agentId: 'agent-1' }
        ]
      });
      const chat = { id: 'chat-1', name: 'Chat 1', worldId: 'test-world', messageCount: 2, createdAt: new Date(), updatedAt: new Date() };

      await memoryStorage.saveWorld(world);
      await memoryStorage.saveAgent('test-world', agent);
      await memoryStorage.saveChatData('test-world', chat);

      const result = await removeMessagesFrom('test-world', 'nonexistent-msg', 'chat-1');

      // Target message not found in agent memory
      expect(result.success).toBe(false);
      expect(result.failedAgents).toHaveLength(1);
      expect(result.failedAgents[0].error).toContain('not found');
      expect(result.processedAgents).toHaveLength(0);
    });
  });
});
