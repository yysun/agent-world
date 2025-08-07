/**
 * Memory Storage Tests
 * 
 * Tests for the in-memory storage implementation used in non-Node environments.
 */
import { createMemoryStorage } from '../../../core/storage/memory-storage.js';
import type { StorageAPI, World, Agent, Chat, WorldChat } from '../../../core/types.js';
import { LLMProvider } from '../../../core/types.js';
import { EventEmitter } from 'events';

describe('Memory Storage', () => {
  let storage: StorageAPI;

  beforeEach(() => {
    storage = createMemoryStorage();
  });

  describe('World Operations', () => {
    const testWorld: World = {
      id: 'test-world',
      name: 'Test World',
      description: 'A test world',
      turnLimit: 3,
      createdAt: new Date(),
      lastUpdated: new Date(),
      totalAgents: 0,
      totalMessages: 0,
      eventEmitter: new EventEmitter(),
      agents: new Map(),
      chats: new Map()
    };

    test('should save and load world', async () => {
      await storage.saveWorld(testWorld);
      const loaded = await storage.loadWorld('test-world');

      expect(loaded).toEqual(testWorld);
      expect(loaded).not.toBe(testWorld); // Should be a different object (deep clone)
    });

    test('should return null for non-existent world', async () => {
      const loaded = await storage.loadWorld('non-existent');
      expect(loaded).toBeNull();
    });

    test('should check world existence', async () => {
      expect(await storage.worldExists('test-world')).toBe(false);

      await storage.saveWorld(testWorld);
      expect(await storage.worldExists('test-world')).toBe(true);
    });

    test('should delete world and cleanup related data', async () => {
      await storage.saveWorld(testWorld);

      // Add some related data
      const agent: Agent = {
        id: 'test-agent',
        name: 'Test Agent',
        type: 'assistant',
        provider: 'openai' as LLMProvider,
        model: 'gpt-4',
        systemPrompt: 'Test prompt',
        memory: [],
        llmCallCount: 0,
        createdAt: new Date(),
        lastActive: new Date()
      };
      await storage.saveAgent('test-world', agent);

      const chat: Chat = {
        id: 'test-chat',
        name: 'Test Chat',
        worldId: 'test-world',
        messageCount: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      await storage.saveChatData('test-world', chat);

      // Delete world
      const deleted = await storage.deleteWorld('test-world');
      expect(deleted).toBe(true);

      // Verify cleanup
      expect(await storage.worldExists('test-world')).toBe(false);
      expect(await storage.loadAgent('test-world', 'test-agent')).toBeNull();
      expect(await storage.loadChatData('test-world', 'test-chat')).toBeNull();
    });

    test('should list worlds', async () => {
      const world1: World = { ...testWorld, id: 'world-1' };
      const world2: World = { ...testWorld, id: 'world-2' };

      await storage.saveWorld(world1);
      await storage.saveWorld(world2);

      const worlds = await storage.listWorlds();
      expect(worlds).toHaveLength(2);
      expect(worlds.map(w => w.id)).toContain('world-1');
      expect(worlds.map(w => w.id)).toContain('world-2');
    });
  });

  describe('Agent Operations', () => {
    const testAgent: Agent = {
      id: 'test-agent',
      name: 'Test Agent',
      type: 'assistant',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4',
      systemPrompt: 'Test prompt',
      memory: [
        {
          role: 'user',
          content: 'Hello',
          sender: 'human',
          createdAt: new Date(),
          chatId: 'chat-1'
        }
      ],
      llmCallCount: 0,
      createdAt: new Date(),
      lastActive: new Date()
    };

    test('should save and load agent', async () => {
      await storage.saveAgent('test-world', testAgent);
      const loaded = await storage.loadAgent('test-world', 'test-agent');

      expect(loaded).toEqual(testAgent);
      expect(loaded).not.toBe(testAgent); // Should be a different object
    });

    test('should check agent existence', async () => {
      expect(await storage.agentExists('test-world', 'test-agent')).toBe(false);

      await storage.saveAgent('test-world', testAgent);
      expect(await storage.agentExists('test-world', 'test-agent')).toBe(true);
    });

    test('should save and load agent memory', async () => {
      await storage.saveAgent('test-world', testAgent);

      const newMemory = [
        {
          role: 'assistant' as const,
          content: 'Updated memory',
          sender: 'agent' as const,
          createdAt: new Date(),
          chatId: 'chat-1'
        }
      ];

      await storage.saveAgentMemory('test-world', 'test-agent', newMemory);
      const loaded = await storage.loadAgent('test-world', 'test-agent');

      expect(loaded?.memory).toEqual(newMemory);
    });

    test('should delete memory by chat ID', async () => {
      await storage.saveAgent('test-world', testAgent);

      const deletedCount = await storage.deleteMemoryByChatId('test-world', 'chat-1');
      expect(deletedCount).toBe(1);

      const loaded = await storage.loadAgent('test-world', 'test-agent');
      expect(loaded?.memory).toHaveLength(0);
    });

    test('should handle batch operations', async () => {
      const agents = [
        { ...testAgent, id: 'agent-1' },
        { ...testAgent, id: 'agent-2' }
      ];

      await storage.saveAgentsBatch('test-world', agents);
      const loaded = await storage.loadAgentsBatch('test-world', ['agent-1', 'agent-2']);

      expect(loaded).toHaveLength(2);
      expect(loaded.map(a => a.id)).toContain('agent-1');
      expect(loaded.map(a => a.id)).toContain('agent-2');
    });
  });

  describe('Chat Operations', () => {
    const testChat: Chat = {
      id: 'test-chat',
      name: 'Test Chat',
      worldId: 'test-world',
      messageCount: 5,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    test('should save and load chat', async () => {
      await storage.saveChatData('test-world', testChat);
      const loaded = await storage.loadChatData('test-world', 'test-chat');

      expect(loaded).toEqual(testChat);
    });

    test('should update chat data', async () => {
      await storage.saveChatData('test-world', testChat);

      const updated = await storage.updateChatData('test-world', 'test-chat', {
        name: 'Updated Chat',
        messageCount: 10
      });

      expect(updated?.name).toBe('Updated Chat');
      expect(updated?.messageCount).toBe(10);
      expect(updated?.updatedAt).toBeInstanceOf(Date);
    });

    test('should list chats', async () => {
      const chat1 = { ...testChat, id: 'chat-1' };
      const chat2 = { ...testChat, id: 'chat-2' };

      await storage.saveChatData('test-world', chat1);
      await storage.saveChatData('test-world', chat2);

      const chats = await storage.listChats('test-world');
      expect(chats).toHaveLength(2);
    });

    test('should delete chat and cleanup related data', async () => {
      await storage.saveChatData('test-world', testChat);

      const deleted = await storage.deleteChatData('test-world', 'test-chat');
      expect(deleted).toBe(true);

      const loaded = await storage.loadChatData('test-world', 'test-chat');
      expect(loaded).toBeNull();
    });
  });

  describe('World Chat Operations', () => {
    const testWorldChat: WorldChat = {
      world: {
        id: 'test-world',
        name: 'Test World',
        description: 'Test',
        turnLimit: 3,
        createdAt: new Date(),
        lastUpdated: new Date(),
        totalAgents: 0,
        totalMessages: 0,
        eventEmitter: new EventEmitter(),
        agents: new Map(),
        chats: new Map()
      },
      agents: [],
      messages: [],
      metadata: {
        capturedAt: new Date(),
        version: '1.0.0',
        totalMessages: 0,
        activeAgents: 0
      }
    };

    test('should save and load world chat', async () => {
      await storage.saveWorldChat('test-world', 'test-chat', testWorldChat);
      const loaded = await storage.loadWorldChat('test-world', 'test-chat');

      expect(loaded).toEqual(testWorldChat);
    });

    test('should restore from world chat', async () => {
      const result = await storage.restoreFromWorldChat('test-world', testWorldChat);
      expect(result).toBe(true);

      const restoredWorld = await storage.loadWorld('test-world');
      expect(restoredWorld).toEqual(testWorldChat.world);
    });
  });

  describe('Integrity Operations', () => {
    test('should validate world integrity', async () => {
      const world: World = {
        id: 'test-world',
        name: 'Test World',
        description: 'Test',
        turnLimit: 3,
        createdAt: new Date(),
        lastUpdated: new Date(),
        totalAgents: 0,
        totalMessages: 0,
        eventEmitter: new EventEmitter(),
        agents: new Map(),
        chats: new Map()
      };

      await storage.saveWorld(world);
      const isValid = await storage.validateIntegrity('test-world');
      expect(isValid).toBe(true);
    });

    test('should validate agent integrity', async () => {
      const agent: Agent = {
        id: 'test-agent',
        name: 'Test Agent',
        type: 'assistant',
        provider: LLMProvider.OPENAI,
        model: 'gpt-4',
        systemPrompt: 'Test',
        memory: [],
        llmCallCount: 0,
        createdAt: new Date(),
        lastActive: new Date()
      };

      await storage.saveAgent('test-world', agent);
      const isValid = await storage.validateIntegrity('test-world', 'test-agent');
      expect(isValid).toBe(true);
    });

    test('should repair data', async () => {
      const result = await storage.repairData('test-world');
      expect(typeof result).toBe('boolean');
    });
  });

  describe('Utility Methods', () => {
    test('should provide storage statistics', async () => {
      // Cast to access utility methods
      const memoryStorage = storage as any;

      const world: World = {
        id: 'test-world',
        name: 'Test World',
        description: 'Test',
        turnLimit: 3,
        createdAt: new Date(),
        lastUpdated: new Date(),
        totalAgents: 0,
        totalMessages: 0,
        eventEmitter: new EventEmitter(),
        agents: new Map(),
        chats: new Map()
      };

      await storage.saveWorld(world);

      const stats = memoryStorage.getStats();
      expect(stats.worlds).toBe(1);
      expect(typeof stats.totalAgents).toBe('number');
      expect(typeof stats.totalChats).toBe('number');
    });

    test('should clear all data', async () => {
      const world: World = {
        id: 'test-world',
        name: 'Test World',
        description: 'Test',
        turnLimit: 3,
        createdAt: new Date(),
        lastUpdated: new Date(),
        totalAgents: 0,
        totalMessages: 0,
        eventEmitter: new EventEmitter(),
        agents: new Map(),
        chats: new Map()
      };

      await storage.saveWorld(world);

      // Cast to access utility methods
      const memoryStorage = storage as any;
      await memoryStorage.clear();

      const loaded = await storage.loadWorld('test-world');
      expect(loaded).toBeNull();
    });
  });

  describe('Data Isolation', () => {
    test('should maintain data isolation through deep cloning', async () => {
      const originalWorld: World = {
        id: 'test-world',
        name: 'Original',
        description: 'Test',
        turnLimit: 3,
        createdAt: new Date(),
        lastUpdated: new Date(),
        totalAgents: 0,
        totalMessages: 0,
        eventEmitter: new EventEmitter(),
        agents: new Map(),
        chats: new Map()
      };

      await storage.saveWorld(originalWorld);
      const loaded = await storage.loadWorld('test-world');

      // Modify the loaded object
      loaded!.name = 'Modified';
      loaded!.description = 'Modified description';

      // Original data should be unchanged
      const reloaded = await storage.loadWorld('test-world');
      expect(reloaded!.name).toBe('Original');
      expect(reloaded!.description).toBe('Test');
    });
  });
});
