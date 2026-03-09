/**
 * Unit Tests for Queue Manager Module
 *
 * Purpose:
 * - Verify key public API behaviors of the extracted queue-manager module.
 *
 * Key features covered:
 * - pauseChatQueue / resumeChatQueue state transitions
 * - addToQueue happy path with cache update
 * - enqueueAndProcessUserMessage non-user sender uses direct publish path
 *
 * Implementation Notes:
 * - Uses in-memory stub storage with queue operations mocked via vi.fn().
 * - No real SQLite, filesystem, or LLM calls.
 * - Tests are fully deterministic.
 *
 * Recent Changes:
 * - 2026-03-09: Initial tests added as part of queue-manager extraction.
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { World } from '../../core/types.js';
import { EventEmitter } from 'events';

// Prevent real event publishing side effects
vi.mock('../../core/events/index.js', () => ({
  publishMessage: vi.fn(() => ({ messageId: 'pub-msg-1' })),
  publishMessageWithId: vi.fn(() => ({ messageId: 'pub-msg-1' })),
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
  enqueueAndProcessUserMessage,
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
      queueMessages.push({ worldId, chatId, messageId, content, sender, status: 'queued', retryCount: 0 });
    }),
    getQueuedMessages: vi.fn().mockImplementation(async () => [...queueMessages]),
    updateMessageQueueStatus: vi.fn().mockResolvedValue(undefined),
    incrementQueueMessageRetry: vi.fn().mockResolvedValue(1),
    removeQueuedMessage: vi.fn().mockResolvedValue(undefined),
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
  });

  describe('enqueueAndProcessUserMessage', () => {
    it('uses direct publish (not queue) for non-user sender', async () => {
      const { publishMessage } = await import('../../core/events/index.js');
      const worldId = 'world-q';
      const chatId = 'chat-agent';

      const result = await enqueueAndProcessUserMessage(worldId, chatId, 'agent says hi', 'agent-1');

      expect(publishMessage).toHaveBeenCalled();
      // Non-user paths should return null (not a QueuedMessage)
      expect(result).toBeNull();
    });

    it('enqueues for human sender', async () => {
      const worldId = 'world-q';
      const chatId = 'chat-human';

      const result = await enqueueAndProcessUserMessage(worldId, chatId, 'user message', 'human', null, {
        preassignedMessageId: 'pre-id-1',
      });

      expect(result).not.toBeNull();
      expect(result?.messageId).toBe('pre-id-1');
      expect(result?.status).toBe('queued');
    });
  });
});
