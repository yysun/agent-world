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
 *
 * Recent Changes:
 * - 2026-03-11: Added regression coverage that `updateWorld` synchronizes live runtime `variables`
 *   so shell-command cwd resolution sees updated `working_directory` without a runtime refresh.
 * - 2026-03-12: Added coverage that `updateWorld` synchronizes every active runtime for the same world.
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

  it('syncs active runtime variables when updating world metadata', async () => {
    vi.resetModules();

    const persistedWorld = {
      id: 'world-1',
      name: 'World 1',
      turnLimit: 5,
      currentChatId: 'chat-1',
      variables: 'working_directory=/tmp/old-project',
      createdAt: new Date(),
      lastUpdated: new Date()
    };

    const activeWorld = {
      ...persistedWorld,
      eventEmitter: new EventEmitter(),
      agents: new Map(),
      chats: new Map([['chat-1', { id: 'chat-1', name: 'New Chat', messageCount: 0 }]]),
    } as any;

    const storageWrappers = {
      loadWorld: vi.fn().mockResolvedValue(persistedWorld),
      saveWorld: vi.fn().mockResolvedValue(undefined),
    };

    vi.doMock('../../core/storage/storage-factory.js', () => ({
      createStorageWithWrappers: vi.fn().mockResolvedValue(storageWrappers),
      getDefaultRootPath: vi.fn().mockReturnValue('/test/data')
    }));

    vi.doMock('../../core/subscription.js', () => ({
      getActiveSubscribedWorlds: vi.fn().mockReturnValue([activeWorld])
    }));

    const managers = await import('../../core/managers.js');
    const updated = await managers.updateWorld('world-1', {
      variables: 'working_directory=/Users/esun/Documents/Projects/agent-world'
    });

    expect(updated).toBe(activeWorld);
    expect(activeWorld.variables).toBe('working_directory=/Users/esun/Documents/Projects/agent-world');
    expect(activeWorld.currentChatId).toBe('chat-1');
    expect(storageWrappers.saveWorld).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'world-1',
        variables: 'working_directory=/Users/esun/Documents/Projects/agent-world',
        currentChatId: 'chat-1',
        lastUpdated: expect.any(Date)
      })
    );
  });

  it('syncs every active runtime instance for the same world', async () => {
    vi.resetModules();

    const persistedWorld = {
      id: 'world-1',
      name: 'World 1',
      turnLimit: 5,
      currentChatId: 'chat-1',
      variables: 'working_directory=/tmp/old-project',
      createdAt: new Date(),
      lastUpdated: new Date()
    };

    const activeWorldA = {
      ...persistedWorld,
      eventEmitter: new EventEmitter(),
      agents: new Map(),
      chats: new Map([['chat-1', { id: 'chat-1', name: 'Chat 1', messageCount: 0 }]]),
    } as any;

    const activeWorldB = {
      ...persistedWorld,
      currentChatId: 'chat-2',
      eventEmitter: new EventEmitter(),
      agents: new Map(),
      chats: new Map([['chat-2', { id: 'chat-2', name: 'Chat 2', messageCount: 0 }]]),
    } as any;

    const storageWrappers = {
      loadWorld: vi.fn().mockResolvedValue(persistedWorld),
      saveWorld: vi.fn().mockResolvedValue(undefined),
    };

    vi.doMock('../../core/storage/storage-factory.js', () => ({
      createStorageWithWrappers: vi.fn().mockResolvedValue(storageWrappers),
      getDefaultRootPath: vi.fn().mockReturnValue('/test/data')
    }));

    vi.doMock('../../core/subscription.js', () => ({
      getActiveSubscribedWorlds: vi.fn().mockReturnValue([activeWorldA, activeWorldB])
    }));

    const managers = await import('../../core/managers.js');
    const updated = await managers.updateWorld('world-1', {
      variables: 'working_directory=/Users/esun/Documents/Projects/agent-world\ntool_permission=read'
    });

    expect(updated).toBe(activeWorldA);
    expect(activeWorldA.variables).toBe('working_directory=/Users/esun/Documents/Projects/agent-world\ntool_permission=read');
    expect(activeWorldB.variables).toBe('working_directory=/Users/esun/Documents/Projects/agent-world\ntool_permission=read');
    expect(activeWorldA.currentChatId).toBe('chat-1');
    expect(activeWorldB.currentChatId).toBe('chat-2');
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
