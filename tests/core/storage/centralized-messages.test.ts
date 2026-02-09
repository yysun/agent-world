/**
 * Tests for centralized chat message storage
 * 
 * Verifies that messages can be saved and retrieved from the centralized
 * chat_messages table/storage instead of being duplicated in agent memory.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createMemoryStorage } from '../../../core/storage/memory-storage.js';
import type { StorageAPI, AgentMessage } from '../../../core/types.js';
import { generateId } from '../../../core/utils.js';

describe('Centralized Chat Message Storage', () => {
  let storage: StorageAPI;
  const worldId = 'test-world';
  const chatId = 'test-chat';

  beforeEach(async () => {
    storage = createMemoryStorage();
    
    // Create a test world
    await storage.saveWorld({
      id: worldId,
      name: 'Test World',
      turnLimit: 5,
      description: 'Test world for message storage'
    } as any);
  });

  afterEach(async () => {
    if (storage && 'clear' in storage) {
      await (storage as any).clear();
    }
  });

  describe('saveChatMessage', () => {
    it('should save a message to centralized storage', async () => {
      const message: AgentMessage = {
        messageId: generateId(),
        role: 'user',
        content: 'Hello, world!',
        sender: 'human',
        chatId,
        worldId,
        createdAt: new Date()
      };

      await storage.saveChatMessage(worldId, chatId, message);
      
      const messages = await storage.getChatMessages(worldId, chatId);
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('Hello, world!');
      expect(messages[0].messageId).toBe(message.messageId);
    });

    it('should update existing message by messageId (upsert)', async () => {
      const messageId = generateId();
      const message: AgentMessage = {
        messageId,
        role: 'user',
        content: 'Original content',
        sender: 'human',
        chatId,
        worldId,
        createdAt: new Date()
      };

      await storage.saveChatMessage(worldId, chatId, message);
      
      // Update with same messageId
      const updatedMessage: AgentMessage = {
        ...message,
        content: 'Updated content'
      };
      await storage.saveChatMessage(worldId, chatId, updatedMessage);
      
      const messages = await storage.getChatMessages(worldId, chatId);
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('Updated content');
    });

    it('should require messageId', async () => {
      const message: AgentMessage = {
        role: 'user',
        content: 'No messageId',
        sender: 'human',
        chatId,
        worldId,
        createdAt: new Date()
      } as any;

      await expect(storage.saveChatMessage(worldId, chatId, message))
        .rejects.toThrow('messageId');
    });

    it('should handle tool calls and tool responses', async () => {
      const toolCallMessage: AgentMessage = {
        messageId: generateId(),
        role: 'assistant',
        content: '',
        sender: 'agent-1',
        chatId,
        worldId,
        tool_calls: [{
          id: 'call_123',
          type: 'function',
          function: {
            name: 'get_weather',
            arguments: '{"city":"London"}'
          }
        }],
        createdAt: new Date()
      };

      await storage.saveChatMessage(worldId, chatId, toolCallMessage);
      
      const toolResultMessage: AgentMessage = {
        messageId: generateId(),
        role: 'tool',
        content: 'Temperature: 20°C',
        sender: 'system',
        chatId,
        worldId,
        tool_call_id: 'call_123',
        createdAt: new Date()
      };

      await storage.saveChatMessage(worldId, chatId, toolResultMessage);
      
      const messages = await storage.getChatMessages(worldId, chatId);
      expect(messages).toHaveLength(2);
      expect(messages[0].tool_calls).toBeDefined();
      expect(messages[1].tool_call_id).toBe('call_123');
    });

    it('should maintain message order by createdAt', async () => {
      const now = new Date();
      const messages: AgentMessage[] = [
        {
          messageId: generateId(),
          role: 'user',
          content: 'First',
          sender: 'human',
          chatId,
          worldId,
          createdAt: new Date(now.getTime() + 1000)
        },
        {
          messageId: generateId(),
          role: 'assistant',
          content: 'Second',
          sender: 'agent-1',
          chatId,
          worldId,
          createdAt: new Date(now.getTime() + 2000)
        },
        {
          messageId: generateId(),
          role: 'user',
          content: 'Third',
          sender: 'human',
          chatId,
          worldId,
          createdAt: new Date(now.getTime() + 3000)
        }
      ];

      // Save in random order
      await storage.saveChatMessage(worldId, chatId, messages[1]);
      await storage.saveChatMessage(worldId, chatId, messages[0]);
      await storage.saveChatMessage(worldId, chatId, messages[2]);
      
      const retrieved = await storage.getChatMessages(worldId, chatId);
      expect(retrieved).toHaveLength(3);
      expect(retrieved[0].content).toBe('First');
      expect(retrieved[1].content).toBe('Second');
      expect(retrieved[2].content).toBe('Third');
    });
  });

  describe('getChatMessages', () => {
    it('should return empty array for non-existent chat', async () => {
      const messages = await storage.getChatMessages(worldId, 'non-existent-chat');
      expect(messages).toEqual([]);
    });

    it('should return all messages for a chat', async () => {
      const message1: AgentMessage = {
        messageId: generateId(),
        role: 'user',
        content: 'Message 1',
        sender: 'human',
        chatId,
        worldId,
        createdAt: new Date()
      };

      const message2: AgentMessage = {
        messageId: generateId(),
        role: 'assistant',
        content: 'Message 2',
        sender: 'agent-1',
        chatId,
        worldId,
        createdAt: new Date()
      };

      await storage.saveChatMessage(worldId, chatId, message1);
      await storage.saveChatMessage(worldId, chatId, message2);
      
      const messages = await storage.getChatMessages(worldId, chatId);
      expect(messages).toHaveLength(2);
    });

    it('should isolate messages by chat', async () => {
      const chat1Id = 'chat-1';
      const chat2Id = 'chat-2';

      await storage.saveChatMessage(worldId, chat1Id, {
        messageId: generateId(),
        role: 'user',
        content: 'Chat 1 message',
        sender: 'human',
        chatId: chat1Id,
        worldId,
        createdAt: new Date()
      });

      await storage.saveChatMessage(worldId, chat2Id, {
        messageId: generateId(),
        role: 'user',
        content: 'Chat 2 message',
        sender: 'human',
        chatId: chat2Id,
        worldId,
        createdAt: new Date()
      });

      const chat1Messages = await storage.getChatMessages(worldId, chat1Id);
      const chat2Messages = await storage.getChatMessages(worldId, chat2Id);

      expect(chat1Messages).toHaveLength(1);
      expect(chat2Messages).toHaveLength(1);
      expect(chat1Messages[0].content).toBe('Chat 1 message');
      expect(chat2Messages[0].content).toBe('Chat 2 message');
    });
  });

  describe('getAgentMemoryForChat', () => {
    it('should return all messages for a specific chat', async () => {
      const agentId = 'agent-1';
      
      await storage.saveChatMessage(worldId, chatId, {
        messageId: generateId(),
        role: 'user',
        content: 'Hello',
        sender: 'human',
        chatId,
        worldId,
        createdAt: new Date()
      });

      await storage.saveChatMessage(worldId, chatId, {
        messageId: generateId(),
        role: 'assistant',
        content: 'Hi there',
        sender: agentId,
        chatId,
        worldId,
        createdAt: new Date()
      });

      const memory = await storage.getAgentMemoryForChat(worldId, agentId, chatId);
      expect(memory).toHaveLength(2);
    });

    it('should return empty array for non-existent chat', async () => {
      const memory = await storage.getAgentMemoryForChat(worldId, 'agent-1', 'non-existent');
      expect(memory).toEqual([]);
    });
  });

  describe('deleteChatMessage', () => {
    it('should delete a message by messageId', async () => {
      const messageId = generateId();
      await storage.saveChatMessage(worldId, chatId, {
        messageId,
        role: 'user',
        content: 'To be deleted',
        sender: 'human',
        chatId,
        worldId,
        createdAt: new Date()
      });

      const deleted = await storage.deleteChatMessage(worldId, chatId, messageId);
      expect(deleted).toBe(true);

      const messages = await storage.getChatMessages(worldId, chatId);
      expect(messages).toHaveLength(0);
    });

    it('should return false for non-existent message', async () => {
      const deleted = await storage.deleteChatMessage(worldId, chatId, 'non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('updateChatMessage', () => {
    it('should update message content', async () => {
      const messageId = generateId();
      await storage.saveChatMessage(worldId, chatId, {
        messageId,
        role: 'user',
        content: 'Original',
        sender: 'human',
        chatId,
        worldId,
        createdAt: new Date()
      });

      const updated = await storage.updateChatMessage(worldId, chatId, messageId, {
        content: 'Updated'
      });
      expect(updated).toBe(true);

      const messages = await storage.getChatMessages(worldId, chatId);
      expect(messages[0].content).toBe('Updated');
    });

    it('should return false for non-existent message', async () => {
      const updated = await storage.updateChatMessage(worldId, chatId, 'non-existent', {
        content: 'Updated'
      });
      expect(updated).toBe(false);
    });
  });

  describe('Message Deduplication Benefit', () => {
    it('should demonstrate that messages are stored once, not per agent', async () => {
      // Save one message to centralized storage
      const messageId = generateId();
      await storage.saveChatMessage(worldId, chatId, {
        messageId,
        role: 'user',
        content: 'Hello to all agents',
        sender: 'human',
        chatId,
        worldId,
        createdAt: new Date()
      });

      // Multiple agents can access the same message
      const agent1Memory = await storage.getAgentMemoryForChat(worldId, 'agent-1', chatId);
      const agent2Memory = await storage.getAgentMemoryForChat(worldId, 'agent-2', chatId);
      const agent3Memory = await storage.getAgentMemoryForChat(worldId, 'agent-3', chatId);

      // All agents see the same message without duplication
      expect(agent1Memory).toHaveLength(1);
      expect(agent2Memory).toHaveLength(1);
      expect(agent3Memory).toHaveLength(1);
      
      // Verify it's the same message
      expect(agent1Memory[0].messageId).toBe(messageId);
      expect(agent2Memory[0].messageId).toBe(messageId);
      expect(agent3Memory[0].messageId).toBe(messageId);
    });
  });
});
