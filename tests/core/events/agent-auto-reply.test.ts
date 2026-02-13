/**
 * Unit Tests for agent autoReply behavior
 *
 * Validates per-agent auto-reply toggle in text response handling.
 *
 * Key features:
 * - autoReply=true keeps sender auto-mention behavior
 * - autoReply=false disables sender auto-mention behavior
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import type { World, Agent, WorldMessageEvent } from '../../../core/types.js';

const saveAgentMock = vi.fn();
const publishMessageWithIdMock = vi.fn();

vi.mock('../../../core/storage/storage-factory.js', () => ({
  createStorageWithWrappers: vi.fn().mockResolvedValue({
    saveAgent: saveAgentMock
  })
}));

vi.mock('../../../core/events/publishers.js', () => ({
  publishMessage: vi.fn(),
  publishMessageWithId: publishMessageWithIdMock,
  publishSSE: vi.fn(),
  publishEvent: vi.fn(),
  isStreamingEnabled: vi.fn().mockReturnValue(false)
}));

function createWorld(): World {
  return {
    id: 'world-1',
    name: 'World 1',
    turnLimit: 5,
    createdAt: new Date(),
    lastUpdated: new Date(),
    totalAgents: 0,
    totalMessages: 0,
    eventEmitter: new EventEmitter(),
    agents: new Map(),
    chats: new Map()
  } as World;
}

function createAgent(autoReply: boolean): Agent {
  return {
    id: 'agent-a',
    name: 'Agent A',
    type: 'default',
    autoReply,
    provider: 'openai' as any,
    model: 'gpt-4',
    llmCallCount: 0,
    memory: []
  };
}

function createMessageEvent(): WorldMessageEvent {
  return {
    content: 'Question for you',
    sender: 'agent-b',
    timestamp: new Date(),
    messageId: 'msg-user-1',
    chatId: 'chat-1'
  };
}

describe('handleTextResponse autoReply', () => {
  beforeEach(() => {
    saveAgentMock.mockReset();
    publishMessageWithIdMock.mockReset();
  });

  it('auto-mentions sender when autoReply is true', async () => {
    const { handleTextResponse } = await import('../../../core/events/memory-manager.js');
    const world = createWorld();
    const agent = createAgent(true);
    const messageEvent = createMessageEvent();

    await handleTextResponse(world, agent, 'I can help', 'msg-assistant-1', messageEvent, 'chat-1');

    expect(agent.memory[0]?.content).toBe('@agent-b I can help');
    expect(publishMessageWithIdMock).toHaveBeenCalledWith(
      world,
      '@agent-b I can help',
      'agent-a',
      'msg-assistant-1',
      'chat-1',
      'msg-user-1'
    );
  });

  it('does not auto-mention sender when autoReply is false', async () => {
    const { handleTextResponse } = await import('../../../core/events/memory-manager.js');
    const world = createWorld();
    const agent = createAgent(false);
    const messageEvent = createMessageEvent();

    await handleTextResponse(world, agent, 'I can help', 'msg-assistant-2', messageEvent, 'chat-1');

    expect(agent.memory[0]?.content).toBe('I can help');
    expect(publishMessageWithIdMock).toHaveBeenCalledWith(
      world,
      'I can help',
      'agent-a',
      'msg-assistant-2',
      'chat-1',
      'msg-user-1'
    );
  });
});
