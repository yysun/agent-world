/**
 * World Activity-Based Chat Title Update Tests
 *
 * Purpose:
 * - Validate idle-triggered chat title generation and update behavior.
 *
 * Features:
 * - Verifies default-title replacement on idle.
 * - Verifies non-default titles are preserved.
 * - Verifies non-idle events do not trigger title generation.
 * - Verifies chat-scoped updates remain correct during chat switching races.
 *
 * Implementation Notes:
 * - Mocks storage and LLM calls to keep tests deterministic and isolated.
 * - Exercises subscriber behavior through emitted `world` events.
 *
 * Recent Changes:
 * - 2026-02-19: Asserted chat-title CRUD payload shape.
 * - 2026-02-13: Asserted structured `chat-title-updated` system payload shape.
 * - 2026-02-13: Added repeated-idle dedupe and no-activity human-message title-generation coverage.
 * - 2026-02-13: Added low-quality-title fallback and cancellation no-op coverage.
 * - 2026-02-13: Added conditional-commit and prompt-shaping coverage for phases 2 and 3.
 * - 2026-02-13: Added chat-switch race coverage and aligned LLM mock response shape to runtime contract.
 */

import { describe, test, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import type { World } from '../../../core/types';
import { LLMProvider } from '../../../core/types';
import { setupWorldActivityListener, subscribeWorldToMessages } from '../../../core/events';

const mocks = vi.hoisted(() => ({
  chatNameById: new Map<string, string>(),
  updateChatData: vi.fn(),
  updateChatNameIfCurrent: vi.fn(),
  loadChatData: vi.fn(),
  getMemory: vi.fn(async (_worldId: string, _chatId: string | null) => [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi! How can I help you?' }
  ]),
  generateAgentResponse: vi.fn(async () => ({
    response: 'Generated Chat Title',
    messageId: 'title-msg-1'
  }))
}));

vi.mock('../../../core/storage/storage-factory', () => ({
  createStorageWithWrappers: async () => ({
    updateChatData: mocks.updateChatData,
    updateChatNameIfCurrent: mocks.updateChatNameIfCurrent,
    loadChatData: mocks.loadChatData,
    getMemory: mocks.getMemory
  }),
}));

vi.mock('../../../core/llm-manager', () => ({
  generateAgentResponse: mocks.generateAgentResponse
}));

describe('World activity-based title update', () => {
  let world: World;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.chatNameById.clear();
    mocks.chatNameById.set('chat-1', 'New Chat');
    mocks.updateChatData.mockImplementation(async (_worldId: string, chatId: string, updates: { name?: string }) => {
      const current = mocks.chatNameById.get(chatId);
      if (!current) return null;
      const nextName = updates.name ?? current;
      mocks.chatNameById.set(chatId, nextName);
      return { id: chatId, name: nextName };
    });
    mocks.updateChatNameIfCurrent.mockImplementation(async (_worldId: string, chatId: string, expectedName: string, nextName: string) => {
      const current = mocks.chatNameById.get(chatId);
      if (current !== expectedName) return false;
      mocks.chatNameById.set(chatId, nextName);
      return true;
    });
    mocks.loadChatData.mockImplementation(async (_worldId: string, chatId: string) => {
      const name = mocks.chatNameById.get(chatId);
      if (!name) return null;
      return { id: chatId, name };
    });
    mocks.getMemory.mockImplementation(async (_worldId: string, _chatId: string | null) => [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi! How can I help you?' }
    ]);
    mocks.generateAgentResponse.mockImplementation(async () => ({
      response: 'Generated Chat Title',
      messageId: 'title-msg-1'
    }));

    world = {
      id: 'world-1',
      name: 'Test World',
      eventEmitter: new EventEmitter(),
      agents: new Map(),
      chats: new Map(),
      currentChatId: 'chat-1',
      chatLLMProvider: LLMProvider.OPENAI,
      chatLLMModel: 'gpt-4',
    } as any;

    world.chats.set('chat-1', { id: 'chat-1', name: 'New Chat' } as any);
    world.agents.set('agent-1', {
      id: 'agent-1',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4',
    } as any);

    // Setup world activity listener
    setupWorldActivityListener(world);
    subscribeWorldToMessages(world);
  });

  test('updates title on idle when chat is New Chat', async () => {
    // Fire idle event (world finished all processing)
    world.eventEmitter.emit('world', {
      type: 'idle',
      pendingOperations: 0,
      activityId: 1,
      timestamp: new Date().toISOString(),
      activeSources: [],
      queue: { queueSize: 0, isProcessing: false, completedCalls: 0, failedCalls: 0 },
      messageId: 'test-msg-id'
    });

    // Allow microtask to run and wait for async title generation
    await new Promise(r => setTimeout(r, 10));

    const chat = world.chats.get('chat-1')!;
    expect(chat.name).not.toBe('New Chat');
    expect(chat.name).toBe('Generated Chat Title');
  });

  test('does not update title if not New Chat', async () => {
    const chat = world.chats.get('chat-1')!;
    chat.name = 'Existing Title';

    world.eventEmitter.emit('world', {
      type: 'idle',
      pendingOperations: 0,
      activityId: 1,
      timestamp: new Date().toISOString(),
      activeSources: [],
      queue: { queueSize: 0, isProcessing: false, completedCalls: 0, failedCalls: 0 },
      messageId: 'test-msg-id'
    });

    await new Promise(r => setTimeout(r, 10));

    expect(world.chats.get('chat-1')!.name).toBe('Existing Title');
  });

  test('does not update title on non-idle events', async () => {
    // Fire response-start event (not idle)
    world.eventEmitter.emit('world', {
      type: 'response-start',
      pendingOperations: 1,
      activityId: 1,
      timestamp: new Date().toISOString(),
      activeSources: ['agent-1'],
      queue: { queueSize: 0, isProcessing: true, completedCalls: 0, failedCalls: 0 },
      messageId: 'test-msg-id'
    });

    await new Promise(r => setTimeout(r, 10));

    // Title should remain unchanged
    expect(world.chats.get('chat-1')!.name).toBe('New Chat');
  });

  test('keeps title update scoped to captured chat when currentChatId changes mid-generation', async () => {
    world.chats.set('chat-2', { id: 'chat-2', name: 'New Chat' } as any);
    mocks.chatNameById.set('chat-2', 'New Chat');

    const crudEvents: any[] = [];
    world.eventEmitter.on('crud', (event: any) => {
      crudEvents.push(event);
    });

    mocks.generateAgentResponse.mockImplementationOnce(async () => {
      await new Promise(r => setTimeout(r, 25));
      return { response: 'Scoped Chat Title', messageId: 'title-msg-2' };
    });

    world.eventEmitter.emit('world', {
      type: 'idle',
      pendingOperations: 0,
      activityId: 1,
      timestamp: new Date().toISOString(),
      activeSources: [],
      queue: { queueSize: 0, isProcessing: false, completedCalls: 0, failedCalls: 0 },
      messageId: 'test-msg-id'
    });

    world.currentChatId = 'chat-2';

    await new Promise(r => setTimeout(r, 40));

    expect(world.chats.get('chat-1')!.name).toBe('Scoped Chat Title');
    expect(world.chats.get('chat-2')!.name).toBe('New Chat');
    expect(mocks.updateChatNameIfCurrent).toHaveBeenCalledWith('world-1', 'chat-1', 'New Chat', 'Scoped Chat Title');
    expect(crudEvents.at(-1)?.entityType).toBe('chat');
    expect(crudEvents.at(-1)?.entityId).toBe('chat-1');
    expect(crudEvents.at(-1)?.entityData).toMatchObject({
      id: 'chat-1',
      name: 'Scoped Chat Title',
      source: 'idle'
    });
  });

  test('skips title commit when chat is no longer default at commit time', async () => {
    mocks.generateAgentResponse.mockImplementationOnce(async () => {
      await new Promise(r => setTimeout(r, 20));
      return { response: 'Should Not Commit', messageId: 'title-msg-3' };
    });

    world.eventEmitter.emit('world', {
      type: 'idle',
      pendingOperations: 0,
      activityId: 1,
      timestamp: new Date().toISOString(),
      activeSources: [],
      queue: { queueSize: 0, isProcessing: false, completedCalls: 0, failedCalls: 0 },
      messageId: 'test-msg-id'
    });

    world.chats.get('chat-1')!.name = 'Manual Name';
    mocks.chatNameById.set('chat-1', 'Manual Name');

    await new Promise(r => setTimeout(r, 35));

    expect(world.chats.get('chat-1')!.name).toBe('Manual Name');
    expect(mocks.updateChatNameIfCurrent).not.toHaveBeenCalled();
  });

  test('builds title prompt from filtered deduplicated bounded chat transcript', async () => {
    const noisyMessages = [
      { role: 'user', content: 'Very old user message', messageId: 'old-1' },
      ...Array.from({ length: 30 }).map((_, index) => ({
        role: index % 2 === 0 ? 'user' : 'assistant',
        content: `Recent turn ${index}`,
        messageId: `msg-${index}`
      })),
      { role: 'tool', content: 'tool output should be ignored', messageId: 'tool-1' },
      { role: 'system', content: 'system note should be ignored', messageId: 'sys-1' },
      { role: 'user', content: 'Duplicate prompt line', messageId: 'dup-1' },
      { role: 'user', content: 'Duplicate prompt line', messageId: 'dup-1' },
    ];

    mocks.getMemory.mockImplementationOnce(async () => noisyMessages as any);

    world.eventEmitter.emit('world', {
      type: 'idle',
      pendingOperations: 0,
      activityId: 1,
      timestamp: new Date().toISOString(),
      activeSources: [],
      queue: { queueSize: 0, isProcessing: false, completedCalls: 0, failedCalls: 0 },
      messageId: 'test-msg-id'
    });

    await new Promise(r => setTimeout(r, 10));

    const promptMessages = mocks.generateAgentResponse.mock.calls.at(-1)?.[2];
    const promptContent = promptMessages?.[0]?.content ?? '';
    const scopedChatId = mocks.generateAgentResponse.mock.calls.at(-1)?.[5];

    expect(promptContent).not.toContain('-tool:');
    expect(promptContent).not.toContain('-system:');
    expect((promptContent.match(/-user: Duplicate prompt line/g) || []).length).toBe(1);
    expect(promptContent).not.toContain('Very old user message');
    expect(promptContent).toContain('Recent turn 29');
    expect(scopedChatId).toBe('chat-1');
  });

  test('uses fallback hierarchy when LLM returns low-quality title', async () => {
    mocks.generateAgentResponse.mockImplementationOnce(async () => ({
      response: 'Title: Chat',
      messageId: 'title-msg-4'
    }));

    world.eventEmitter.emit('world', {
      type: 'idle',
      pendingOperations: 0,
      activityId: 1,
      timestamp: new Date().toISOString(),
      activeSources: [],
      queue: { queueSize: 0, isProcessing: false, completedCalls: 0, failedCalls: 0 },
      messageId: 'test-msg-id'
    });

    await new Promise(r => setTimeout(r, 15));

    expect(world.chats.get('chat-1')!.name).toBe('Hello');
  });

  test('does not rename chat when title generation is canceled', async () => {
    mocks.generateAgentResponse.mockImplementationOnce(async () => {
      throw new Error("LLM call canceled for world 'world-1' chat 'chat-1'.");
    });

    world.eventEmitter.emit('world', {
      type: 'idle',
      pendingOperations: 0,
      activityId: 1,
      timestamp: new Date().toISOString(),
      activeSources: [],
      queue: { queueSize: 0, isProcessing: false, completedCalls: 0, failedCalls: 0 },
      messageId: 'test-msg-id'
    });

    await new Promise(r => setTimeout(r, 15));

    expect(world.chats.get('chat-1')!.name).toBe('New Chat');
    expect(mocks.updateChatNameIfCurrent).not.toHaveBeenCalled();
  });

  test('deduplicates repeated idle events while title generation is in flight', async () => {
    mocks.generateAgentResponse.mockImplementationOnce(async () => {
      await new Promise(r => setTimeout(r, 30));
      return { response: 'Single Title Generation', messageId: 'title-msg-5' };
    });

    const idleEvent = {
      type: 'idle',
      pendingOperations: 0,
      activityId: 1,
      timestamp: new Date().toISOString(),
      activeSources: [],
      queue: { queueSize: 0, isProcessing: false, completedCalls: 0, failedCalls: 0 },
      messageId: 'test-msg-id'
    };

    world.eventEmitter.emit('world', idleEvent);
    world.eventEmitter.emit('world', idleEvent);

    await new Promise(r => setTimeout(r, 45));

    expect(mocks.generateAgentResponse).toHaveBeenCalledTimes(1);
    expect(world.chats.get('chat-1')!.name).toBe('Single Title Generation');
  });

  test('generates title from human message when chat stays idle (no agent activity)', async () => {
    world.eventEmitter.emit('message', {
      sender: 'human',
      content: 'Edited onboarding question',
      timestamp: new Date(),
      messageId: 'msg-edit-1',
      chatId: 'chat-1'
    });

    await new Promise(r => setTimeout(r, 180));

    expect(world.chats.get('chat-1')!.name).toBe('Generated Chat Title');
    expect(mocks.generateAgentResponse).toHaveBeenCalledTimes(1);
  });
});
