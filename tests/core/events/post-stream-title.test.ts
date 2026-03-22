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
 * - 2026-03-21: Added regression coverage that persisted display-only synthetic assistant
 *   tool-result rows are excluded from title-generation prompt assembly.
 * - 2026-03-13: Asserted title-generation LLM calls strip world `reasoning_effort` overrides before request dispatch.
 * - 2026-03-10: Added standalone runtime coverage so `startWorld(...)` still binds idle-based
 *   title generation when event persistence is unavailable.
 * - 2026-03-10: Removed the human-message debounce expectation; title generation now requires
 *   an eligible idle activity event.
 * - 2026-02-27: Added idle-activity chatId routing coverage so title generation ignores `world.currentChatId` drift.
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
import { startWorld } from '../../../core/subscription.js';

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
    response: { type: 'text', content: 'Generated Chat Title', assistantMessage: { role: 'assistant', content: 'Generated Chat Title' } },
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
      response: { type: 'text', content: 'Generated Chat Title', assistantMessage: { role: 'assistant', content: 'Generated Chat Title' } },
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
      messageId: 'test-msg-id',
      chatId: 'chat-1'
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
      messageId: 'test-msg-id',
      chatId: 'chat-1'
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

  test('uses idle event chatId instead of world.currentChatId', async () => {
    world.chats.set('chat-2', { id: 'chat-2', name: 'New Chat' } as any);
    mocks.chatNameById.set('chat-2', 'New Chat');
    world.currentChatId = 'chat-2';

    world.eventEmitter.emit('world', {
      type: 'idle',
      pendingOperations: 0,
      activityId: 1,
      timestamp: new Date().toISOString(),
      activeSources: [],
      queue: { queueSize: 0, isProcessing: false, completedCalls: 0, failedCalls: 0 },
      messageId: 'test-msg-id',
      chatId: 'chat-1'
    });

    await new Promise(r => setTimeout(r, 15));

    expect(world.chats.get('chat-1')!.name).toBe('Generated Chat Title');
    expect(world.chats.get('chat-2')!.name).toBe('New Chat');
    expect(mocks.updateChatNameIfCurrent).toHaveBeenCalledWith('world-1', 'chat-1', 'New Chat', 'Generated Chat Title', 'auto');
  });

  test('keeps title update scoped to captured chat when currentChatId changes mid-generation', async () => {
    world.chats.set('chat-2', { id: 'chat-2', name: 'New Chat' } as any);
    mocks.chatNameById.set('chat-2', 'New Chat');

    const systemEvents: any[] = [];
    world.eventEmitter.on('system', (event: any) => {
      systemEvents.push(event);
    });

    mocks.generateAgentResponse.mockImplementationOnce(async () => {
      await new Promise(r => setTimeout(r, 25));
      return { response: { type: 'text', content: 'Scoped Chat Title', assistantMessage: { role: 'assistant', content: 'Scoped Chat Title' } }, messageId: 'title-msg-2' };
    });

    world.eventEmitter.emit('world', {
      type: 'idle',
      pendingOperations: 0,
      activityId: 1,
      timestamp: new Date().toISOString(),
      activeSources: [],
      queue: { queueSize: 0, isProcessing: false, completedCalls: 0, failedCalls: 0 },
      messageId: 'test-msg-id',
      chatId: 'chat-1'
    });

    world.currentChatId = 'chat-2';

    await new Promise(r => setTimeout(r, 40));

    expect(world.chats.get('chat-1')!.name).toBe('Scoped Chat Title');
    expect(world.chats.get('chat-2')!.name).toBe('New Chat');
    expect(mocks.updateChatNameIfCurrent).toHaveBeenCalledWith('world-1', 'chat-1', 'New Chat', 'Scoped Chat Title', 'auto');
    expect(systemEvents.at(-1)?.content).toMatchObject({
      eventType: 'chat-title-updated',
      chatId: 'chat-1',
      title: 'Scoped Chat Title',
      source: 'idle'
    });
  });

  test('skips title commit when chat is no longer default at commit time', async () => {
    mocks.generateAgentResponse.mockImplementationOnce(async () => {
      await new Promise(r => setTimeout(r, 20));
      return { response: { type: 'text', content: 'Should Not Commit', assistantMessage: { role: 'assistant', content: 'Should Not Commit' } }, messageId: 'title-msg-3' };
    });

    world.eventEmitter.emit('world', {
      type: 'idle',
      pendingOperations: 0,
      activityId: 1,
      timestamp: new Date().toISOString(),
      activeSources: [],
      queue: { queueSize: 0, isProcessing: false, completedCalls: 0, failedCalls: 0 },
      messageId: 'test-msg-id',
      chatId: 'chat-1'
    });

    world.chats.get('chat-1')!.name = 'Manual Name';
    mocks.chatNameById.set('chat-1', 'Manual Name');

    await new Promise(r => setTimeout(r, 35));

    expect(world.chats.get('chat-1')!.name).toBe('Manual Name');
    expect(mocks.updateChatNameIfCurrent).not.toHaveBeenCalled();
  });

  test('builds title prompt from bounded multi-turn context window', async () => {
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
      messageId: 'test-msg-id',
      chatId: 'chat-1'
    });

    await new Promise(r => setTimeout(r, 10));

    const latestGenerateCall = mocks.generateAgentResponse.mock.calls.at(-1) as any[] | undefined;
    const promptMessages = latestGenerateCall?.[2] as Array<{ content?: string }> | undefined;
    const promptContent = promptMessages?.[0]?.content ?? '';
    const scopedChatId = latestGenerateCall?.[5];

    expect(promptContent).toContain('-assistant:');
    expect(promptContent).not.toContain('-tool:');
    expect(promptContent).not.toContain('-system:');
    expect((promptContent.match(/-user:/g) || []).length).toBe(4);
    expect(promptContent).toContain('-user: Duplicate prompt line');
    expect(promptContent).not.toContain('Very old user message');
    expect(promptContent).toContain('-assistant: Recent turn 29');
    expect(scopedChatId).toBe('chat-1');
  });

  test('excludes persisted synthetic assistant tool-result rows from title prompt context', async () => {
    mocks.getMemory.mockImplementationOnce(async () => [
      { role: 'user', content: 'Make sheet music SVG', messageId: 'u1' },
      {
        role: 'assistant',
        content: JSON.stringify({
          __type: 'synthetic_assistant_tool_result',
          version: 1,
          displayOnly: true,
          tool: 'shell_cmd',
          tool_call_id: 'call-svg',
          source_message_id: 'tool-msg-1',
          content: '![score](data:image/svg+xml;base64,AAAA)',
        }),
        messageId: 'a-synth-1',
      },
      { role: 'assistant', content: 'I rendered the notation preview below.', messageId: 'a2' },
    ]);

    world.eventEmitter.emit('world', {
      type: 'idle',
      pendingOperations: 0,
      activityId: 1,
      timestamp: new Date().toISOString(),
      activeSources: [],
      queue: { queueSize: 0, isProcessing: false, completedCalls: 0, failedCalls: 0 },
      messageId: 'test-msg-id',
      chatId: 'chat-1'
    });

    await new Promise(r => setTimeout(r, 10));

    const latestGenerateCall = mocks.generateAgentResponse.mock.calls.at(-1) as any[] | undefined;
    const promptMessages = latestGenerateCall?.[2] as Array<{ content?: string }> | undefined;
    const promptContent = promptMessages?.[0]?.content ?? '';

    expect(promptContent).toContain('-user: Make sheet music SVG');
    expect(promptContent).toContain('-assistant: I rendered the notation preview below.');
    expect(promptContent).not.toContain('synthetic_assistant_tool_result');
    expect(promptContent).not.toContain('data:image/svg+xml;base64');
  });

  test('forces reasoning_effort=none in title-generation LLM calls to prevent empty responses from thinking models', async () => {
    world.variables = 'reasoning_effort=high\nworking_directory=/tmp/project';

    world.eventEmitter.emit('world', {
      type: 'idle',
      pendingOperations: 0,
      activityId: 1,
      timestamp: new Date().toISOString(),
      activeSources: [],
      queue: { queueSize: 0, isProcessing: false, completedCalls: 0, failedCalls: 0 },
      messageId: 'test-msg-id',
      chatId: 'chat-1'
    });

    await new Promise(r => setTimeout(r, 10));

    const latestGenerateCall = mocks.generateAgentResponse.mock.calls.at(-1) as any[] | undefined;
    const llmWorld = latestGenerateCall?.[0] as World | undefined;

    expect(llmWorld?.variables).toBe('working_directory=/tmp/project\nreasoning_effort=none');
    expect(llmWorld).not.toBe(world);
    expect(world.variables).toBe('reasoning_effort=high\nworking_directory=/tmp/project');
  });

  test('uses fallback hierarchy when LLM returns low-quality title', async () => {
    mocks.generateAgentResponse.mockImplementationOnce(async () => ({
      response: { type: 'text', content: 'Title: Chat', assistantMessage: { role: 'assistant', content: 'Title: Chat' } },
      messageId: 'title-msg-4'
    }));

    world.eventEmitter.emit('world', {
      type: 'idle',
      pendingOperations: 0,
      activityId: 1,
      timestamp: new Date().toISOString(),
      activeSources: [],
      queue: { queueSize: 0, isProcessing: false, completedCalls: 0, failedCalls: 0 },
      messageId: 'test-msg-id',
      chatId: 'chat-1'
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
      messageId: 'test-msg-id',
      chatId: 'chat-1'
    });

    await new Promise(r => setTimeout(r, 15));

    expect(world.chats.get('chat-1')!.name).toBe('New Chat');
    expect(mocks.updateChatNameIfCurrent).not.toHaveBeenCalled();
  });

  test('deduplicates repeated idle events while title generation is in flight', async () => {
    mocks.generateAgentResponse.mockImplementationOnce(async () => {
      await new Promise(r => setTimeout(r, 30));
      return { response: { type: 'text', content: 'Single Title Generation', assistantMessage: { role: 'assistant', content: 'Single Title Generation' } }, messageId: 'title-msg-5' };
    });

    const idleEvent = {
      type: 'idle',
      pendingOperations: 0,
      activityId: 1,
      timestamp: new Date().toISOString(),
      activeSources: [],
      queue: { queueSize: 0, isProcessing: false, completedCalls: 0, failedCalls: 0 },
      messageId: 'test-msg-id',
      chatId: 'chat-1'
    };

    world.eventEmitter.emit('world', idleEvent);
    world.eventEmitter.emit('world', idleEvent);

    await new Promise(r => setTimeout(r, 45));

    expect(mocks.generateAgentResponse).toHaveBeenCalledTimes(1);
    expect(world.chats.get('chat-1')!.name).toBe('Single Title Generation');
  });

  test('does not generate title from a human message without an idle activity event', async () => {
    world.eventEmitter.emit('message', {
      sender: 'human',
      content: 'Edited onboarding question',
      timestamp: new Date(),
      messageId: 'msg-edit-1',
      chatId: 'chat-1'
    });

    await new Promise(r => setTimeout(r, 180));

    expect(world.chats.get('chat-1')!.name).toBe('New Chat');
    expect(mocks.generateAgentResponse).not.toHaveBeenCalled();
  });

  test('startWorld binds idle title generation for standalone worlds without persistence', async () => {
    const standaloneWorld = {
      id: 'world-standalone',
      name: 'Standalone World',
      eventEmitter: new EventEmitter(),
      agents: new Map(),
      chats: new Map(),
      currentChatId: 'chat-1',
      chatLLMProvider: LLMProvider.OPENAI,
      chatLLMModel: 'gpt-4',
    } as any as World;

    standaloneWorld.chats.set('chat-1', { id: 'chat-1', name: 'New Chat' } as any);
    mocks.chatNameById.set('chat-1', 'New Chat');

    const subscription = await startWorld(standaloneWorld, { isOpen: true });

    standaloneWorld.eventEmitter.emit('world', {
      type: 'idle',
      pendingOperations: 0,
      activityId: 1,
      timestamp: new Date().toISOString(),
      activeSources: [],
      queue: { queueSize: 0, isProcessing: false, completedCalls: 0, failedCalls: 0 },
      messageId: 'standalone-idle-1',
      chatId: 'chat-1'
    });

    await new Promise(r => setTimeout(r, 15));

    expect(standaloneWorld.chats.get('chat-1')!.name).toBe('Generated Chat Title');

    await subscription.unsubscribe();
  });

  // ── Phase 1: weak-fallback no-commit ───────────────────────────────────────

  test('does not commit title when LLM returns empty string and all user messages are also generic', async () => {
    mocks.getMemory.mockImplementationOnce(async () => [
      { role: 'user', content: 'new chat', messageId: 'u1' },
    ]);
    mocks.generateAgentResponse.mockImplementationOnce(async () => ({
      response: { type: 'text', content: '', assistantMessage: { role: 'assistant', content: '' } },
      messageId: 'empty-title-msg'
    }));

    world.eventEmitter.emit('world', {
      type: 'idle',
      pendingOperations: 0,
      activityId: 1,
      timestamp: new Date().toISOString(),
      activeSources: [],
      queue: { queueSize: 0, isProcessing: false, completedCalls: 0, failedCalls: 0 },
      messageId: 'test-msg-id',
      chatId: 'chat-1'
    });

    await new Promise(r => setTimeout(r, 15));

    expect(world.chats.get('chat-1')!.name).toBe('New Chat');
    expect(mocks.updateChatNameIfCurrent).not.toHaveBeenCalled();
  });

  test('does not commit verbatim long user message when LLM returns empty string', async () => {
    const longUserMessage = '@gemini search most recent 10 youtube videos about google stitch';
    mocks.getMemory.mockImplementationOnce(async () => [
      { role: 'user', content: longUserMessage, messageId: 'u1' },
    ]);
    mocks.generateAgentResponse.mockImplementationOnce(async () => ({
      response: { type: 'text', content: '', assistantMessage: { role: 'assistant', content: '' } },
      messageId: 'empty-title-msg-2'
    }));

    world.eventEmitter.emit('world', {
      type: 'idle',
      pendingOperations: 0,
      activityId: 1,
      timestamp: new Date().toISOString(),
      activeSources: [],
      queue: { queueSize: 0, isProcessing: false, completedCalls: 0, failedCalls: 0 },
      messageId: 'test-msg-id',
      chatId: 'chat-1'
    });

    await new Promise(r => setTimeout(r, 15));

    expect(world.chats.get('chat-1')!.name).toBe('New Chat');
    expect(mocks.updateChatNameIfCurrent).not.toHaveBeenCalled();
  });

  test('strips embedded double quotes from LLM-generated title', async () => {
    mocks.generateAgentResponse.mockResolvedValueOnce({
      response: { type: 'text', content: 'Searching YouTube for "OpenClaw"', assistantMessage: { role: 'assistant', content: 'Searching YouTube for "OpenClaw"' } },
      messageId: 'title-msg-quote'
    });
    world.eventEmitter.emit('world', {
      type: 'idle',
      pendingOperations: 0,
      activityId: 1,
      timestamp: new Date().toISOString(),
      activeSources: [],
      queue: { queueSize: 0, isProcessing: false, completedCalls: 0, failedCalls: 0 },
      messageId: 'test-msg-id',
      chatId: 'chat-1'
    });
    await new Promise(r => setTimeout(r, 15));
    expect(world.chats.get('chat-1')!.name).toBe('Searching YouTube for OpenClaw');
  });

  test('does not commit title when LLM returns a generic title and all user messages are also generic', async () => {
    mocks.getMemory.mockImplementationOnce(async () => [
      { role: 'user', content: 'chat session', messageId: 'u1' },
    ]);
    mocks.generateAgentResponse.mockImplementationOnce(async () => ({
      response: { type: 'text', content: 'session', assistantMessage: { role: 'assistant', content: 'session' } },
      messageId: 'generic-title-msg'
    }));

    world.eventEmitter.emit('world', {
      type: 'idle',
      pendingOperations: 0,
      activityId: 1,
      timestamp: new Date().toISOString(),
      activeSources: [],
      queue: { queueSize: 0, isProcessing: false, completedCalls: 0, failedCalls: 0 },
      messageId: 'test-msg-id',
      chatId: 'chat-1'
    });

    await new Promise(r => setTimeout(r, 15));

    expect(world.chats.get('chat-1')!.name).toBe('New Chat');
    expect(mocks.updateChatNameIfCurrent).not.toHaveBeenCalled();
  });

  // ── Phase 3d: provenance in runtime cache ──────────────────────────────────

  test('sets titleProvenance = auto in runtime cache after successful title commit', async () => {
    world.eventEmitter.emit('world', {
      type: 'idle',
      pendingOperations: 0,
      activityId: 1,
      timestamp: new Date().toISOString(),
      activeSources: [],
      queue: { queueSize: 0, isProcessing: false, completedCalls: 0, failedCalls: 0 },
      messageId: 'test-msg-id',
      chatId: 'chat-1'
    });

    await new Promise(r => setTimeout(r, 15));

    expect(world.chats.get('chat-1')!.name).toBe('Generated Chat Title');
    expect((world.chats.get('chat-1') as any).titleProvenance).toBe('auto');
  });

  test('does not set titleProvenance when commit is skipped due to race', async () => {
    mocks.generateAgentResponse.mockImplementationOnce(async () => {
      await new Promise(r => setTimeout(r, 20));
      return { response: { type: 'text', content: 'Raced Title', assistantMessage: { role: 'assistant', content: 'Raced Title' } }, messageId: 'race-msg' };
    });

    world.eventEmitter.emit('world', {
      type: 'idle',
      pendingOperations: 0,
      activityId: 1,
      timestamp: new Date().toISOString(),
      activeSources: [],
      queue: { queueSize: 0, isProcessing: false, completedCalls: 0, failedCalls: 0 },
      messageId: 'test-msg-id',
      chatId: 'chat-1'
    });

    // Manually rename the chat before the async commit completes
    world.chats.get('chat-1')!.name = 'Manual Name';
    mocks.chatNameById.set('chat-1', 'Manual Name');

    await new Promise(r => setTimeout(r, 35));

    // CAS fails, so provenance must not be set to 'auto'
    expect(world.chats.get('chat-1')!.name).toBe('Manual Name');
    expect((world.chats.get('chat-1') as any).titleProvenance).not.toBe('auto');
  });
});
