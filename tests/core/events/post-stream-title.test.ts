/**
 * Post-stream Chat Title Update Tests
 *
 * Verifies that chat title is updated after streaming completes (SSE 'end'),
 * using current chat's stored messages and not causing mid-stream refresh.
 */

import { describe, test, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import type { World, Agent } from '../../../core/types';
import { LLMProvider } from '../../../core/types';
import { publishSSE, subscribeWorldToMessages } from '../../../core/events';

vi.mock('../../../core/storage/storage-factory', () => ({
  createStorageWithWrappers: async () => ({
    updateChatData: vi.fn(),
    getMemory: vi.fn(async (_worldId: string, _chatId: string | null) => [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi! How can I help you?' }
    ])
  }),
}));

vi.mock('../../../core/llm-manager', () => ({
  generateAgentResponse: vi.fn(async () => 'Generated Chat Title')
}));

describe('Post-stream title update', () => {
  let world: World;
  let agent: Agent;

  beforeEach(() => {

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

    agent = {
      id: 'agent-1',
      name: 'Agent',
      type: 'assistant',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4',
      systemPrompt: 'You are helpful',
      memory: [],
      llmCallCount: 0,
      createdAt: new Date(),
      lastActive: new Date(),
    } as any;

    // Ensure message subscription installed (no-op for pre-stream in current impl)
    subscribeWorldToMessages(world);
  });

  test('updates title on SSE end when chat is New Chat', async () => {
    // Fire SSE end event (mimic end of streaming)
    publishSSE(world, { agentName: agent.id, type: 'end' });

    // Allow microtask to run and wait for async title generation
    await new Promise(r => setTimeout(r, 10));

    const chat = world.chats.get('chat-1')!;
    expect(chat.name).not.toBe('New Chat');
    // Title should be either from LLM or fallback from first user message
    expect(chat.name).toMatch(/Generated Chat Title|Hello/);
  });

  test('does not update title if not New Chat', async () => {
    const chat = world.chats.get('chat-1')!;
    chat.name = 'Existing Title';

    publishSSE(world, { agentName: agent.id, type: 'end' });
    await new Promise(r => setTimeout(r, 0));

    expect(world.chats.get('chat-1')!.name).toBe('Existing Title');
  });
});
