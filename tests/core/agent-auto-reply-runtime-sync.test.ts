/**
 * Unit Tests for runtime agent config sync on update
 *
 * Purpose:
 * - Verify manager-level agent updates propagate to active subscribed world runtime.
 *
 * Key features:
 * - Ensures `autoReply` updates mutate the live runtime agent object in place.
 * - Prevents stale subscribed listeners from using outdated agent config.
 *
 * Notes:
 * - Uses mocked in-memory storage wrappers (no filesystem/SQLite).
 * - Focuses on update flow where active world runtime already exists.
 *
 * Recent changes:
 * - 2026-02-20: Added create-agent processing-guard coverage for default block behavior and tool-only override (`allowWhileWorldProcessing`).
 * - 2026-02-15: Added regression test for `autoReply=false` not taking effect on active subscribed runtimes.
 * - 2026-02-15: Added create/delete agent runtime sync coverage for active subscribed worlds.
 */

import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';

describe('updateAgent runtime sync', () => {
  it('updates active subscribed runtime agent autoReply in place', async () => {
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
      createdAt: new Date(),
      lastUpdated: new Date(),
      eventEmitter: new EventEmitter(),
      agents: new Map([[runtimeAgent.id, runtimeAgent]]),
      chats: new Map(),
      totalAgents: 1,
      totalMessages: 0
    } as any;

    const persistedWorld = {
      id: 'world-1',
      name: 'World 1',
      turnLimit: 5,
      mainAgent: null,
      createdAt: new Date(),
      lastUpdated: new Date()
    };

    const persistedAgent = {
      ...runtimeAgent,
      memory: []
    };

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

    vi.doMock('../../core/events/index.js', () => ({}));

    vi.doMock('../../core/subscription.js', () => ({
      getActiveSubscribedWorld: vi.fn().mockReturnValue(activeWorld)
    }));

    const managers = await import('../../core/managers.js');

    const updated = await managers.updateAgent('world-1', 'agent-1', { autoReply: false });

    expect(updated).not.toBeNull();
    expect(updated?.autoReply).toBe(false);

    const runtimeAgentAfterUpdate = activeWorld.agents.get('agent-1');
    expect(runtimeAgentAfterUpdate).toBe(runtimeAgent);
    expect(runtimeAgentAfterUpdate?.autoReply).toBe(false);

    expect(storageWrappers.saveAgent).toHaveBeenCalled();
  });

  it('syncs createAgent into active subscribed runtime world', async () => {
    vi.resetModules();

    const activeWorld = {
      id: 'world-1',
      name: 'World 1',
      turnLimit: 5,
      createdAt: new Date(),
      lastUpdated: new Date(),
      eventEmitter: new EventEmitter(),
      agents: new Map(),
      chats: new Map([['chat-1', { id: 'chat-1', name: 'New Chat', messageCount: 0 }]]),
      totalAgents: 0,
      totalMessages: 0
    } as any;

    const persistedWorld = {
      id: 'world-1',
      name: 'World 1',
      turnLimit: 5,
      mainAgent: null,
      createdAt: new Date(),
      lastUpdated: new Date()
    };

    const storageWrappers = {
      loadWorld: vi.fn().mockResolvedValue(persistedWorld),
      listAgents: vi.fn().mockResolvedValue([]),
      listChats: vi.fn().mockResolvedValue([{ id: 'chat-1', name: 'New Chat', messageCount: 0 }]),
      agentExists: vi.fn().mockResolvedValue(false),
      saveAgent: vi.fn().mockResolvedValue(undefined)
    };

    vi.doMock('../../core/storage/storage-factory.js', () => ({
      createStorageWithWrappers: vi.fn().mockResolvedValue(storageWrappers),
      getDefaultRootPath: vi.fn().mockReturnValue('/test/data')
    }));

    vi.doMock('../../core/events/index.js', () => ({}));

    vi.doMock('../../core/subscription.js', () => ({
      getActiveSubscribedWorld: vi.fn().mockReturnValue(activeWorld)
    }));

    const managers = await import('../../core/managers.js');

    const created = await managers.createAgent('world-1', {
      name: 'Agent Created',
      type: 'default',
      autoReply: false,
      provider: 'openai',
      model: 'gpt-4'
    });

    expect(created.autoReply).toBe(false);
    const runtimeCreated = activeWorld.agents.get(created.id);
    expect(runtimeCreated).toBeDefined();
    expect(runtimeCreated.autoReply).toBe(false);
    expect(storageWrappers.saveAgent).toHaveBeenCalled();
  });

  it('blocks createAgent by default when active world is processing', async () => {
    vi.resetModules();

    const persistedWorld = {
      id: 'world-1',
      name: 'World 1',
      turnLimit: 5,
      mainAgent: null,
      createdAt: new Date(),
      lastUpdated: new Date()
    };

    const activeWorld = {
      id: 'world-1',
      name: 'World 1',
      isProcessing: true,
      turnLimit: 5,
      createdAt: new Date(),
      lastUpdated: new Date(),
      eventEmitter: new EventEmitter(),
      agents: new Map(),
      chats: new Map([['chat-1', { id: 'chat-1', name: 'New Chat', messageCount: 0 }]]),
      totalAgents: 0,
      totalMessages: 0
    } as any;

    const storageWrappers = {
      loadWorld: vi.fn().mockResolvedValue(persistedWorld),
      agentExists: vi.fn().mockResolvedValue(false),
      saveAgent: vi.fn().mockResolvedValue(undefined)
    };

    vi.doMock('../../core/storage/storage-factory.js', () => ({
      createStorageWithWrappers: vi.fn().mockResolvedValue(storageWrappers),
      getDefaultRootPath: vi.fn().mockReturnValue('/test/data')
    }));

    vi.doMock('../../core/events/index.js', () => ({}));

    vi.doMock('../../core/subscription.js', () => ({
      getActiveSubscribedWorld: vi.fn().mockReturnValue(activeWorld)
    }));

    const managers = await import('../../core/managers.js');

    await expect(
      managers.createAgent('world-1', {
        name: 'Blocked Agent',
        type: 'default',
        autoReply: false,
        provider: 'openai',
        model: 'gpt-4'
      }),
    ).rejects.toThrow('Cannot create agent while world is processing');

    expect(storageWrappers.saveAgent).not.toHaveBeenCalled();
  });

  it('allows createAgent when processing override is explicitly enabled', async () => {
    vi.resetModules();

    const persistedWorld = {
      id: 'world-1',
      name: 'World 1',
      turnLimit: 5,
      mainAgent: null,
      createdAt: new Date(),
      lastUpdated: new Date()
    };

    const activeWorld = {
      id: 'world-1',
      name: 'World 1',
      isProcessing: true,
      turnLimit: 5,
      createdAt: new Date(),
      lastUpdated: new Date(),
      eventEmitter: new EventEmitter(),
      agents: new Map(),
      chats: new Map([['chat-1', { id: 'chat-1', name: 'New Chat', messageCount: 0 }]]),
      totalAgents: 0,
      totalMessages: 0
    } as any;

    const storageWrappers = {
      loadWorld: vi.fn().mockResolvedValue(persistedWorld),
      agentExists: vi.fn().mockResolvedValue(false),
      saveAgent: vi.fn().mockResolvedValue(undefined)
    };

    vi.doMock('../../core/storage/storage-factory.js', () => ({
      createStorageWithWrappers: vi.fn().mockResolvedValue(storageWrappers),
      getDefaultRootPath: vi.fn().mockReturnValue('/test/data')
    }));

    vi.doMock('../../core/events/index.js', () => ({}));

    vi.doMock('../../core/subscription.js', () => ({
      getActiveSubscribedWorld: vi.fn().mockReturnValue(activeWorld)
    }));

    const managers = await import('../../core/managers.js');

    const created = await managers.createAgent(
      'world-1',
      {
        name: 'Allowed Agent',
        type: 'default',
        autoReply: false,
        provider: 'openai',
        model: 'gpt-4'
      },
      { allowWhileWorldProcessing: true },
    );

    expect(created.name).toBe('Allowed Agent');
    expect(storageWrappers.saveAgent).toHaveBeenCalled();
    expect(activeWorld.agents.has(created.id)).toBe(true);
  });

  it('syncs deleteAgent into active subscribed runtime world', async () => {
    vi.resetModules();

    const runtimeAgent = {
      id: 'agent-delete',
      name: 'Agent Delete',
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
      mainAgent: null,
      createdAt: new Date(),
      lastUpdated: new Date()
    };

    const storageWrappers = {
      loadWorld: vi.fn().mockResolvedValue(persistedWorld),
      listAgents: vi.fn().mockResolvedValue([runtimeAgent]),
      listChats: vi.fn().mockResolvedValue([{ id: 'chat-1', name: 'New Chat', messageCount: 0 }]),
      loadAgent: vi.fn().mockResolvedValue(runtimeAgent),
      deleteAgent: vi.fn().mockResolvedValue(true)
    };

    vi.doMock('../../core/storage/storage-factory.js', () => ({
      createStorageWithWrappers: vi.fn().mockResolvedValue(storageWrappers),
      getDefaultRootPath: vi.fn().mockReturnValue('/test/data')
    }));

    vi.doMock('../../core/events/index.js', () => ({}));

    vi.doMock('../../core/subscription.js', () => ({
      getActiveSubscribedWorld: vi.fn().mockReturnValue(activeWorld)
    }));

    const managers = await import('../../core/managers.js');

    const deleted = await managers.deleteAgent('world-1', 'agent-delete');

    expect(deleted).toBe(true);
    expect(activeWorld.agents.has('agent-delete')).toBe(false);
    expect(storageWrappers.deleteAgent).toHaveBeenCalled();
  });
});
