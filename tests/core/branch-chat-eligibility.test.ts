/**
 * Unit Tests for Branch Chat Eligibility
 *
 * Purpose:
 * - Validate `branchChatFromMessage` target-message eligibility rules.
 *
 * Key Features:
 * - Rejects tool-call related assistant messages.
 * - Rejects system-role and error-like messages.
 * - Allows branching from true assistant text responses.
 *
 * Implementation Notes:
 * - Uses in-memory storage only.
 * - Avoids real LLM/provider calls.
 *
 * Recent Changes:
 * - 2026-02-16: Added regression coverage for strict branch eligibility checks.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import { createMemoryStorage } from '../../core/storage/memory-storage.js';
import { LLMProvider } from '../../core/types.js';
import type { Agent, AgentMessage, StorageAPI, World } from '../../core/types.js';
import { branchChatFromMessage } from '../../core/index.js';

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

vi.mock('../../core/storage/storage-factory.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../core/storage/storage-factory.js')>();
  return {
    ...actual,
    createStorageWithWrappers: vi.fn(async () => actual.createStorageWrappers(getMemoryStorage())),
    getDefaultRootPath: vi.fn().mockReturnValue('/test/data')
  };
});

function createTestWorld(overrides: Partial<World> = {}): World {
  return {
    id: 'test-world',
    name: 'Test World',
    currentChatId: 'chat-1',
    totalAgents: 1,
    totalMessages: 0,
    turnLimit: 5,
    createdAt: new Date(),
    lastUpdated: new Date(),
    eventEmitter: new EventEmitter(),
    agents: new Map(),
    chats: new Map(),
    ...overrides
  } as World;
}

function createTestAgent(memory: AgentMessage[]): Agent {
  return {
    id: 'agent-1',
    name: 'Agent One',
    type: 'assistant',
    provider: LLMProvider.OPENAI,
    model: 'gpt-4o-mini',
    systemPrompt: 'test',
    memory,
    llmCallCount: 0,
    createdAt: new Date(),
    lastActive: new Date()
  };
}

async function seedWorldWithMessages(messages: AgentMessage[]): Promise<void> {
  const world = createTestWorld();
  const agent = createTestAgent(messages);
  const chat = {
    id: 'chat-1',
    worldId: 'test-world',
    name: 'Chat 1',
    messageCount: messages.length,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  await getMemoryStorage().saveWorld(world);
  await getMemoryStorage().saveAgent('test-world', agent);
  await getMemoryStorage().saveChatData('test-world', chat);
}

describe('branchChatFromMessage eligibility', () => {
  afterEach(async () => {
    try {
      await getMemoryStorage().deleteWorld('test-world');
    } catch {
      // noop
    }
  });

  it('rejects branching from assistant messages with tool calls', async () => {
    await seedWorldWithMessages([
      {
        role: 'assistant',
        content: 'Calling a tool',
        sender: 'agent-1',
        chatId: 'chat-1',
        messageId: 'msg-tool',
        createdAt: new Date('2026-02-16T12:00:00Z'),
        agentId: 'agent-1',
        tool_calls: [
          {
            id: 'call-1',
            type: 'function',
            function: {
              name: 'search',
              arguments: '{}'
            }
          }
        ]
      }
    ]);

    await expect(branchChatFromMessage('test-world', 'chat-1', 'msg-tool')).rejects.toThrow(
      'Can only branch from assistant messages.'
    );
  });

  it('rejects branching from system-sender assistant messages', async () => {
    await seedWorldWithMessages([
      {
        role: 'assistant',
        content: '[Error] Runtime failed',
        sender: 'system',
        chatId: 'chat-1',
        messageId: 'msg-system',
        createdAt: new Date('2026-02-16T12:00:00Z'),
        agentId: 'agent-1'
      }
    ]);

    await expect(branchChatFromMessage('test-world', 'chat-1', 'msg-system')).rejects.toThrow(
      'Can only branch from assistant messages.'
    );
  });

  it('rejects branching from error-like assistant messages', async () => {
    await seedWorldWithMessages([
      {
        role: 'assistant',
        content: 'Error: Tool execution failed',
        sender: 'agent-1',
        chatId: 'chat-1',
        messageId: 'msg-error',
        createdAt: new Date('2026-02-16T12:00:00Z'),
        agentId: 'agent-1'
      }
    ]);

    await expect(branchChatFromMessage('test-world', 'chat-1', 'msg-error')).rejects.toThrow(
      'Can only branch from assistant messages.'
    );
  });

  it('allows branching from a true assistant response', async () => {
    await seedWorldWithMessages([
      {
        role: 'assistant',
        content: 'Here is the answer.',
        sender: 'agent-1',
        chatId: 'chat-1',
        messageId: 'msg-assistant',
        createdAt: new Date('2026-02-16T12:00:00Z'),
        agentId: 'agent-1'
      }
    ]);

    const result = await branchChatFromMessage('test-world', 'chat-1', 'msg-assistant');
    expect(result.newChatId).toBeTruthy();
    expect(result.copiedMessageCount).toBeGreaterThan(0);
  });
});
