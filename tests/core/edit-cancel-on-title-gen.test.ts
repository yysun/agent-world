/**
 * Regression: editUserMessage always cancels in-flight LLM work
 *
 * Purpose:
 * - Verify that editUserMessage calls stopMessageProcessing unconditionally,
 *   not only when hasActiveChatMessageProcessing returns true.
 *
 * Root cause documented:
 * - Title generation queues an LLM call with agentId=undefined and never calls
 *   beginChatMessageProcessing, so hasActiveChatMessageProcessing returns false
 *   while title gen is the active item in the global llmQueue.
 * - The old guard (`if (hasActiveChatMessageProcessing) stopMessageProcessing`)
 *   caused stopMessageProcessing (and its inner cancelLLMCallsForChat) to be
 *   skipped in the title-gen-only case, leaving the title LLM call blocking
 *   the queue. The edited message's agent response call queued behind it,
 *   producing "no response" until title gen finished.
 *
 * Fix:
 * - stopMessageProcessing is now always called at the start of editUserMessage,
 *   which unconditionally cancels any title gen or other pending LLM calls for
 *   the chat via cancelLLMCallsForChat.
 *
 * Recent Changes:
 * - 2026-03-06: Initial coverage for title-gen-blocks-edit regression.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StorageAPI } from '../../core/types.js';
import { EventEmitter } from 'events';
import { createMemoryStorage } from '../../core/storage/memory-storage.js';

// Hoist the stopMessageProcessing spy so it can be referenced in vi.mock.
const { stopMessageProcessingSpy } = vi.hoisted(() => {
  const spy = vi.fn().mockReturnValue({
    success: true,
    worldId: '',
    chatId: '',
    stopped: false,
    reason: 'no-active-process',
    stoppedOperations: 0,
    llm: { canceledPending: 0, abortedActive: 0 },
    shell: { killed: 0 },
    processing: { abortedActive: 0 },
  });
  return { stopMessageProcessingSpy: spy };
});

// Partial mock of message-processing-control: keep all real exports, override
// hasActiveChatMessageProcessing to always return false (simulates title-gen-only
// active state) and spy on stopMessageProcessing.
vi.mock('../../core/message-processing-control.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../core/message-processing-control.js')>();
  return {
    ...actual,
    hasActiveChatMessageProcessing: vi.fn().mockReturnValue(false),
    stopMessageProcessing: stopMessageProcessingSpy,
  };
});

// Storage mock — same pattern used by message-edit.test.ts.
const { getMemoryStorage } = vi.hoisted(() => {
  let storage: StorageAPI | null = null;
  return {
    getMemoryStorage: () => {
      if (!storage) storage = createMemoryStorage();
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

vi.mock('nanoid', () => ({
  nanoid: vi.fn(() => 'test-id-' + Math.random().toString(36).substring(2, 7)),
}));

import { editUserMessage } from '../../core/index.js';

const WORLD_ID = 'title-gen-world';
const CHAT_ID = 'chat-1';

describe('editUserMessage — unconditional LLM cancellation', () => {
  beforeEach(async () => {
    stopMessageProcessingSpy.mockClear();

    const storage = getMemoryStorage();
    await storage.saveWorld({
      id: WORLD_ID,
      name: 'Title Gen World',
      currentChatId: CHAT_ID,
      totalAgents: 0,
      totalMessages: 0,
      turnLimit: 5,
      isProcessing: false,
      createdAt: new Date(),
      lastUpdated: new Date(),
      eventEmitter: new EventEmitter(),
      agents: new Map(),
      chats: new Map(),
    } as any);
    await storage.saveChatData(WORLD_ID, {
      id: CHAT_ID,
      name: 'New Chat',
      worldId: WORLD_ID,
      messageCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it('calls stopMessageProcessing even when hasActiveChatMessageProcessing returns false', async () => {
    // hasActiveChatMessageProcessing is mocked to return false, simulating the
    // title-gen-only case where no processing handle is registered but an LLM
    // call is queued for the chat.
    await editUserMessage(WORLD_ID, 'nonexistent-msg-id', 'edited content', CHAT_ID);

    expect(stopMessageProcessingSpy).toHaveBeenCalledWith(WORLD_ID, CHAT_ID);
  });
});
