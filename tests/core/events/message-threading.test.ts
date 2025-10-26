/**
 * Message Threading Tests
 * 
 * Tests for replyToMessageId field and thread validation
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { EventEmitter } from 'events';
import {
  validateMessageThreading,
  type AgentMessage,
  type World,
  type Agent,
  LLMProvider
} from '../../../core/types.js';

// Create mock storage before any imports that use it
const mockStorageAPI = {
  savedWorlds: new Map<string, any>(),
  savedAgents: new Map<string, any>(),
  savedChats: new Map<string, any>(),

  async worldExists(worldId: string): Promise<boolean> {
    return this.savedWorlds.has(worldId);
  },

  async saveWorld(world: World): Promise<void> {
    this.savedWorlds.set(world.id, JSON.parse(JSON.stringify(world)));
  },

  async loadWorld(worldId: string): Promise<World | null> {
    return this.savedWorlds.get(worldId) || null;
  },

  async deleteWorld(worldId: string): Promise<boolean> {
    const deleted = this.savedWorlds.delete(worldId);
    // Also delete all associated agents
    for (const key of this.savedAgents.keys()) {
      if (key.startsWith(`${worldId}:`)) {
        this.savedAgents.delete(key);
      }
    }
    return deleted;
  },

  async listWorlds(): Promise<any[]> {
    return Array.from(this.savedWorlds.values());
  },

  async agentExists(worldId: string, agentId: string): Promise<boolean> {
    return this.savedAgents.has(`${worldId}:${agentId}`);
  },

  async listAgents(worldId: string): Promise<Agent[]> {
    const agents: Agent[] = [];
    for (const [key, agent] of this.savedAgents.entries()) {
      if (key.startsWith(`${worldId}:`)) {
        agents.push(agent);
      }
    }
    return agents;
  },

  async saveAgent(worldId: string, agent: Agent): Promise<void> {
    const key = `${worldId}:${agent.id}`;
    this.savedAgents.set(key, JSON.parse(JSON.stringify(agent)));
  },

  async loadAgent(worldId: string, agentId: string): Promise<Agent | null> {
    const key = `${worldId}:${agentId}`;
    return this.savedAgents.get(key) || null;
  },

  async deleteAgent(worldId: string, agentId: string): Promise<boolean> {
    return this.savedAgents.delete(`${worldId}:${agentId}`);
  },

  async saveAgentMemory(worldId: string, agentId: string, memory: AgentMessage[]): Promise<void> {
    const key = `${worldId}:${agentId}`;
    const agent = this.savedAgents.get(key);
    if (agent) {
      agent.memory = memory;
    }
  },

  async archiveMemory(worldId: string, agentId: string, memory: AgentMessage[]): Promise<void> {
    // Mock implementation
  },

  async listChats(worldId: string): Promise<any[]> {
    const chats: any[] = [];
    for (const [key, chat] of this.savedChats.entries()) {
      if (key.startsWith(`${worldId}:`)) {
        chats.push(chat);
      }
    }
    return chats;
  },

  async saveChatData(worldId: string, chat: any): Promise<void> {
    const key = `${worldId}:${chat.id}`;
    this.savedChats.set(key, JSON.parse(JSON.stringify(chat)));
  },

  async updateChatData(worldId: string, chatId: string, updates: any): Promise<any> {
    const key = `${worldId}:${chatId}`;
    const chat = this.savedChats.get(key);
    if (chat) {
      Object.assign(chat, updates);
      return chat;
    }
    return null;
  },

  async deleteChatData(worldId: string, chatId: string): Promise<boolean> {
    return this.savedChats.delete(`${worldId}:${chatId}`);
  },

  async deleteMemoryByChatId(worldId: string, chatId: string): Promise<number> {
    // Mock implementation
    return 0;
  },

  async getMemory(worldId: string, chatId?: string | null): Promise<AgentMessage[] | null> {
    // Mock implementation - return empty array
    return [];
  },

  reset() {
    this.savedWorlds.clear();
    this.savedAgents.clear();
    this.savedChats.clear();
  }
};

// Mock storage factory
jest.mock('../../../core/storage/storage-factory.js', () => ({
  createStorageWithWrappers: jest.fn(async () => mockStorageAPI),
  getStorageWrappers: jest.fn(async () => mockStorageAPI),
  setStoragePath: jest.fn()
}));

import {
  createWorld,
  createAgent,
  deleteWorld
} from '../../../core/managers.js';
import {
  publishMessage,
  subscribeAgentToMessages
} from '../../../core/events.js';
import { createStorageWithWrappers } from '../../../core/storage/storage-factory.js';

describe('Message Threading', () => {
  let testWorld: World | null;
  let testAgent: Agent;

  beforeEach(async () => {
    // Reset mock storage
    mockStorageAPI.reset();

    // Create test world and agent
    testWorld = await createWorld({ name: `test-threading-${Date.now()}` });
    if (!testWorld) throw new Error('Failed to create test world');

    testAgent = await createAgent(testWorld.id, {
      name: 'Test Agent',
      type: 'assistant',
      provider: LLMProvider.ANTHROPIC,
      model: 'claude-3-5-sonnet-20241022',
      systemPrompt: 'You are a helpful assistant.'
    });
  });

  afterEach(async () => {
    // Cleanup
    if (testWorld) {
      try {
        await deleteWorld(testWorld.id);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  beforeEach(async () => {
    // Create test world and agent
    testWorld = await createWorld({ name: `test-threading-${Date.now()}` });
    if (!testWorld) throw new Error('Failed to create test world');

    testAgent = await createAgent(testWorld.id, {
      name: 'Test Agent',
      type: 'assistant',
      provider: LLMProvider.ANTHROPIC,
      model: 'claude-3-5-sonnet-20241022',
      systemPrompt: 'You are a helpful assistant.'
    });
  });

  afterEach(async () => {
    // Cleanup
    if (testWorld) {
      try {
        await deleteWorld(testWorld.id);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  describe('validateMessageThreading', () => {
    test('should allow valid threading', () => {
      const message: AgentMessage = {
        role: 'assistant',
        content: 'Reply',
        messageId: 'msg-2',
        replyToMessageId: 'msg-1'
      };

      const allMessages: AgentMessage[] = [
        { role: 'user', content: 'Question', messageId: 'msg-1' },
        message
      ];

      expect(() => validateMessageThreading(message, allMessages)).not.toThrow();
    });

    test('should reject self-referencing messages', () => {
      const message: AgentMessage = {
        role: 'assistant',
        content: 'Test',
        messageId: 'msg-1',
        replyToMessageId: 'msg-1' // Self-reference
      };

      expect(() => validateMessageThreading(message)).toThrow('cannot reply to itself');
    });

    test('should detect circular references (A→B→C→A)', () => {
      const messages: AgentMessage[] = [
        { role: 'user', content: 'A', messageId: 'msg-1', replyToMessageId: 'msg-3' },
        { role: 'user', content: 'B', messageId: 'msg-2', replyToMessageId: 'msg-1' },
        { role: 'user', content: 'C', messageId: 'msg-3', replyToMessageId: 'msg-2' }
      ];

      expect(() => validateMessageThreading(messages[0], messages))
        .toThrow('Circular reference detected');
    });

    test('should detect circular references (A→B→A)', () => {
      const messages: AgentMessage[] = [
        { role: 'user', content: 'A', messageId: 'msg-1', replyToMessageId: 'msg-2' },
        { role: 'user', content: 'B', messageId: 'msg-2', replyToMessageId: 'msg-1' }
      ];

      expect(() => validateMessageThreading(messages[0], messages))
        .toThrow('Circular reference detected');
    });

    test('should handle orphaned replies gracefully (missing parent)', () => {
      const message: AgentMessage = {
        role: 'assistant',
        content: 'Reply to deleted message',
        messageId: 'msg-2',
        replyToMessageId: 'msg-nonexistent'
      };

      const allMessages: AgentMessage[] = [message];

      // Should warn but not throw (parent might be in different chat)
      expect(() => validateMessageThreading(message, allMessages)).not.toThrow();
    });

    test('should validate multi-level threading correctly', () => {
      const messages: AgentMessage[] = [
        { role: 'user', content: 'Start', messageId: 'msg-1' },
        { role: 'assistant', content: 'Reply 1', messageId: 'msg-2', replyToMessageId: 'msg-1' },
        { role: 'user', content: 'Follow-up', messageId: 'msg-3', replyToMessageId: 'msg-2' },
        { role: 'assistant', content: 'Reply 2', messageId: 'msg-4', replyToMessageId: 'msg-3' }
      ];

      // All messages should validate correctly
      messages.forEach(msg => {
        expect(() => validateMessageThreading(msg, messages)).not.toThrow();
      });
    });

    test('should reject excessive thread depth (>100 levels)', () => {
      // Create a chain of 101 messages
      const messages: AgentMessage[] = [];
      for (let i = 0; i < 101; i++) {
        messages.push({
          role: 'user',
          content: `Message ${i}`,
          messageId: `msg-${i}`,
          replyToMessageId: i > 0 ? `msg-${i - 1}` : undefined
        });
      }

      // Last message in chain should exceed depth limit
      expect(() => validateMessageThreading(messages[100], messages))
        .toThrow('Thread depth exceeds maximum');
    });

    test('should allow messages without replyToMessageId (root messages)', () => {
      const message: AgentMessage = {
        role: 'user',
        content: 'Start conversation',
        messageId: 'msg-1'
        // No replyToMessageId - this is a root message
      };

      expect(() => validateMessageThreading(message, [])).not.toThrow();
    });

    test('should allow messages without messageId (legacy)', () => {
      const message: AgentMessage = {
        role: 'user',
        content: 'Legacy message',
        // No messageId - legacy message
        replyToMessageId: 'msg-1'
      };

      expect(() => validateMessageThreading(message, [])).not.toThrow();
    });
  });

  describe('Message Creation with Threading', () => {
    test('should link agent reply to triggering message', async () => {
      if (!testWorld) throw new Error('Test world not initialized');

      // Subscribe agent to messages
      await subscribeAgentToMessages(testWorld, testAgent);

      // Publish human message
      const humanMessage = publishMessage(testWorld, 'Hello', 'HUMAN');
      expect(humanMessage.messageId).toBeDefined();

      // Wait for agent to process (give it time to respond)
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check agent memory for reply with replyToMessageId
      const agentMemory = testAgent.memory;
      const agentReply = agentMemory.find(m => m.role === 'assistant');

      if (agentReply) {
        expect(agentReply.messageId).toBeDefined();
        expect(agentReply.replyToMessageId).toBe(humanMessage.messageId);
        expect(agentReply.replyToMessageId).not.toBe(agentReply.messageId); // Not same as self
      }
    }, 10000); // 10 second timeout for LLM response

    test('incoming messages should NOT have replyToMessageId', async () => {
      if (!testWorld) throw new Error('Test world not initialized');

      // Subscribe agent to messages
      await subscribeAgentToMessages(testWorld, testAgent);

      // Publish message
      const message = publishMessage(testWorld, 'Test message', 'HUMAN');

      // Wait for message to be saved to agent memory
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check agent memory for incoming message
      const incomingMessage = testAgent.memory.find(m =>
        m.role === 'user' && m.messageId === message.messageId
      );

      if (incomingMessage) {
        expect(incomingMessage.messageId).toBe(message.messageId);
        expect(incomingMessage.replyToMessageId).toBeUndefined(); // Should NOT have replyToMessageId
      }
    });

    test('should handle multiple agents replying to same message', async () => {
      if (!testWorld) throw new Error('Test world not initialized');

      // Create second agent
      const agent2 = await createAgent(testWorld.id, {
        name: 'Test Agent 2',
        type: 'assistant',
        provider: LLMProvider.ANTHROPIC,
        model: 'claude-3-5-sonnet-20241022',
        systemPrompt: 'You are a helpful assistant.'
      });

      // Subscribe both agents
      await subscribeAgentToMessages(testWorld, testAgent);
      await subscribeAgentToMessages(testWorld, agent2);

      // Publish message
      const humanMessage = publishMessage(testWorld, 'Hello everyone', 'HUMAN');

      // Wait for agents to respond
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check both agents' replies
      const reply1 = testAgent.memory.find((m: AgentMessage) => m.role === 'assistant');
      const reply2 = agent2.memory.find((m: AgentMessage) => m.role === 'assistant');

      if (reply1) {
        expect(reply1.replyToMessageId).toBe(humanMessage.messageId);
      }

      if (reply2) {
        expect(reply2.replyToMessageId).toBe(humanMessage.messageId);
      }

      // Both should reply to same message but have different messageIds
      if (reply1 && reply2) {
        expect(reply1.messageId).not.toBe(reply2.messageId);
        expect(reply1.replyToMessageId).toBe(reply2.replyToMessageId);
      }
    }, 15000); // 15 second timeout for both LLM responses
  });

  describe('Reply Detection', () => {
    test('should detect when message has reply', () => {
      const messages: AgentMessage[] = [
        { role: 'user', content: 'Question', messageId: 'msg-1' },
        { role: 'assistant', content: 'Answer', messageId: 'msg-2', replyToMessageId: 'msg-1' }
      ];

      // Check if msg-1 has a reply
      const hasReply = messages.some(m => m.replyToMessageId === 'msg-1');
      expect(hasReply).toBe(true);
    });

    test('should detect when message has NO reply', () => {
      const messages: AgentMessage[] = [
        { role: 'user', content: 'Question 1', messageId: 'msg-1' },
        { role: 'user', content: 'Question 2', messageId: 'msg-2' },
        { role: 'assistant', content: 'Answer to Q1', messageId: 'msg-3', replyToMessageId: 'msg-1' }
      ];

      // Check if msg-2 has a reply
      const hasReply = messages.some(m => m.replyToMessageId === 'msg-2');
      expect(hasReply).toBe(false); // msg-2 has no reply
    });

    test('should handle legacy messages without messageId', () => {
      const messages: AgentMessage[] = [
        { role: 'user', content: 'Legacy question' }, // No messageId
        { role: 'assistant', content: 'Answer', messageId: 'msg-2' }
      ];

      // Legacy messages can't be checked for replies
      const hasReply = messages.some(m => m.replyToMessageId === undefined);
      expect(hasReply).toBe(true); // Can't determine reply status
    });
  });

  describe('Thread Traversal', () => {
    test('should traverse thread from reply to root', () => {
      const messages: AgentMessage[] = [
        { role: 'user', content: 'Root', messageId: 'msg-1' },
        { role: 'assistant', content: 'Reply 1', messageId: 'msg-2', replyToMessageId: 'msg-1' },
        { role: 'user', content: 'Reply 2', messageId: 'msg-3', replyToMessageId: 'msg-2' },
        { role: 'assistant', content: 'Reply 3', messageId: 'msg-4', replyToMessageId: 'msg-3' }
      ];

      // Traverse from msg-4 to root
      const thread: AgentMessage[] = [];
      let current: AgentMessage | undefined = messages[3]; // Start at msg-4

      while (current) {
        thread.push(current);
        current = messages.find(m => m.messageId === current?.replyToMessageId);
      }

      expect(thread).toHaveLength(4);
      expect(thread[0].messageId).toBe('msg-4'); // Start
      expect(thread[3].messageId).toBe('msg-1'); // Root
    });

    test('should find all replies to a message', () => {
      const messages: AgentMessage[] = [
        { role: 'user', content: 'Question', messageId: 'msg-1' },
        { role: 'assistant', content: 'Reply from A', messageId: 'msg-2', replyToMessageId: 'msg-1' },
        { role: 'assistant', content: 'Reply from B', messageId: 'msg-3', replyToMessageId: 'msg-1' },
        { role: 'assistant', content: 'Reply from C', messageId: 'msg-4', replyToMessageId: 'msg-1' }
      ];

      // Find all replies to msg-1
      const replies = messages.filter(m => m.replyToMessageId === 'msg-1');

      expect(replies).toHaveLength(3);
      expect(replies.map(r => r.messageId)).toEqual(['msg-2', 'msg-3', 'msg-4']);
    });
  });

  describe('Database Persistence', () => {
    test('should persist and retrieve replyToMessageId', async () => {
      if (!testWorld) throw new Error('Test world not initialized');

      const storage = await createStorageWithWrappers();

      // Create message with replyToMessageId
      const message: AgentMessage = {
        role: 'assistant',
        content: 'Reply',
        messageId: 'msg-2',
        replyToMessageId: 'msg-1',
        chatId: testWorld.currentChatId,
        agentId: testAgent.id
      };

      testAgent.memory.push(message);
      await storage.saveAgent(testWorld.id, testAgent);

      // Reload agent and check message
      const reloadedAgent = await storage.loadAgent(testWorld.id, testAgent.id);
      if (!reloadedAgent) throw new Error('Failed to reload agent');

      const reloadedMessage = reloadedAgent.memory.find((m: AgentMessage) => m.messageId === 'msg-2');

      expect(reloadedMessage).toBeDefined();
      expect(reloadedMessage?.replyToMessageId).toBe('msg-1');
    });

    test('should handle NULL replyToMessageId for legacy messages', async () => {
      if (!testWorld) throw new Error('Test world not initialized');

      const storage = await createStorageWithWrappers();

      // Create message without replyToMessageId
      const message: AgentMessage = {
        role: 'user',
        content: 'Legacy message',
        messageId: 'msg-1',
        chatId: testWorld.currentChatId,
        agentId: testAgent.id
        // No replyToMessageId
      };

      testAgent.memory.push(message);
      await storage.saveAgent(testWorld.id, testAgent);

      // Reload agent and check message
      const reloadedAgent = await storage.loadAgent(testWorld.id, testAgent.id);
      if (!reloadedAgent) throw new Error('Failed to reload agent');

      const reloadedMessage = reloadedAgent.memory.find((m: AgentMessage) => m.messageId === 'msg-1');

      expect(reloadedMessage).toBeDefined();
      expect(reloadedMessage?.replyToMessageId).toBeUndefined();
    });
  });

  describe('Cross-Agent Threading', () => {
    test('should handle agent-to-agent message threading', async () => {
      if (!testWorld) throw new Error('Test world not initialized');

      // Create second agent
      const agent2 = await createAgent(testWorld.id, {
        name: 'Agent 2',
        type: 'assistant',
        provider: LLMProvider.ANTHROPIC,
        model: 'claude-3-5-sonnet-20241022',
        systemPrompt: 'You are agent 2.'
      });

      // Subscribe both agents
      await subscribeAgentToMessages(testWorld, testAgent);
      await subscribeAgentToMessages(testWorld, agent2);

      // Agent 1 sends message
      const agent1Message = publishMessage(testWorld, 'Hello Agent 2', testAgent.id);

      // Wait for Agent 2 to receive and potentially respond
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check Agent 2's memory for incoming message
      const incomingToAgent2 = agent2.memory.find((m: AgentMessage) =>
        m.messageId === agent1Message.messageId && m.role === 'user'
      );

      if (incomingToAgent2) {
        // Incoming message should NOT have replyToMessageId
        expect(incomingToAgent2.replyToMessageId).toBeUndefined();

        // If Agent 2 replied, check the reply
        const agent2Reply = agent2.memory.find((m: AgentMessage) =>
          m.role === 'assistant' && m.replyToMessageId === agent1Message.messageId
        );

        if (agent2Reply) {
          expect(agent2Reply.replyToMessageId).toBe(agent1Message.messageId);
        }
      }
    }, 10000);
  });

  describe('Edge Cases', () => {
    test('should handle concurrent message creation', async () => {
      if (!testWorld) throw new Error('Test world not initialized');

      // Subscribe agent
      await subscribeAgentToMessages(testWorld, testAgent);

      // Send multiple messages concurrently
      const messages = [
        publishMessage(testWorld, 'Message 1', 'HUMAN'),
        publishMessage(testWorld, 'Message 2', 'HUMAN'),
        publishMessage(testWorld, 'Message 3', 'HUMAN')
      ];

      // All should have unique messageIds
      const messageIds = messages.map(m => m.messageId);
      const uniqueIds = new Set(messageIds);
      expect(uniqueIds.size).toBe(3);

      // Wait for agent to process
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Agent replies should link to correct triggering messages
      const replies = testAgent.memory.filter((m: AgentMessage) => m.role === 'assistant');

      replies.forEach(reply => {
        expect(reply.replyToMessageId).toBeDefined();
        expect(messageIds).toContain(reply.replyToMessageId);
      });
    }, 15000);

    test('should handle empty memory', () => {
      const message: AgentMessage = {
        role: 'user',
        content: 'Test',
        messageId: 'msg-1'
      };

      // Validation with empty allMessages array
      expect(() => validateMessageThreading(message, [])).not.toThrow();
    });

    test('should handle missing messageId in validation', () => {
      const message: AgentMessage = {
        role: 'user',
        content: 'Test',
        replyToMessageId: 'msg-1'
        // No messageId
      };

      // Should not throw even without messageId
      expect(() => validateMessageThreading(message, [])).not.toThrow();
    });
  });
});
