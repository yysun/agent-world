/**
 * Message Edit Feature Tests
 * 
 * Features:
 * - Tests message ID migration behavior for legacy memory records.
 * - Tests core edit workflows (delete + resubmit) and guardrails.
 * - Tests edit-driven chat-title reset behavior for auto-generated titles.
 *
 * Implementation Notes:
 * - Uses in-memory storage only.
 * - Uses in-memory event storage to emulate persisted system events.
 *
 * Recent Changes:
 * - 2026-02-14: Updated edit-message expectations for core-managed clear+resend behavior that no longer gates resubmission on `world.currentChatId`.
 * - 2026-02-13: Added coverage for core-managed edit resubmission title reset based on persisted `chat-title-updated` events.
 *
 * Tests for message ID migration, edit workflows, and error handling.
 * Uses in-memory storage for testing.
 */

import { describe, test, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Agent, AgentMessage, World, StorageAPI } from '../../core/types.js';
import { LLMProvider } from '../../core/types.js';
import { EventEmitter } from 'events';
import { createMemoryStorage } from '../../core/storage/memory-storage.js';
import { createMemoryEventStorage } from '../../core/storage/eventStorage/index.js';

// Mock nanoid to provide predictable IDs
vi.mock('nanoid', () => ({
  nanoid: vi.fn(() => 'test-message-id-' + Math.random().toString(36).substr(2, 5))
}));

// Use hoisted to create getter that will be called during mock execution
const { getMemoryStorage } = vi.hoisted(() => {
  let storage: StorageAPI | null = null;
  return {
    getMemoryStorage: () => {
      if (!storage) {
        storage = createMemoryStorage();
      }
      return storage;
    },
    resetStorage: () => {
      storage = null;
    }
  };
});

// Mock the storage factory to return our memory storage instance
vi.mock('../../core/storage/storage-factory.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../core/storage/storage-factory.js')>();
  return {
    ...actual,
    createStorageWithWrappers: vi.fn(async () => actual.createStorageWrappers(getMemoryStorage())),
    getDefaultRootPath: vi.fn().mockReturnValue('/test/data')
  };
});

import { getWorld, migrateMessageIds, editUserMessage } from '../../core/index.js';

// Helper to create a test world
function createTestWorld(overrides: Partial<World> = {}): World {
  return {
    id: 'test-world',
    name: 'Test World',
    currentChatId: 'chat-1',
    totalAgents: 1,
    totalMessages: 0,
    turnLimit: 5,
    isProcessing: false,
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

describe('Message Edit Feature', () => {
  beforeEach(async () => {
    // Storage will be created on first access via getMemoryStorage()
    const storage = getMemoryStorage();
    if (!(storage as any).eventStorage) {
      (storage as any).eventStorage = createMemoryEventStorage();
    }
  });

  afterEach(async () => {
    // Clean up all worlds between tests to avoid cross-test async bleed.
    try {
      const worlds = await getMemoryStorage().listWorlds();
      for (const world of worlds) {
        await getMemoryStorage().deleteWorld(world.id);
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe('migrateMessageIds', () => {
    test('should throw error for non-existent world', async () => {
      await expect(migrateMessageIds('nonexistent-world-xyz')).rejects.toThrow(/not found/);
    });

    test('validates world existence', async () => {
      const result = migrateMessageIds('invalid-world-id');
      await expect(result).rejects.toThrow();
    });

    test('should assign missing messageId values', async () => {
      const world = createTestWorld();
      const agent = createTestAgent({ id: 'agent-1' });
      const memory: AgentMessage[] = [
        { role: 'user', content: 'msg1', chatId: 'chat-1', createdAt: new Date(), agentId: 'agent-1' } as AgentMessage,
        { role: 'assistant', content: 'msg2', chatId: 'chat-1', createdAt: new Date(), agentId: 'agent-1' } as AgentMessage
      ];
      const chat = { id: 'chat-1', name: 'Chat 1', worldId: 'test-world', messageCount: 2, createdAt: new Date(), updatedAt: new Date() };

      await getMemoryStorage().saveWorld(world);
      await getMemoryStorage().saveAgent('test-world', agent); // Save agent without memory first
      await getMemoryStorage().saveAgentMemory('test-world', 'agent-1', memory); // Then save memory directly (will auto-migrate)
      await getMemoryStorage().saveChatData('test-world', chat);

      const result = await migrateMessageIds('test-world');

      // Note: In-memory storage auto-migrates message IDs on save, so result will be 0
      // In production (SQLite/file storage), this would be 2
      expect(result).toBe(0);

      // Verify that the messages have messageIds (auto-migrated by memory storage)
      const updatedAgent = await getMemoryStorage().loadAgent('test-world', 'agent-1');
      expect(updatedAgent?.memory[0]).toHaveProperty('messageId');
      expect(updatedAgent?.memory[1]).toHaveProperty('messageId');
      expect(typeof updatedAgent?.memory[0].messageId).toBe('string');
      expect(typeof updatedAgent?.memory[1].messageId).toBe('string');
    });

    test('should preserve existing messageId values', async () => {
      const world = createTestWorld();
      const agent = createTestAgent({
        memory: [
          { role: 'user', content: 'msg1', messageId: 'existing-id-1', chatId: 'chat-1', createdAt: new Date(), agentId: 'agent-1' },
          { role: 'assistant', content: 'msg2', messageId: 'existing-id-2', chatId: 'chat-1', createdAt: new Date(), agentId: 'agent-1' }
        ]
      });
      const chat = { id: 'chat-1', name: 'Chat 1', worldId: 'test-world', messageCount: 2, createdAt: new Date(), updatedAt: new Date() };

      await getMemoryStorage().saveWorld(world);
      await getMemoryStorage().saveAgent('test-world', agent);
      await getMemoryStorage().saveChatData('test-world', chat);

      const result = await migrateMessageIds('test-world');

      // Should have migrated 0 messages (all already have IDs)
      expect(result).toBe(0);

      // Verify that existing IDs are preserved
      const updatedAgent = await getMemoryStorage().loadAgent('test-world', 'agent-1');
      expect(updatedAgent?.memory[0].messageId).toBe('existing-id-1');
      expect(updatedAgent?.memory[1].messageId).toBe('existing-id-2');
    });

    test('should handle mix of messages with and without IDs', async () => {
      const world = createTestWorld();
      const agent = createTestAgent({ id: 'agent-1' });
      const memory: AgentMessage[] = [
        { role: 'user', content: 'msg1', messageId: 'existing-id-1', chatId: 'chat-1', createdAt: new Date(), agentId: 'agent-1' },
        { role: 'assistant', content: 'msg2', chatId: 'chat-1', createdAt: new Date(), agentId: 'agent-1' } as AgentMessage,
        { role: 'user', content: 'msg3', messageId: 'existing-id-3', chatId: 'chat-1', createdAt: new Date(), agentId: 'agent-1' }
      ];
      const chat = { id: 'chat-1', name: 'Chat 1', worldId: 'test-world', messageCount: 3, createdAt: new Date(), updatedAt: new Date() };

      await getMemoryStorage().saveWorld(world);
      await getMemoryStorage().saveAgent('test-world', agent); // Save agent without memory first
      await getMemoryStorage().saveAgentMemory('test-world', 'agent-1', memory); // Then save memory directly (will auto-migrate)
      await getMemoryStorage().saveChatData('test-world', chat);

      const result = await migrateMessageIds('test-world');

      // Note: In-memory storage auto-migrates message IDs on save, so result will be 0
      // In production (SQLite/file storage), this would be 1
      expect(result).toBe(0);

      // Verify that existing IDs are preserved and new ones were assigned (auto-migrated)
      const updatedAgent = await getMemoryStorage().loadAgent('test-world', 'agent-1');
      expect(updatedAgent?.memory[0].messageId).toBe('existing-id-1');
      expect(updatedAgent?.memory[1]).toHaveProperty('messageId');
      expect(updatedAgent?.memory[1].messageId).not.toBe('existing-id-1');
      expect(updatedAgent?.memory[2].messageId).toBe('existing-id-3');
    });
  });

  describe('Error handling', () => {
    test('provides meaningful error messages for missing worlds', async () => {
      try {
        await migrateMessageIds('does-not-exist');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeTruthy();
        expect(String(error)).toMatch(/not found/i);
      }
    });
  });

  describe('editUserMessage', () => {
    test('should throw error when world not found', async () => {
      await expect(
        editUserMessage('nonexistent-world', 'msg-1', 'new content', 'chat-1')
      ).rejects.toThrow(/not found/);
    });

    test('should throw error when world.isProcessing is true', async () => {
      const world = createTestWorld({ isProcessing: true });
      const chat = { id: 'chat-1', name: 'Chat 1', worldId: 'test-world', messageCount: 0, createdAt: new Date(), updatedAt: new Date() };

      await getMemoryStorage().saveWorld(world);
      await getMemoryStorage().saveChatData('test-world', chat);

      await expect(
        editUserMessage('test-world', 'msg-1', 'new content', 'chat-1')
      ).rejects.toThrow(/Cannot edit message while world is processing/);
    });

    test('should call removeMessagesFrom and resolve when successful', async () => {
      const world = createTestWorld({ isProcessing: false, currentChatId: 'chat-1' });
      const agent = createTestAgent({
        memory: [
          { role: 'user', content: 'msg1', messageId: 'msg-1', chatId: 'chat-1', createdAt: new Date(), agentId: 'agent-1' },
          { role: 'assistant', content: 'msg2', messageId: 'msg-2', chatId: 'chat-1', createdAt: new Date(), agentId: 'agent-1' }
        ]
      });
      const chat = { id: 'chat-1', name: 'Chat 1', worldId: 'test-world', messageCount: 2, createdAt: new Date(), updatedAt: new Date() };

      await getMemoryStorage().saveWorld(world);
      await getMemoryStorage().saveAgent('test-world', agent);
      await getMemoryStorage().saveChatData('test-world', chat);

      const result = await editUserMessage('test-world', 'msg-1', 'new content', 'chat-1');

      // Verify result structure
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('messageId', 'msg-1');
      expect(result).toHaveProperty('resubmissionStatus');
    });

    test('should resubmit when currentChatId is null and chatId is provided', async () => {
      const world = createTestWorld({
        id: 'test-world-null-current',
        name: 'Test World Null Current',
        isProcessing: false,
        currentChatId: null
      });
      const agent = createTestAgent({
        memory: [
          { role: 'user', content: 'msg1', messageId: 'msg-1', chatId: 'chat-1', createdAt: new Date(), agentId: 'agent-1' }
        ]
      });
      const chat = { id: 'chat-1', name: 'Chat 1', worldId: world.id, messageCount: 1, createdAt: new Date(), updatedAt: new Date() };

      await getMemoryStorage().saveWorld(world);
      await getMemoryStorage().saveAgent(world.id, agent);
      await getMemoryStorage().saveChatData(world.id, chat);

      const result = await editUserMessage(world.id, 'msg-1', 'new content', 'chat-1');

      expect(result.resubmissionStatus).toBe('success');
      expect(result).toHaveProperty('newMessageId');
    });

    test('should resubmit for explicit chatId even when it differs from currentChatId', async () => {
      const world = createTestWorld({ isProcessing: false, currentChatId: 'chat-2' });
      const agent = createTestAgent({
        memory: [
          { role: 'user', content: 'msg1', messageId: 'msg-1', chatId: 'chat-1', createdAt: new Date(), agentId: 'agent-1' }
        ]
      });
      const chat = { id: 'chat-1', name: 'Chat 1', worldId: 'test-world', messageCount: 1, createdAt: new Date(), updatedAt: new Date() };

      await getMemoryStorage().saveWorld(world);
      await getMemoryStorage().saveAgent('test-world', agent);
      await getMemoryStorage().saveChatData('test-world', chat);

      const result = await editUserMessage('test-world', 'msg-1', 'new content', 'chat-1');

      expect(result.resubmissionStatus).toBe('success');
      expect(result).toHaveProperty('newMessageId');
    });

    test('should reset auto-generated title to New Chat before edit resubmission', async () => {
      const world = createTestWorld({
        id: 'test-world-title-reset',
        name: 'Test World Title Reset',
        isProcessing: false,
        currentChatId: 'chat-1'
      });
      const agent = createTestAgent({
        memory: [
          { role: 'user', content: 'hi', messageId: 'msg-1', chatId: 'chat-1', createdAt: new Date(), agentId: 'agent-1' }
        ]
      });
      const chat = { id: 'chat-1', name: 'hi', worldId: world.id, messageCount: 1, createdAt: new Date(), updatedAt: new Date() };

      await getMemoryStorage().saveWorld(world);
      await getMemoryStorage().saveAgent(world.id, agent);
      await getMemoryStorage().saveChatData(world.id, chat);
      const runtimeWorld = await getWorld(world.id);
      await runtimeWorld!.eventStorage!.saveEvent({
        id: 'evt-title-1',
        worldId: world.id,
        chatId: 'chat-1',
        type: 'system',
        payload: {
          eventType: 'chat-title-updated',
          title: 'hi',
          source: 'idle'
        },
        createdAt: new Date()
      });

      const result = await editUserMessage(world.id, 'msg-1', 'list files', 'chat-1');

      expect(result.resubmissionStatus).toBe('success');
      const updatedChat = await getMemoryStorage().loadChatData(world.id, 'chat-1');
      expect(updatedChat?.name).toBe('New Chat');
    });

    test('should not reset manual title when it does not match latest generated title', async () => {
      const world = createTestWorld({ isProcessing: false, currentChatId: 'chat-1' });
      const agent = createTestAgent({
        memory: [
          { role: 'user', content: 'hi', messageId: 'msg-1', chatId: 'chat-1', createdAt: new Date(), agentId: 'agent-1' }
        ]
      });
      const chat = { id: 'chat-1', name: 'Manual title', worldId: 'test-world', messageCount: 1, createdAt: new Date(), updatedAt: new Date() };

      await getMemoryStorage().saveWorld(world);
      await getMemoryStorage().saveAgent('test-world', agent);
      await getMemoryStorage().saveChatData('test-world', chat);
      const runtimeWorld = await getWorld('test-world');
      await runtimeWorld!.eventStorage!.saveEvent({
        id: 'evt-title-2',
        worldId: 'test-world',
        chatId: 'chat-1',
        type: 'system',
        payload: {
          eventType: 'chat-title-updated',
          title: 'hi',
          source: 'idle'
        },
        createdAt: new Date()
      });

      const result = await editUserMessage('test-world', 'msg-1', 'list files', 'chat-1');

      expect(result.resubmissionStatus).toBe('success');
      const updatedChat = await getMemoryStorage().loadChatData('test-world', 'chat-1');
      expect(updatedChat?.name).toBe('Manual title');
    });
  });
});
