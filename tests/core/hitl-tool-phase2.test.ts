/**
 * Phase 2 Tests: HITL Detection, Memory Storage & Filtering
 * 
 * Validates:
 * - client.humanIntervention detected in subscribeAgentToMessages
 * - HITL requests saved to agent memory with incomplete status
 * - No duplicate saves
 * - filterClientSideMessages removes client.humanIntervention
 * - filterClientSideMessages removes hitl_* tool results
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import type { World, Agent, WorldMessageEvent } from '../../core/types.js';
import { subscribeAgentToMessages } from '../../core/events/subscribers.js';
import { filterClientSideMessages } from '../../core/message-prep.js';

describe('Phase 2: HITL Detection & Memory Storage', () => {
  let world: World;
  let agent: Agent;

  beforeEach(() => {
    world = {
      id: 'test-world',
      name: 'Test World',
      description: 'Test',
      turnLimit: 5,
      eventEmitter: new EventEmitter(),
      agents: new Map(),
      chats: new Map(),
      currentChatId: 'chat-1'
    } as World;

    agent = {
      id: 'agent-1',
      name: 'Test Agent',
      type: 'assistant',
      status: 'active',
      provider: 'openai',
      model: 'gpt-4',
      systemPrompt: 'Test',
      memory: [],
      llmCallCount: 0,
      createdAt: new Date(),
      lastActive: new Date()
    } as Agent;

    world.agents.set(agent.id, agent);
  });

  it('should detect client.humanIntervention in tool_calls', async () => {
    const cleanup = subscribeAgentToMessages(world, agent);

    const messageEvent: WorldMessageEvent = {
      content: '',
      sender: agent.id,
      timestamp: new Date(),
      messageId: 'msg-1',
      chatId: 'chat-1',
      role: 'assistant',
      tool_calls: [{
        id: 'hitl_123',
        type: 'function',
        function: {
          name: 'client.humanIntervention',
          arguments: JSON.stringify({
            prompt: 'Choose',
            options: ['A', 'B'],
            originalToolCall: { id: 'call_123', name: 'human_intervention.request', args: {} }
          })
        }
      }],
      toolCallStatus: {
        'hitl_123': { complete: false, result: null }
      }
    } as any;

    world.eventEmitter.emit('message', messageEvent);

    // Give async handler time to process
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(agent.memory).toHaveLength(1);
    expect(agent.memory[0].role).toBe('assistant');
    expect(agent.memory[0].tool_calls).toHaveLength(1);
    expect(agent.memory[0].tool_calls![0].function.name).toBe('client.humanIntervention');
    expect(agent.memory[0].toolCallStatus).toBeDefined();
    expect(agent.memory[0].toolCallStatus!['hitl_123'].complete).toBe(false);

    cleanup();
  });

  it('should prevent duplicate saves of HITL requests', async () => {
    const cleanup = subscribeAgentToMessages(world, agent);

    const messageEvent: WorldMessageEvent = {
      content: '',
      sender: agent.id,
      timestamp: new Date(),
      messageId: 'msg-1',
      chatId: 'chat-1',
      role: 'assistant',
      tool_calls: [{
        id: 'hitl_123',
        type: 'function',
        function: {
          name: 'client.humanIntervention',
          arguments: JSON.stringify({ prompt: 'Choose', options: ['A', 'B'] })
        }
      }],
      toolCallStatus: { 'hitl_123': { complete: false, result: null } }
    } as any;

    // Emit twice
    world.eventEmitter.emit('message', messageEvent);
    await new Promise(resolve => setTimeout(resolve, 50));
    world.eventEmitter.emit('message', messageEvent);
    await new Promise(resolve => setTimeout(resolve, 50));

    // Should only be saved once
    expect(agent.memory).toHaveLength(1);

    cleanup();
  });

  it('should save HITL request only for the target agent', async () => {
    const agent2: Agent = {
      ...agent,
      id: 'agent-2',
      memory: []
    };
    world.agents.set(agent2.id, agent2);

    const cleanup1 = subscribeAgentToMessages(world, agent);
    const cleanup2 = subscribeAgentToMessages(world, agent2);

    const messageEvent: WorldMessageEvent = {
      content: '',
      sender: agent.id,  // From agent-1
      timestamp: new Date(),
      messageId: 'msg-1',
      chatId: 'chat-1',
      role: 'assistant',
      tool_calls: [{
        id: 'hitl_123',
        type: 'function',
        function: {
          name: 'client.humanIntervention',
          arguments: JSON.stringify({ prompt: 'Choose', options: ['A', 'B'] })
        }
      }],
      toolCallStatus: { 'hitl_123': { complete: false, result: null } }
    } as any;

    world.eventEmitter.emit('message', messageEvent);
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(agent.memory).toHaveLength(1);  // agent-1 should have it
    expect(agent2.memory).toHaveLength(0); // agent-2 should NOT have it

    cleanup1();
    cleanup2();
  });
});

describe('Phase 2: Message Filtering', () => {
  it('should filter client.humanIntervention from tool_calls', () => {
    const messages = [
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'hitl_123',
            type: 'function',
            function: {
              name: 'client.humanIntervention',
              arguments: '{}'
            }
          },
          {
            id: 'call_456',
            type: 'function',
            function: {
              name: 'some_other_tool',
              arguments: '{}'
            }
          }
        ],
        createdAt: new Date()
      }
    ] as any;

    const filtered = filterClientSideMessages(messages);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].tool_calls).toHaveLength(1);
    expect(filtered[0].tool_calls![0].function.name).toBe('some_other_tool');
  });

  it('should drop assistant message with only client.humanIntervention', () => {
    const messages = [
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'hitl_123',
            type: 'function',
            function: {
              name: 'client.humanIntervention',
              arguments: '{}'
            }
          }
        ],
        createdAt: new Date()
      }
    ] as any;

    const filtered = filterClientSideMessages(messages);

    expect(filtered).toHaveLength(0);
  });

  it('should filter hitl_* tool results', () => {
    const messages = [
      {
        role: 'tool',
        tool_call_id: 'hitl_123',
        content: 'Blue-Green',
        createdAt: new Date()
      },
      {
        role: 'tool',
        tool_call_id: 'call_456',
        content: 'some result',
        createdAt: new Date()
      }
    ] as any;

    const filtered = filterClientSideMessages(messages);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].tool_call_id).toBe('call_456');
  });

  it('should keep approval_* filtering working', () => {
    const messages = [
      {
        role: 'tool',
        tool_call_id: 'approval_123',
        content: 'approved',
        createdAt: new Date()
      }
    ] as any;

    const filtered = filterClientSideMessages(messages);

    expect(filtered).toHaveLength(0);
  });

  it('should filter both client.requestApproval and client.humanIntervention', () => {
    const messages = [
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'approval_123',
            type: 'function',
            function: {
              name: 'client.requestApproval',
              arguments: '{}'
            }
          },
          {
            id: 'hitl_456',
            type: 'function',
            function: {
              name: 'client.humanIntervention',
              arguments: '{}'
            }
          }
        ],
        createdAt: new Date()
      }
    ] as any;

    const filtered = filterClientSideMessages(messages);

    expect(filtered).toHaveLength(0);
  });
});
