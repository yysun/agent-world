/**
 * Agent Message Persistence Test
 * 
 * Verifies that agent response messages are persisted to event storage
 * in addition to agent memory.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { createWorld, getWorld, deleteWorld, createAgent } from '../../core/managers.js';
import { publishMessageWithId } from '../../core/events.js';
import { LLMProvider } from '../../core/types.js';

describe('Agent Message Persistence', () => {
  let worldId: string;

  beforeEach(async () => {
    const world = await createWorld({
      name: 'test-agent-msg-persistence',
      turnLimit: 5
    });
    worldId = world!.id;
  });

  afterEach(async () => {
    if (worldId) {
      await deleteWorld(worldId);
    }
  });

  test('should persist agent messages to events table', async () => {
    const world = await getWorld(worldId);
    expect(world).toBeTruthy();
    expect(world!.eventStorage).toBeDefined();

    // Create an agent
    const agent = await createAgent(worldId, {
      name: 'TestAgent',
      type: 'assistant',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4'
    });

    // Publish an agent message (simulating agent response)
    const messageId = 'test-agent-msg-123';
    publishMessageWithId(
      world!,
      'This is an agent response',
      agent.id,
      messageId,
      world!.currentChatId
    );

    // Query for message events
    const events = await world!.eventStorage!.getEventsByWorldAndChat(
      worldId,
      world!.currentChatId,
      { types: ['message'] }
    );

    // Verify agent message was persisted
    expect(events.length).toBeGreaterThan(0);
    const agentMessage = events.find((e: any) => e.id === messageId);

    expect(agentMessage).toBeDefined();
    expect(agentMessage!.type).toBe('message');
    expect(agentMessage!.payload.sender).toBe(agent.id);
    expect(agentMessage!.payload.content).toBe('This is an agent response');
    expect(agentMessage!.chatId).toBe(world!.currentChatId);
  });

  test('should persist both human and agent messages', async () => {
    const world = await getWorld(worldId);

    // Create an agent
    const agent = await createAgent(worldId, {
      name: 'TestAgent',
      type: 'assistant',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4'
    });

    // Publish human message
    publishMessageWithId(
      world!,
      'Hello agent',
      'HUMAN',
      'human-msg-456',
      world!.currentChatId
    );

    // Publish agent message
    publishMessageWithId(
      world!,
      'Hello human',
      agent.id,
      'agent-msg-789',
      world!.currentChatId
    );

    // Query for all message events
    const events = await world!.eventStorage!.getEventsByWorldAndChat(
      worldId,
      world!.currentChatId,
      { types: ['message'] }
    );

    // Should have both messages
    expect(events.length).toBeGreaterThanOrEqual(2);

    const humanMsg = events.find((e: any) => e.payload.sender === 'HUMAN');
    const agentMsg = events.find((e: any) => e.payload.sender === agent.id);

    expect(humanMsg).toBeDefined();
    expect(agentMsg).toBeDefined();
  });
});
