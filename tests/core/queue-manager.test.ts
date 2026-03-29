/**
 * Unit Tests for Queue Manager Module
 *
 * Purpose:
 * - Verify key public API behaviors of the extracted queue-manager module.
 *
 * Key features covered:
 * - pauseChatQueue / resumeChatQueue state transitions
 * - addToQueue happy path with cache update
 * - `enqueueAndProcessUserTurn` accepts human-like queued senders (`human`/`user`/`world`)
 * - `dispatchImmediateChatMessage` bypasses queue for non-user senders
 *
 * Implementation Notes:
 * - Uses in-memory stub storage with queue operations mocked via vi.fn().
 * - No real SQLite, filesystem, or LLM calls.
 * - Tests are fully deterministic.
 *
 * Recent Changes:
 * - 2026-03-29: Added regression coverage for queued turns that stay in `sending` while persisted turn metadata is waiting for tool results, and only complete after terminal metadata is present.
 * - 2026-03-12: Added regression coverage for sequential completed turns in the same chat so queue
 *   completion listeners fully detach/re-attach and later rows do not stick in `sending`.
 * - 2026-03-09: Initial tests added as part of queue-manager extraction.
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { World } from '../../core/types.js';
import { EventEmitter } from 'events';

// Prevent real event publishing side effects
vi.mock('../../core/events/index.js', () => ({
  publishMessage: vi.fn(() => ({ messageId: 'pub-msg-1' })),
  publishMessageWithId: vi.fn(() => ({ messageId: 'pub-msg-1' })),
  publishEvent: vi.fn(),
  setupEventPersistence: vi.fn(),
  setupWorldActivityListener: vi.fn(),
  subscribeAgentToMessages: vi.fn(),
  subscribeWorldToMessages: vi.fn(),
}));

vi.mock('../../core/subscription.js', () => ({
  getActiveSubscribedWorld: vi.fn(() => null),
}));

vi.mock('../../core/storage/storage-factory.js', () => ({
  createStorageWithWrappers: vi.fn(),
  createStorageWrappers: vi.fn(),
  getDefaultRootPath: vi.fn().mockReturnValue('/test/data'),
}));

import {
  pauseChatQueue,
  resumeChatQueue,
  addToQueue,
  enqueueAndProcessUserTurn,
  dispatchImmediateChatMessage,
  getQueueMessages,
} from '../../core/queue-manager.js';
import { overrideStorageForTests } from '../../core/storage-init.js';

function makeWorld(overrides: Partial<World> = {}): World {
  return {
    id: 'world-q',
    name: 'World Q',
    turnLimit: 5,
    totalAgents: 0,
    totalMessages: 0,
    createdAt: new Date(),
    lastUpdated: new Date(),
    eventEmitter: new EventEmitter(),
    agents: new Map(),
    chats: new Map(),
    ...overrides,
  } as World;
}

function buildQueueStorageWrappers(queueMessages: any[] = []) {
  return {
    // Core storage
    saveWorld: vi.fn().mockResolvedValue(undefined),
    loadWorld: vi.fn().mockResolvedValue({ id: 'world-q' }),
    listWorlds: vi.fn().mockResolvedValue([{ id: 'world-q' }]),
    worldExists: vi.fn().mockResolvedValue(true),
    listAgents: vi.fn().mockResolvedValue([]),
    listChats: vi.fn().mockResolvedValue([
      {
        id: 'chat-add',
        worldId: 'world-q',
        title: 'Test Chat',
        createdAt: new Date(),
        lastUpdated: new Date(),
        messages: [],
        currentAgentName: null,
        currentChatId: null,
      },
      {
        id: 'chat-1',
        worldId: 'world-q',
        title: 'Test Chat 1',
        createdAt: new Date(),
        lastUpdated: new Date(),
        messages: [],
        currentAgentName: null,
        currentChatId: null,
      },
      {
        id: 'chat-agent',
        worldId: 'world-q',
        title: 'Agent Chat',
        createdAt: new Date(),
        lastUpdated: new Date(),
        messages: [],
        currentAgentName: null,
        currentChatId: null,
      },
      {
        id: 'chat-human',
        worldId: 'world-q',
        title: 'Human Chat',
        createdAt: new Date(),
        lastUpdated: new Date(),
        messages: [],
        currentAgentName: null,
        currentChatId: null,
      },
    ]),
    saveChat: vi.fn().mockResolvedValue(undefined),
    saveChatData: vi.fn().mockResolvedValue(undefined),
    loadChat: vi.fn().mockResolvedValue(null),
    getMemory: vi.fn().mockResolvedValue([]),
    // Queue operations
    addQueuedMessage: vi.fn().mockImplementation(async (worldId, chatId, messageId, content, sender) => {
      queueMessages.push({
        worldId,
        chatId,
        messageId,
        content,
        sender,
        status: 'queued',
        retryCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }),
    getQueuedMessages: vi.fn().mockImplementation(async () => [...queueMessages]),
    updateMessageQueueStatus: vi.fn().mockImplementation(async (messageId, status) => {
      const target = queueMessages.find((entry) => entry.messageId === messageId);
      if (target) {
        target.status = status;
        target.updatedAt = new Date();
      }
    }),
    incrementQueueMessageRetry: vi.fn().mockResolvedValue(1),
    removeQueuedMessage: vi.fn().mockImplementation(async (messageId) => {
      const targetIndex = queueMessages.findIndex((entry) => entry.messageId === messageId);
      if (targetIndex >= 0) {
        queueMessages.splice(targetIndex, 1);
      }
    }),
    cancelQueuedMessages: vi.fn().mockResolvedValue(undefined),
    deleteQueueForChat: vi.fn().mockResolvedValue(undefined),
    resetQueueMessageForRetry: vi.fn().mockResolvedValue(undefined),
    recoverSendingMessages: vi.fn().mockResolvedValue(0),
  } as any;
}

describe('queue-manager', () => {
  let queueMessages: any[];

  beforeEach(() => {
    queueMessages = [];
    overrideStorageForTests(buildQueueStorageWrappers(queueMessages));
  });

  describe('pauseChatQueue / resumeChatQueue', () => {
    it('pauses and resumes without error', async () => {
      const worldId = 'world-q';
      const chatId = 'chat-1';

      await pauseChatQueue(worldId, chatId);
      await resumeChatQueue(worldId, chatId);
      // No error = state transitions are valid
      expect(true).toBe(true);
    });
  });

  describe('addToQueue', () => {
    it('persists a message into the queue and returns the queued row', async () => {
      const worldId = 'world-q';
      const chatId = 'chat-add';
      const content = 'hello world';

      const result = await addToQueue(worldId, chatId, content, 'human', {
        triggerProcessing: false,
        preassignedMessageId: 'test-msg-1',
      });

      expect(result).not.toBeNull();
      expect(result?.content).toBe(content);
      expect(result?.status).toBe('queued');

      const messages = await getQueueMessages(worldId, chatId);
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe(content);
    });

    it('removes each completed queued turn even when the same chat sends again', async () => {
      const world = makeWorld({
        agents: new Map([
          ['agent-1', {
            id: 'agent-1',
            name: 'Agent 1',
            type: 'assistant',
            provider: 'openai',
            model: 'gpt-4o-mini',
            llmCallCount: 0,
            autoReply: true,
            status: 'active',
            memory: [],
          }],
        ]),
      });
      const chatId = 'chat-add';

      await addToQueue('world-q', chatId, 'first queued turn', 'human', {
        triggerProcessing: true,
        targetWorld: world,
        preassignedMessageId: 'test-msg-queue-1',
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(queueMessages).toHaveLength(1);
      expect(queueMessages[0]?.status).toBe('sending');

      world.eventEmitter.emit('world', {
        type: 'response-start',
        chatId,
        activeChatIds: [chatId],
      });
      world.eventEmitter.emit('world', {
        type: 'idle',
        chatId,
        activeChatIds: [],
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(queueMessages).toEqual([]);

      await addToQueue('world-q', chatId, 'second queued turn', 'human', {
        triggerProcessing: true,
        targetWorld: world,
        preassignedMessageId: 'test-msg-queue-2',
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(queueMessages).toHaveLength(1);
      expect(queueMessages[0]?.status).toBe('sending');

      world.eventEmitter.emit('world', {
        type: 'response-start',
        chatId,
        activeChatIds: [chatId],
      });
      world.eventEmitter.emit('world', {
        type: 'idle',
        chatId,
        activeChatIds: [],
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(queueMessages).toEqual([]);
    });

    it('keeps a queued turn in sending while persisted turn metadata is waiting for a tool result, then removes it after terminal metadata appears', async () => {
      const persistedMemory: any[] = [];
      const storageWrappers = buildQueueStorageWrappers(queueMessages);
      storageWrappers.getMemory = vi.fn().mockImplementation(async () => [...persistedMemory]);
      overrideStorageForTests(storageWrappers);

      const world = makeWorld({
        agents: new Map([
          ['agent-1', {
            id: 'agent-1',
            name: 'Agent 1',
            type: 'assistant',
            provider: 'openai',
            model: 'gpt-4o-mini',
            llmCallCount: 0,
            autoReply: true,
            status: 'active',
            memory: [],
          }],
        ]),
      });
      const chatId = 'chat-add';
      const turnId = 'test-msg-queue-waiting-1';

      await addToQueue('world-q', chatId, 'tool-backed turn', 'human', {
        triggerProcessing: true,
        targetWorld: world,
        preassignedMessageId: turnId,
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(queueMessages).toHaveLength(1);
      expect(queueMessages[0]?.status).toBe('sending');

      persistedMemory.splice(0, persistedMemory.length, {
        role: 'assistant',
        content: 'Calling tool',
        sender: 'agent-1',
        messageId: 'assistant-tool-1',
        chatId,
        createdAt: new Date('2026-03-29T12:00:00.000Z'),
        agentTurn: {
          turnId,
          source: 'direct',
          action: 'tool_call',
          state: 'waiting_for_tool_result',
          updatedAt: '2026-03-29T12:00:00.000Z',
        },
      });

      world.eventEmitter.emit('world', {
        type: 'response-start',
        chatId,
        activeChatIds: [chatId],
      });
      world.eventEmitter.emit('world', {
        type: 'idle',
        chatId,
        activeChatIds: [],
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(queueMessages).toHaveLength(1);
      expect(queueMessages[0]?.messageId).toBe(turnId);
      expect(queueMessages[0]?.status).toBe('sending');

      persistedMemory.splice(0, persistedMemory.length, {
        role: 'assistant',
        content: 'Done',
        sender: 'agent-1',
        messageId: 'assistant-final-1',
        chatId,
        createdAt: new Date('2026-03-29T12:00:05.000Z'),
        agentTurn: {
          turnId,
          source: 'continuation',
          action: 'final_response',
          outcome: 'completed',
          updatedAt: '2026-03-29T12:00:05.000Z',
          completion: {
            mechanism: 'assistant_message_metadata',
            completedAt: '2026-03-29T12:00:05.000Z',
          },
        },
      });

      world.eventEmitter.emit('world', {
        type: 'idle',
        chatId,
        activeChatIds: [],
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(queueMessages).toEqual([]);
      expect(storageWrappers.removeQueuedMessage).toHaveBeenCalledWith(turnId);
    });
  });

  describe('dispatch boundaries', () => {
    it('uses immediate publish (not queue) for non-user sender', async () => {
      const { publishMessage } = await import('../../core/events/index.js');
      const worldId = 'world-q';
      const chatId = 'chat-agent';

      const result = await dispatchImmediateChatMessage(worldId, chatId, 'agent says hi', 'agent-1');

      expect(publishMessage).toHaveBeenCalled();
      expect(result?.messageId).toBe('pub-msg-1');
    });

    it('enqueues for human sender', async () => {
      const worldId = 'world-q';
      const chatId = 'chat-human';

      const result = await enqueueAndProcessUserTurn(worldId, chatId, 'user message', 'human', null, {
        preassignedMessageId: 'pre-id-1',
      });

      expect(result).not.toBeNull();
      expect(result?.messageId).toBe('pre-id-1');
      expect(result?.status).toBe('queued');
    });

    it('enqueues for world sender', async () => {
      const worldId = 'world-q';
      const chatId = 'chat-human';

      const result = await enqueueAndProcessUserTurn(worldId, chatId, '@agent-a heartbeat', 'world', null, {
        preassignedMessageId: 'pre-id-world-1',
      });

      expect(result).not.toBeNull();
      expect(result?.messageId).toBe('pre-id-world-1');
      expect(result?.status).toBe('queued');
    });

    it('rejects non-user sender on the queue-only user API', async () => {
      await expect(
        enqueueAndProcessUserTurn('world-q', 'chat-agent', 'agent says hi', 'agent-1')
      ).rejects.toThrow('not a queue-eligible user sender');
    });

    it('publishes a durable system error when queue preflight fails before streaming starts', async () => {
      const { publishEvent } = await import('../../core/events/index.js');
      const world = makeWorld();

      await addToQueue('world-q', 'chat-human', 'user message', 'human', {
        triggerProcessing: true,
        targetWorld: world,
        preassignedMessageId: 'preflight-fail-1',
      });

      await vi.waitFor(() => {
        expect(publishEvent).toHaveBeenCalledWith(
          world,
          'system',
          expect.objectContaining({
            type: 'error',
            eventType: 'error',
            triggeringMessageId: 'preflight-fail-1',
            failureKind: 'queue-dispatch',
          }),
          'chat-human',
        );
      });
    });
  });
});
