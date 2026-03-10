/**
 * Unit Tests for Message Edit Manager Module
 *
 * Purpose:
 * - Verify public API behaviors of the extracted message-edit-manager module.
 *
 * Key features covered:
 * - removeMessagesFrom happy path (finds and removes target + later messages)
 * - removeMessagesFrom not-found case (returns success:false)
 * - logEditError / getEditErrors round-trip
 *
 * Implementation Notes:
 * - Uses in-memory storage only (no real SQLite or filesystem).
 * - Mocks LLM calls and event publishing so no real network calls.
 * - Tests are fully deterministic.
 *
 * Recent Changes:
 * - 2026-03-10: Added regression coverage that trim cleanup only removes queued rows and persisted events from the removed tail.
 * - 2026-03-09: Initial tests added as part of message-edit-manager extraction.
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { StorageAPI, Agent, AgentMessage } from '../../core/types.js';
import { LLMProvider } from '../../core/types.js';
import { createMemoryStorage } from '../../core/storage/memory-storage.js';
import { createMemoryEventStorage } from '../../core/storage/eventStorage/index.js';

const { getMemoryStorage, mockedEnqueueAndProcessUserTurn } = vi.hoisted(() => {
  let storage: StorageAPI | null = null;
  return {
    getMemoryStorage: () => {
      if (!storage) {
        storage = createMemoryStorage();
      }
      return storage;
    },
    mockedEnqueueAndProcessUserTurn: vi.fn(async () => ({
      messageId: 'queued-edit-1',
      status: 'queued',
      retryCount: 0,
      createdAt: new Date().toISOString(),
    })),
  };
});

vi.mock('../../core/storage/storage-factory.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../core/storage/storage-factory.js')>();
  return {
    ...actual,
    createStorageWithWrappers: vi.fn(async () => actual.createStorageWrappers(getMemoryStorage())),
    getDefaultRootPath: vi.fn().mockReturnValue('/test/data'),
  };
});

vi.mock('../../core/events/index.js', () => ({
  publishMessage: vi.fn(() => ({ messageId: 'pub-1' })),
  publishMessageWithId: vi.fn(),
  setupEventPersistence: vi.fn(),
  setupWorldActivityListener: vi.fn(),
  subscribeAgentToMessages: vi.fn(),
  subscribeWorldToMessages: vi.fn(),
}));

vi.mock('../../core/subscription.js', () => ({
  getActiveSubscribedWorld: vi.fn(() => null),
}));

vi.mock('../../core/managers.js', () => ({
  enqueueAndProcessUserTurn: mockedEnqueueAndProcessUserTurn,
  getWorld: vi.fn(async () => null),
}));

import { removeMessagesFrom, logEditError, getEditErrors, editUserMessage } from '../../core/message-edit-manager.js';
import { overrideStorageForTests } from '../../core/storage-init.js';
import { createStorageWrappers } from '../../core/storage/storage-factory.js';

function makeAgent(id: string, memory: AgentMessage[] = []): Agent {
  return {
    id,
    name: id,
    type: 'assistant',
    provider: LLMProvider.OPENAI,
    model: 'gpt-4o-mini',
    systemPrompt: '',
    memory,
    llmCallCount: 0,
    createdAt: new Date(),
    lastActive: new Date(),
  } as Agent;
}

function makeMessage(overrides: Partial<AgentMessage> & { messageId: string }): AgentMessage {
  return {
    role: 'user',
    content: 'hi',
    chatId: 'chat-1',
    agentId: 'agent-1',
    createdAt: new Date(),
    ...overrides,
  } as AgentMessage;
}

describe('message-edit-manager', () => {
  const worldId = 'world-edit';
  const chatId = 'chat-1';

  beforeEach(async () => {
    mockedEnqueueAndProcessUserTurn.mockClear();
    const storage = createMemoryStorage();
    const wrappers = createStorageWrappers(storage);
    const queueRows: Array<{
      worldId: string;
      chatId: string;
      messageId: string;
      content: string;
      sender: string;
      status: 'queued' | 'sending' | 'error' | 'cancelled';
      retryCount: number;
      createdAt: Date;
      updatedAt: Date;
    }> = [];
    wrappers.getQueuedMessages = vi.fn(async (requestedWorldId: string, requestedChatId: string) => {
      return queueRows
        .filter((row) => row.worldId === requestedWorldId && row.chatId === requestedChatId && row.status !== 'cancelled')
        .map((row) => ({ ...row }));
    });
    wrappers.addQueuedMessage = vi.fn(async (requestedWorldId: string, requestedChatId: string, messageId: string, content: string, sender: string) => {
      queueRows.push({
        worldId: requestedWorldId,
        chatId: requestedChatId,
        messageId,
        content,
        sender,
        status: 'queued',
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });
    wrappers.removeQueuedMessage = vi.fn(async (messageId: string) => {
      const index = queueRows.findIndex((row) => row.messageId === messageId);
      if (index >= 0) {
        queueRows.splice(index, 1);
      }
    });
    (wrappers as any).eventStorage = createMemoryEventStorage();
    overrideStorageForTests(wrappers);

    // Seed world + agent
    await wrappers.saveWorld({
      id: worldId,
      name: 'Edit World',
      turnLimit: 5,
      totalAgents: 1,
      totalMessages: 0,
      createdAt: new Date(),
      lastUpdated: new Date(),
    } as any);

    const now = new Date('2026-03-10T03:00:00.000Z').getTime();
    const agent = makeAgent('agent-1', [
      makeMessage({ messageId: 'msg-1', content: 'first', createdAt: new Date(now) }),
      makeMessage({ messageId: 'msg-2', content: 'second', createdAt: new Date(now + 100) }),
      makeMessage({ messageId: 'msg-3', content: 'third', createdAt: new Date(now + 200) }),
    ]);
    await wrappers.saveAgent(worldId, agent);
    await wrappers.saveAgentMemory(worldId, agent.id, agent.memory);
    await wrappers.saveChatData(worldId, {
      id: chatId,
      name: 'New Chat',
      messageCount: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);
  });

  describe('removeMessagesFrom', () => {
    it('removes only queued rows from the trimmed tail and preserves earlier queued work', async () => {
      const wrappers = (await import('../../core/storage-init.js')).storageWrappers;
      await wrappers!.addQueuedMessage?.(worldId, chatId, 'msg-1', 'keep first', 'human');
      await wrappers!.addQueuedMessage?.(worldId, chatId, 'msg-2', 'trim second', 'human');
      await wrappers!.addQueuedMessage?.(worldId, chatId, 'msg-3', 'trim third', 'human');

      const result = await removeMessagesFrom(worldId, 'msg-2', chatId);

      expect(result.success).toBe(true);
      expect(result.messagesRemovedTotal).toBeGreaterThanOrEqual(2); // msg-2 and msg-3

      // Verify storage reflects removal (msg-1 should remain)
      const remaining = await wrappers!.getMemory(worldId, chatId);
      expect(remaining.some((m: AgentMessage) => m.messageId === 'msg-1')).toBe(true);
      expect(remaining.some((m: AgentMessage) => m.messageId === 'msg-2')).toBe(false);
      expect(remaining.some((m: AgentMessage) => m.messageId === 'msg-3')).toBe(false);
      expect((await wrappers!.getQueuedMessages?.(worldId, chatId))?.map((row) => row.messageId)).toEqual(['msg-1']);
    });

    it('removes persisted chat events from the trimmed tail and preserves earlier events', async () => {
      const wrappers = (await import('../../core/storage-init.js')).storageWrappers;
      const eventStorage = (wrappers as any).eventStorage;
      await eventStorage.saveEvent({
        id: 'msg-1',
        worldId,
        chatId,
        type: 'message',
        payload: { content: 'first', sender: 'human' },
        meta: {},
        createdAt: new Date('2026-03-10T03:00:00.000Z'),
      });
      await eventStorage.saveEvent({
        id: 'sys-err-2',
        worldId,
        chatId,
        type: 'system',
        payload: { type: 'error', eventType: 'error', message: 'trim me' },
        meta: {},
        createdAt: new Date('2026-03-10T03:00:00.150Z'),
      });
      await eventStorage.saveEvent({
        id: 'tool-3',
        worldId,
        chatId,
        type: 'tool',
        payload: { result: 'trim me too' },
        meta: {},
        createdAt: new Date('2026-03-10T03:00:00.250Z'),
      });

      const result = await removeMessagesFrom(worldId, 'msg-2', chatId);

      expect(result.success).toBe(true);
      const remainingEvents = await eventStorage.getEventsByWorldAndChat(worldId, chatId);
      expect(remainingEvents.map((event: { id: string }) => event.id)).toEqual(['msg-1']);
    });

    it('removes orphaned persisted system error events for earlier edited-away turns', async () => {
      const wrappers = (await import('../../core/storage-init.js')).storageWrappers;
      const eventStorage = (wrappers as any).eventStorage;

      await eventStorage.saveEvent({
        id: 'msg-orphan',
        worldId,
        chatId,
        type: 'message',
        payload: { content: 'older removed turn', sender: 'human' },
        meta: {},
        createdAt: new Date('2026-03-10T02:59:59.000Z'),
      });
      await eventStorage.saveEvent({
        id: 'sys-orphan',
        worldId,
        chatId,
        type: 'system',
        payload: { type: 'error', eventType: 'error', message: 'older orphaned failure' },
        meta: {},
        createdAt: new Date('2026-03-10T02:59:59.050Z'),
      });
      await eventStorage.saveEvent({
        id: 'msg-1',
        worldId,
        chatId,
        type: 'message',
        payload: { content: 'first', sender: 'human' },
        meta: {},
        createdAt: new Date('2026-03-10T03:00:00.000Z'),
      });
      await eventStorage.saveEvent({
        id: 'msg-2',
        worldId,
        chatId,
        type: 'message',
        payload: { content: 'second', sender: 'human' },
        meta: {},
        createdAt: new Date('2026-03-10T03:00:00.100Z'),
      });
      await eventStorage.saveEvent({
        id: 'sys-current',
        worldId,
        chatId,
        type: 'system',
        payload: { type: 'error', eventType: 'error', message: 'current failure' },
        meta: {},
        createdAt: new Date('2026-03-10T03:00:00.150Z'),
      });

      const result = await removeMessagesFrom(worldId, 'msg-2', chatId);

      expect(result.success).toBe(true);
      const remainingEvents = await eventStorage.getEventsByWorldAndChat(worldId, chatId);
      expect(remainingEvents.map((event: { id: string }) => event.id)).toEqual(['msg-orphan', 'msg-1']);
    });

    it('returns success:false when target messageId is not found', async () => {
      const result = await removeMessagesFrom(worldId, 'msg-nonexistent', chatId);

      expect(result.success).toBe(false);
      expect(result.messagesRemovedTotal).toBe(0);
    });
  });

  describe('logEditError / getEditErrors', () => {
    it('persists an error log and retrieves it', async () => {
      const errorEntry = {
        worldId,
        messageId: 'msg-err',
        error: 'something went wrong',
        timestamp: new Date().toISOString(),
        type: 'removal' as const,
      };

      await logEditError(worldId, errorEntry as any);
      const errors = await getEditErrors(worldId);

      expect(errors).toHaveLength(1);
      expect(errors[0].messageId).toBe('msg-err');
    });
  });

  describe('editUserMessage', () => {
    it('resubmits edited user content through the canonical queue-backed send path', async () => {
      const wrappers = (await import('../../core/storage-init.js')).storageWrappers;
      await wrappers!.addQueuedMessage?.(worldId, chatId, 'msg-2', 'queued stale second', 'human');

      const targetWorld = {
        id: worldId,
        chats: new Map([[chatId, { id: chatId, name: 'New Chat' }]]),
        agents: new Map([['agent-1', makeAgent('agent-1')]]),
        eventStorage: {
          getEventsByWorldAndChat: vi.fn().mockResolvedValue([]),
        },
      } as any;

      const result = await editUserMessage(worldId, 'msg-2', 'edited second', chatId, targetWorld);

      expect(result).toMatchObject({
        success: true,
        resubmissionStatus: 'success',
        newMessageId: 'queued-edit-1',
      });
      expect(mockedEnqueueAndProcessUserTurn).toHaveBeenCalledWith(
        worldId,
        chatId,
        'edited second',
        'human',
        targetWorld,
        { source: 'retry' },
      );
      expect(await wrappers!.getQueuedMessages?.(worldId, chatId)).toEqual([]);

      const remaining = await wrappers!.getMemory(worldId, chatId);
      expect(remaining.map((message: AgentMessage) => message.messageId)).toEqual(['msg-1']);
    });
  });
});
