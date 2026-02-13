/**
 * Unit Tests for world mainAgent message routing
 *
 * Validates world-level main-agent behavior for incoming human messages.
 *
 * Key features:
 * - Prepends @mainAgent to human messages when configured
 * - Leaves message unchanged when no mainAgent configured
 * - Avoids duplicate prepend when message already targets main agent first
 * - Resolves configured main agent from agent name to agent id mention token
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import type { World, Agent } from '../../../core/types.js';

const shouldAgentRespondMock = vi.fn();
const processAgentMessageMock = vi.fn();
const saveIncomingMessageToMemoryMock = vi.fn();
const resetLLMCallCountIfNeededMock = vi.fn();

vi.mock('../../../core/events/orchestrator.js', () => ({
  shouldAgentRespond: shouldAgentRespondMock,
  processAgentMessage: processAgentMessageMock
}));

vi.mock('../../../core/events/memory-manager.js', () => ({
  saveIncomingMessageToMemory: saveIncomingMessageToMemoryMock,
  resetLLMCallCountIfNeeded: resetLLMCallCountIfNeededMock,
  generateChatTitleFromMessages: vi.fn()
}));

vi.mock('../../../core/storage/storage-factory.js', () => ({
  createStorageWithWrappers: vi.fn().mockResolvedValue({
    loadChatData: vi.fn().mockResolvedValue(null),
    updateChatData: vi.fn().mockResolvedValue(null)
  })
}));

function createWorldWithAgents(mainAgent?: string | null): World {
  const alice: Agent = {
    id: 'alice-agent',
    name: 'Alice Agent',
    type: 'default',
    provider: 'openai' as any,
    model: 'gpt-4',
    llmCallCount: 0,
    memory: []
  };

  return {
    id: 'world-1',
    name: 'World 1',
    turnLimit: 5,
    mainAgent: mainAgent ?? null,
    createdAt: new Date(),
    lastUpdated: new Date(),
    totalAgents: 1,
    totalMessages: 0,
    eventEmitter: new EventEmitter(),
    agents: new Map([[alice.id, alice]]),
    chats: new Map()
  } as World;
}

describe('subscribeAgentToMessages mainAgent routing', () => {
  beforeEach(() => {
    shouldAgentRespondMock.mockReset();
    processAgentMessageMock.mockReset();
    saveIncomingMessageToMemoryMock.mockReset();
    resetLLMCallCountIfNeededMock.mockReset();
    shouldAgentRespondMock.mockResolvedValue(false);
  });

  it('prepends @mainAgent for human message when configured', async () => {
    const { subscribeAgentToMessages } = await import('../../../core/events/subscribers.js');
    const world = createWorldWithAgents('alice-agent');
    const agent = world.agents.get('alice-agent')!;
    const unsubscribe = subscribeAgentToMessages(world, agent);

    world.eventEmitter.emit('message', {
      content: 'Hello team',
      sender: 'human',
      timestamp: new Date(),
      messageId: 'msg-1',
      chatId: 'chat-1'
    });

    await vi.waitFor(() => {
      expect(shouldAgentRespondMock).toHaveBeenCalledTimes(1);
    });

    const routedEvent = shouldAgentRespondMock.mock.calls[0][2];
    expect(routedEvent.content).toBe('@alice-agent Hello team');

    unsubscribe();
  });

  it('keeps content unchanged when mainAgent is not configured', async () => {
    const { subscribeAgentToMessages } = await import('../../../core/events/subscribers.js');
    const world = createWorldWithAgents(null);
    const agent = world.agents.get('alice-agent')!;
    const unsubscribe = subscribeAgentToMessages(world, agent);

    world.eventEmitter.emit('message', {
      content: 'Hello team',
      sender: 'human',
      timestamp: new Date(),
      messageId: 'msg-2',
      chatId: 'chat-1'
    });

    await vi.waitFor(() => {
      expect(shouldAgentRespondMock).toHaveBeenCalledTimes(1);
    });

    const routedEvent = shouldAgentRespondMock.mock.calls[0][2];
    expect(routedEvent.content).toBe('Hello team');

    unsubscribe();
  });

  it('does not duplicate mention when first paragraph mention is already main agent', async () => {
    const { subscribeAgentToMessages } = await import('../../../core/events/subscribers.js');
    const world = createWorldWithAgents('alice-agent');
    const agent = world.agents.get('alice-agent')!;
    const unsubscribe = subscribeAgentToMessages(world, agent);

    world.eventEmitter.emit('message', {
      content: '@alice-agent Hello team',
      sender: 'human',
      timestamp: new Date(),
      messageId: 'msg-3',
      chatId: 'chat-1'
    });

    await vi.waitFor(() => {
      expect(shouldAgentRespondMock).toHaveBeenCalledTimes(1);
    });

    const routedEvent = shouldAgentRespondMock.mock.calls[0][2];
    expect(routedEvent.content).toBe('@alice-agent Hello team');

    unsubscribe();
  });

  it('does not prepend mainAgent when message already has another leading mention', async () => {
    const { subscribeAgentToMessages } = await import('../../../core/events/subscribers.js');
    const world = createWorldWithAgents('alice-agent');
    const agent = world.agents.get('alice-agent')!;
    const unsubscribe = subscribeAgentToMessages(world, agent);

    world.eventEmitter.emit('message', {
      content: '@other-agent Hello team',
      sender: 'human',
      timestamp: new Date(),
      messageId: 'msg-3b',
      chatId: 'chat-1'
    });

    await vi.waitFor(() => {
      expect(shouldAgentRespondMock).toHaveBeenCalledTimes(1);
    });

    const routedEvent = shouldAgentRespondMock.mock.calls[0][2];
    expect(routedEvent.content).toBe('@other-agent Hello team');

    unsubscribe();
  });

  it('resolves mainAgent configured by agent name and routes to agent id mention', async () => {
    const { subscribeAgentToMessages } = await import('../../../core/events/subscribers.js');
    const world = createWorldWithAgents('Alice Agent');
    const agent = world.agents.get('alice-agent')!;
    const unsubscribe = subscribeAgentToMessages(world, agent);

    world.eventEmitter.emit('message', {
      content: 'Need help',
      sender: 'human',
      timestamp: new Date(),
      messageId: 'msg-4',
      chatId: 'chat-1'
    });

    await vi.waitFor(() => {
      expect(shouldAgentRespondMock).toHaveBeenCalledTimes(1);
    });

    const routedEvent = shouldAgentRespondMock.mock.calls[0][2];
    expect(routedEvent.content).toBe('@alice-agent Need help');

    unsubscribe();
  });

  it('does not prepend when configured mainAgent cannot be resolved to an existing agent', async () => {
    const { subscribeAgentToMessages } = await import('../../../core/events/subscribers.js');
    const world = createWorldWithAgents('ghost-agent');
    const agent = world.agents.get('alice-agent')!;
    const unsubscribe = subscribeAgentToMessages(world, agent);

    world.eventEmitter.emit('message', {
      content: 'Need help',
      sender: 'human',
      timestamp: new Date(),
      messageId: 'msg-5',
      chatId: 'chat-1'
    });

    await vi.waitFor(() => {
      expect(shouldAgentRespondMock).toHaveBeenCalledTimes(1);
    });

    const routedEvent = shouldAgentRespondMock.mock.calls[0][2];
    expect(routedEvent.content).toBe('Need help');

    unsubscribe();
  });
});
