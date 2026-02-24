/**
 * Purpose: Validate enhanced event persistence metadata for message flows.
 * Key features:
 * - Verifies persisted metadata for human, agent, mention, and tool-call messages
 * - Verifies recipient/memory flags and delivery ownership metadata
 * - Verifies null chat behavior and owner/delivery consistency
 * Implementation notes:
 * - Uses in-memory event storage with async event-emitter persistence hooks
 * - Uses direct WorldMessageEvent emission to exercise metadata derivation
 * Recent changes:
 * - Removed legacy manual-intervention metadata scenario coverage
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupEventPersistence } from '../../core/events/index.js';
import { publishMessage } from '../../core/events/index.js';
import type { World, Agent, WorldMessageEvent } from '../../core/types.js';
import type { StoredEvent } from '../../core/storage/eventStorage/types.js';
import { EventEmitter } from 'events';
import { createMemoryEventStorage } from '../../core/storage/eventStorage/memoryEventStorage.js';

describe('Enhanced Event Persistence', () => {
  let world: World;
  let agent1: Agent;
  let agent2: Agent;
  let cleanup: () => void;

  beforeEach(async () => {
    agent1 = {
      id: 'agent1',
      name: 'Agent1',
      type: 'assistant',
      provider: 'anthropic' as any,
      model: 'claude-3-5-sonnet-20241022',
      llmCallCount: 0,
      memory: []
    };

    agent2 = {
      id: 'agent2',
      name: 'Agent2',
      type: 'assistant',
      provider: 'anthropic' as any,
      model: 'claude-3-5-sonnet-20241022',
      llmCallCount: 0,
      memory: []
    };

    const eventStorage = await createMemoryEventStorage();

    world = {
      id: 'test-world',
      name: 'Test World',
      turnLimit: 10,
      currentChatId: 'chat-1',
      createdAt: new Date(),
      lastUpdated: new Date(),
      totalAgents: 2,
      totalMessages: 0,
      eventEmitter: new EventEmitter(),
      agents: new Map([
        ['agent1', agent1],
        ['agent2', agent2]
      ]),
      chats: new Map(),
      eventStorage
    };

    cleanup = setupEventPersistence(world);
  });

  afterEach(() => {
    if (cleanup) cleanup();
  });

  it('should persist human message with all agents in ownerAgentIds', async () => {
    publishMessage(world, 'Hello everyone', 'human');

    // Wait for async persistence
    await new Promise(resolve => setTimeout(resolve, 50));

    const events = await world.eventStorage.getEventsByWorldAndChat(world.id, 'chat-1');
    const messageEvent = events.find(e => e.type === 'message');

    expect(messageEvent).toBeDefined();
    expect(messageEvent.meta.ownerAgentIds).toHaveLength(2);
    expect(messageEvent.meta.ownerAgentIds).toContain('agent1');
    expect(messageEvent.meta.ownerAgentIds).toContain('agent2');
    expect(messageEvent.meta.isHumanMessage).toBe(true);
    expect(messageEvent.meta.messageDirection).toBe('broadcast');
  });

  it('should persist agent message with @mention and correct recipient', async () => {
    const messageEvent: WorldMessageEvent = {
      content: '@Agent2 please check this',
      sender: 'agent1',
      messageId: 'msg-1',
      timestamp: new Date(),
      chatId: 'chat-1'
    };

    world.eventEmitter.emit('message', messageEvent);

    await new Promise(resolve => setTimeout(resolve, 50));

    const events = await world.eventStorage.getEventsByWorldAndChat(world.id, 'chat-1');
    const stored = events.find((e: StoredEvent) => e.id === 'msg-1');

    expect(stored).toBeDefined();
    expect(stored.meta.recipientAgentId).toBe('agent2');
    expect(stored.meta.ownerAgentIds).toContain('agent1');
    expect(stored.meta.ownerAgentIds).toContain('agent2');
    expect(stored.meta.isCrossAgentMessage).toBe(true);
    expect(stored.meta.isMemoryOnly).toBe(true);
    expect(stored.meta.messageDirection).toBe('incoming');
  });

  it('should persist agent broadcast without recipient', async () => {
    const messageEvent: WorldMessageEvent = {
      content: 'Task completed successfully',
      sender: 'agent1',
      messageId: 'msg-2',
      timestamp: new Date(),
      chatId: 'chat-1'
    };

    world.eventEmitter.emit('message', messageEvent);

    await new Promise(resolve => setTimeout(resolve, 50));

    const events = await world.eventStorage.getEventsByWorldAndChat(world.id, 'chat-1');
    const stored = events.find((e: StoredEvent) => e.id === 'msg-2');

    expect(stored).toBeDefined();
    expect(stored.meta.recipientAgentId).toBeNull();
    expect(stored.meta.ownerAgentIds).toHaveLength(2);
    expect(stored.meta.isCrossAgentMessage).toBe(false);
    expect(stored.meta.isMemoryOnly).toBe(false);
    expect(stored.meta.messageDirection).toBe('broadcast');
  });

  it('should persist thread metadata for reply messages', async () => {
    const rootMessage: WorldMessageEvent = {
      content: 'Root message',
      sender: 'human',
      messageId: 'msg-root',
      timestamp: new Date(),
      chatId: 'chat-1'
    };

    world.eventEmitter.emit('message', rootMessage);
    await new Promise(resolve => setTimeout(resolve, 50));

    const replyMessage: WorldMessageEvent = {
      content: 'Reply to root',
      sender: 'agent1',
      messageId: 'msg-reply',
      replyToMessageId: 'msg-root',
      timestamp: new Date(),
      chatId: 'chat-1'
    };

    world.eventEmitter.emit('message', replyMessage);
    await new Promise(resolve => setTimeout(resolve, 50));

    const events = await world.eventStorage.getEventsByWorldAndChat(world.id, 'chat-1');
    const reply = events.find((e: StoredEvent) => e.id === 'msg-reply');

    expect(reply).toBeDefined();
    expect(reply.meta.isReply).toBe(true);
    expect(reply.meta.threadDepth).toBe(1);
    expect(reply.meta.threadRootId).toBe('msg-root');
  });

  it('should persist tool call metadata', async () => {
    const messageEvent: any = {
      content: 'Let me read that file',
      sender: 'agent1',
      messageId: 'msg-3',
      timestamp: new Date(),
      chatId: 'chat-1',
      role: 'assistant',
      tool_calls: [
        {
          id: 'call-1',
          type: 'function',
          function: {
            name: 'read_file',
            arguments: '{"path": "/test.txt"}'
          }
        }
      ]
    };

    world.eventEmitter.emit('message', messageEvent);
    await new Promise(resolve => setTimeout(resolve, 50));

    const events = await world.eventStorage.getEventsByWorldAndChat(world.id, 'chat-1');
    const stored = events.find((e: StoredEvent) => e.id === 'msg-3');

    expect(stored).toBeDefined();
    expect(stored.meta.hasToolCalls).toBe(true);
    expect(stored.meta.toolCallCount).toBe(1);
    expect(stored.payload.tool_calls).toHaveLength(1);
  });

  it('should preserve OpenAI protocol fields in payload', async () => {
    const messageEvent: any = {
      content: 'File content here',
      sender: 'human',
      messageId: 'msg-4',
      timestamp: new Date(),
      chatId: 'chat-1',
      role: 'tool',
      tool_call_id: 'call-1'
    };

    world.eventEmitter.emit('message', messageEvent);
    await new Promise(resolve => setTimeout(resolve, 50));

    const events = await world.eventStorage.getEventsByWorldAndChat(world.id, 'chat-1');
    const stored = events.find((e: StoredEvent) => e.id === 'msg-4');

    expect(stored).toBeDefined();
    expect(stored.payload.role).toBe('tool');
    expect(stored.payload.tool_call_id).toBe('call-1');
  });

  it('should set correct flags for cross-agent messages', async () => {
    const crossAgentMessage: WorldMessageEvent = {
      content: '@Agent2 here is the data you requested',
      sender: 'agent1',
      messageId: 'msg-5',
      timestamp: new Date(),
      chatId: 'chat-1'
    };

    world.eventEmitter.emit('message', crossAgentMessage);
    await new Promise(resolve => setTimeout(resolve, 50));

    const events = await world.eventStorage.getEventsByWorldAndChat(world.id, 'chat-1');
    const stored = events.find((e: StoredEvent) => e.id === 'msg-5');

    expect(stored).toBeDefined();
    expect(stored.meta.isCrossAgentMessage).toBe(true);
    expect(stored.meta.isMemoryOnly).toBe(true);
    expect(stored.meta.isHumanMessage).toBe(false);
  });

  it('should resolve recipient for Hello-prefixed direct mention with punctuation', async () => {
    const crossAgentMessage: WorldMessageEvent = {
      content: 'Hello @Agent2, here is the data you requested',
      sender: 'agent1',
      messageId: 'msg-hello-mention',
      timestamp: new Date(),
      chatId: 'chat-1'
    };

    world.eventEmitter.emit('message', crossAgentMessage);
    await new Promise(resolve => setTimeout(resolve, 50));

    const events = await world.eventStorage.getEventsByWorldAndChat(world.id, 'chat-1');
    const stored = events.find((e: StoredEvent) => e.id === 'msg-hello-mention');

    expect(stored).toBeDefined();
    expect(stored.meta.recipientAgentId).toBe('agent2');
    expect(stored.meta.isCrossAgentMessage).toBe(true);
    expect(stored.meta.isMemoryOnly).toBe(true);
  });

  it('should handle null chatId correctly', async () => {
    world.currentChatId = null;

    const messageEvent: WorldMessageEvent = {
      content: 'Message without chat',
      sender: 'human',
      messageId: 'msg-6',
      timestamp: new Date(),
      chatId: null
    };

    world.eventEmitter.emit('message', messageEvent);
    await new Promise(resolve => setTimeout(resolve, 50));

    const events = await world.eventStorage.getEventsByWorldAndChat(world.id, null);
    const stored = events.find((e: StoredEvent) => e.id === 'msg-6');

    expect(stored).toBeDefined();
    expect(stored.chatId).toBeNull();
    expect(stored.meta.chatId).toBeNull();
  });

  it('should calculate deliveredToAgents same as ownerAgentIds', async () => {
    publishMessage(world, 'Test message', 'human');

    await new Promise(resolve => setTimeout(resolve, 50));

    const events = await world.eventStorage.getEventsByWorldAndChat(world.id, 'chat-1');
    const messageEvent = events.find(e => e.type === 'message');

    expect(messageEvent.meta.deliveredToAgents).toEqual(messageEvent.meta.ownerAgentIds);
  });

});
