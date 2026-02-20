/**
 * Unit Tests for ChatId Isolation During World/Agent Edits
 *
 * Purpose:
 * - Ensure world/agent edit operations do not accidentally switch active chat context.
 *
 * Key features:
 * - Verifies `updateWorld` preserves `currentChatId` when chat is not part of updates.
 * - Verifies `updateAgent` runtime sync does not mutate world `currentChatId`.
 *
 * Notes:
 * - Uses mocked in-memory storage wrappers only.
 */

import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';

describe('chatId isolation for edit flows', () => {
  it('preserves currentChatId when updating world non-chat fields', async () => {
    vi.resetModules();

    const persistedWorld = {
      id: 'world-1',
      name: 'World 1',
      turnLimit: 5,
      currentChatId: 'chat-1',
      createdAt: new Date(),
      lastUpdated: new Date()
    };

    const storageWrappers = {
      loadWorld: vi.fn().mockResolvedValue(persistedWorld),
      saveWorld: vi.fn().mockResolvedValue(undefined),
      listAgents: vi.fn().mockResolvedValue([]),
      listChats: vi.fn().mockResolvedValue([{ id: 'chat-1', name: 'New Chat', messageCount: 0 }])
    };

    vi.doMock('../../core/storage/storage-factory.js', () => ({
      createStorageWithWrappers: vi.fn().mockResolvedValue(storageWrappers),
      getDefaultRootPath: vi.fn().mockReturnValue('/test/data')
    }));

    const managers = await import('../../core/managers.js');
    const updated = await managers.updateWorld('world-1', { name: 'World Renamed' });

    expect(updated).not.toBeNull();
    expect(updated?.currentChatId).toBe('chat-1');
    expect(storageWrappers.saveWorld).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'world-1',
        name: 'World Renamed',
        currentChatId: 'chat-1'
      })
    );
  });

  it('keeps active runtime currentChatId unchanged when updating an agent', async () => {
    vi.resetModules();

    const runtimeAgent = {
      id: 'agent-1',
      name: 'Agent One',
      type: 'default',
      autoReply: true,
      status: 'inactive',
      provider: 'openai',
      model: 'gpt-4',
      llmCallCount: 0,
      memory: []
    };

    const activeWorld = {
      id: 'world-1',
      name: 'World 1',
      turnLimit: 5,
      currentChatId: 'chat-1',
      createdAt: new Date(),
      lastUpdated: new Date(),
      eventEmitter: new EventEmitter(),
      agents: new Map([[runtimeAgent.id, runtimeAgent]]),
      chats: new Map([['chat-1', { id: 'chat-1', name: 'New Chat', messageCount: 0 }]]),
      totalAgents: 1,
      totalMessages: 0
    } as any;

    const persistedWorld = {
      id: 'world-1',
      name: 'World 1',
      turnLimit: 5,
      currentChatId: 'chat-1',
      createdAt: new Date(),
      lastUpdated: new Date()
    };

    const persistedAgent = { ...runtimeAgent };

    const storageWrappers = {
      loadWorld: vi.fn().mockResolvedValue(persistedWorld),
      listAgents: vi.fn().mockResolvedValue([persistedAgent]),
      listChats: vi.fn().mockResolvedValue([{ id: 'chat-1', name: 'New Chat', messageCount: 0 }]),
      loadAgent: vi.fn().mockResolvedValue(persistedAgent),
      saveAgent: vi.fn().mockResolvedValue(undefined)
    };

    vi.doMock('../../core/storage/storage-factory.js', () => ({
      createStorageWithWrappers: vi.fn().mockResolvedValue(storageWrappers),
      getDefaultRootPath: vi.fn().mockReturnValue('/test/data')
    }));

    vi.doMock('../../core/subscription.js', () => ({
      getActiveSubscribedWorld: vi.fn().mockReturnValue(activeWorld)
    }));

    vi.doMock('../../core/events/index.js', () => ({}));

    const managers = await import('../../core/managers.js');
    const beforeChatId = activeWorld.currentChatId;
    const updated = await managers.updateAgent('world-1', 'agent-1', { temperature: 0.3 });

    expect(updated).not.toBeNull();
    expect(activeWorld.currentChatId).toBe(beforeChatId);
    expect(activeWorld.currentChatId).toBe('chat-1');
  });
});
