/**
 * Cascade Deletion Integration Tests
 * 
 * Verifies that deletion operations properly cascade across all storage implementations:
 * - World deletion cascades to agents and chats
 * - Agent deletion cascades to memory and archives
 * - Chat deletion cascades to agent memory messages
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStorage } from '../../../core/storage/memory-storage.js';
import type { World, Agent, Chat, LLMProvider } from '../../../core/types.js';

describe('Cascade Deletion', () => {
  let storage: MemoryStorage;
  const testWorldId = 'test-world';
  const testAgentId = 'test-agent';
  const testChatId = 'test-chat';

  beforeEach(async () => {
    storage = new MemoryStorage();

    // Set up test world
    const world: Partial<World> = {
      id: testWorldId,
      name: 'Test World',
      description: 'Test',
      turnLimit: 5,
      createdAt: new Date(),
      lastUpdated: new Date(),
    };
    await storage.saveWorld(world as World);

    // Set up test agent with memory
    const agent: Agent = {
      id: testAgentId,
      name: 'Test Agent',
      type: 'chat',
      status: 'active',
      provider: 'openai' as LLMProvider,
      model: 'gpt-4',
      systemPrompt: 'Test',
      temperature: 0.7,
      maxTokens: 1000,
      llmCallCount: 0,
      createdAt: new Date(),
      lastActive: new Date(),
      memory: [
        {
          role: 'user',
          content: 'Hello',
          sender: 'user',
          chatId: testChatId,
          messageId: 'msg-1',
          createdAt: new Date(),
        },
        {
          role: 'assistant',
          content: 'Hi there',
          sender: testAgentId,
          chatId: testChatId,
          messageId: 'msg-2',
          createdAt: new Date(),
        },
      ],
    };
    await storage.saveAgent(testWorldId, agent);

    // Set up test chat
    const chat: Chat = {
      id: testChatId,
      worldId: testWorldId,
      name: 'Test Chat',
      description: 'Test chat',
      createdAt: new Date(),
      updatedAt: new Date(),
      messageCount: 2,
    };
    await storage.saveChatData(testWorldId, chat);
  });

  describe('World Deletion Cascade', () => {
    it('should delete world and cascade to agents', async () => {
      // Verify data exists before deletion
      expect(await storage.worldExists(testWorldId)).toBe(true);
      expect(await storage.agentExists(testWorldId, testAgentId)).toBe(true);

      // Delete world
      const deleted = await storage.deleteWorld(testWorldId);
      expect(deleted).toBe(true);

      // Verify world and agents are deleted
      expect(await storage.worldExists(testWorldId)).toBe(false);
      expect(await storage.agentExists(testWorldId, testAgentId)).toBe(false);
      expect(await storage.loadAgent(testWorldId, testAgentId)).toBeNull();
    });

    it('should delete world and cascade to chats', async () => {
      // Verify chat exists before deletion
      const chatBefore = await storage.loadChatData(testWorldId, testChatId);
      expect(chatBefore).not.toBeNull();

      // Delete world
      await storage.deleteWorld(testWorldId);

      // Verify chat is deleted
      const chatAfter = await storage.loadChatData(testWorldId, testChatId);
      expect(chatAfter).toBeNull();

      const chats = await storage.listChats(testWorldId);
      expect(chats).toHaveLength(0);
    });
  });

  describe('Agent Deletion Cascade', () => {
    it('should delete agent and its memory', async () => {
      // Verify agent and memory exist
      const agentBefore = await storage.loadAgent(testWorldId, testAgentId);
      expect(agentBefore).not.toBeNull();
      expect(agentBefore?.memory).toHaveLength(2);

      // Delete agent
      const deleted = await storage.deleteAgent(testWorldId, testAgentId);
      expect(deleted).toBe(true);

      // Verify agent is deleted
      expect(await storage.agentExists(testWorldId, testAgentId)).toBe(false);
      expect(await storage.loadAgent(testWorldId, testAgentId)).toBeNull();
    });
  });

  describe('Chat Deletion Cascade', () => {
    it('should delete chat and cascade to agent memory messages', async () => {
      // Verify agent has messages for this chat
      const agentBefore = await storage.loadAgent(testWorldId, testAgentId);
      expect(agentBefore?.memory.filter(m => m.chatId === testChatId)).toHaveLength(2);

      // Delete chat
      const deleted = await storage.deleteChatData(testWorldId, testChatId);
      expect(deleted).toBe(true);

      // Verify chat is deleted
      expect(await storage.loadChatData(testWorldId, testChatId)).toBeNull();

      // Verify agent memory messages for this chat are deleted
      const agentAfter = await storage.loadAgent(testWorldId, testAgentId);
      expect(agentAfter).not.toBeNull();
      expect(agentAfter?.memory.filter(m => m.chatId === testChatId)).toHaveLength(0);
    });

    it('should preserve agent memory from other chats', async () => {
      // Add memory for a different chat
      const agent = await storage.loadAgent(testWorldId, testAgentId);
      agent!.memory.push({
        role: 'user',
        content: 'Other chat message',
        sender: 'user',
        chatId: 'other-chat',
        messageId: 'msg-3',
        createdAt: new Date(),
      });
      await storage.saveAgent(testWorldId, agent!);

      // Delete test chat
      await storage.deleteChatData(testWorldId, testChatId);

      // Verify memory from other chat is preserved
      const agentAfter = await storage.loadAgent(testWorldId, testAgentId);
      expect(agentAfter?.memory.filter(m => m.chatId === 'other-chat')).toHaveLength(1);
      expect(agentAfter?.memory.filter(m => m.chatId === testChatId)).toHaveLength(0);
    });
  });

  describe('Complex Cascade Scenarios', () => {
    it('should handle multiple agents with same chat messages', async () => {
      // Create second agent with same chat messages
      const agent2: Agent = {
        id: 'test-agent-2',
        name: 'Test Agent 2',
        type: 'chat',
        status: 'active',
        provider: 'openai' as LLMProvider,
        model: 'gpt-4',
        systemPrompt: 'Test',
        temperature: 0.7,
        maxTokens: 1000,
        llmCallCount: 0,
        createdAt: new Date(),
        lastActive: new Date(),
        memory: [
          {
            role: 'user',
            content: 'Agent 2 message',
            sender: 'user',
            chatId: testChatId,
            messageId: 'msg-4',
            createdAt: new Date(),
          },
        ],
      };
      await storage.saveAgent(testWorldId, agent2);

      // Delete chat
      await storage.deleteChatData(testWorldId, testChatId);

      // Verify both agents' chat messages are deleted
      const agent1After = await storage.loadAgent(testWorldId, testAgentId);
      const agent2After = await storage.loadAgent(testWorldId, 'test-agent-2');

      expect(agent1After?.memory.filter(m => m.chatId === testChatId)).toHaveLength(0);
      expect(agent2After?.memory.filter(m => m.chatId === testChatId)).toHaveLength(0);
    });

    it('should return count of deleted messages', async () => {
      // Create second agent
      const agent2: Agent = {
        id: 'test-agent-2',
        name: 'Test Agent 2',
        type: 'chat',
        status: 'active',
        provider: 'openai' as LLMProvider,
        model: 'gpt-4',
        systemPrompt: 'Test',
        temperature: 0.7,
        maxTokens: 1000,
        llmCallCount: 0,
        createdAt: new Date(),
        lastActive: new Date(),
        memory: [
          {
            role: 'user',
            content: 'Agent 2 message',
            sender: 'user',
            chatId: testChatId,
            messageId: 'msg-4',
            createdAt: new Date(),
          },
        ],
      };
      await storage.saveAgent(testWorldId, agent2);

      // Delete memory by chat ID (3 messages total: 2 from agent1, 1 from agent2)
      const deletedCount = await storage.deleteMemoryByChatId(testWorldId, testChatId);
      expect(deletedCount).toBe(3);
    });
  });
});
