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
 * - 2026-03-09: Initial tests added as part of message-edit-manager extraction.
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { StorageAPI, Agent, AgentMessage } from '../../core/types.js';
import { LLMProvider } from '../../core/types.js';
import { createMemoryStorage } from '../../core/storage/memory-storage.js';

const { getMemoryStorage } = vi.hoisted(() => {
  let storage: StorageAPI | null = null;
  return {
    getMemoryStorage: () => {
      if (!storage) {
        storage = createMemoryStorage();
      }
      return storage;
    },
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

import { removeMessagesFrom, logEditError, getEditErrors } from '../../core/message-edit-manager.js';
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
    const storage = createMemoryStorage();
    const wrappers = createStorageWrappers(storage);
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

    const now = Date.now();
    const agent = makeAgent('agent-1', [
      makeMessage({ messageId: 'msg-1', content: 'first', createdAt: new Date(now) }),
      makeMessage({ messageId: 'msg-2', content: 'second', createdAt: new Date(now + 100) }),
      makeMessage({ messageId: 'msg-3', content: 'third', createdAt: new Date(now + 200) }),
    ]);
    await wrappers.saveAgent(worldId, agent);
    await wrappers.saveAgentMemory(worldId, agent.id, agent.memory);
  });

  describe('removeMessagesFrom', () => {
    it('removes target message and all later messages from the chat', async () => {
      const result = await removeMessagesFrom(worldId, 'msg-2', chatId);

      expect(result.success).toBe(true);
      expect(result.messagesRemovedTotal).toBeGreaterThanOrEqual(2); // msg-2 and msg-3

      // Verify storage reflects removal (msg-1 should remain)
      const wrappers = (await import('../../core/storage-init.js')).storageWrappers;
      const remaining = await wrappers!.getMemory(worldId, chatId);
      expect(remaining.some((m: AgentMessage) => m.messageId === 'msg-1')).toBe(true);
      expect(remaining.some((m: AgentMessage) => m.messageId === 'msg-2')).toBe(false);
      expect(remaining.some((m: AgentMessage) => m.messageId === 'msg-3')).toBe(false);
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
});
