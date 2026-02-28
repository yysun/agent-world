/**
 * Memory Manager Behavioral Tests
 *
 * Purpose:
 * - Cover high-value memory-manager paths not exercised by existing guard/title suites.
 *
 * Key features:
 * - Incoming-message persistence guards (self-sender, duplicate messageId, fallback chat scope).
 * - LLM turn-count reset behavior for human/world vs non-human senders.
 * - Tool continuation branches: plain-text tool intent fallback, missing tool definition,
 *   malformed tool-call argument handling, and pending tool-call resume.
 *
 * Notes:
 * - Uses in-memory world/agent objects and mocked storage/LLM/tool layers only.
 * - No real filesystem, database, or external LLM/tool network calls.
 */

import { EventEmitter } from 'events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Agent, World, WorldMessageEvent } from '../../../core/types.js';

const mocks = vi.hoisted(() => ({
  saveAgent: vi.fn(async () => undefined),
  getMemory: vi.fn(async () => []),
  prepareMessagesForLLM: vi.fn(async () => []),
  generateAgentResponse: vi.fn(),
  publishMessageWithId: vi.fn(),
  publishEvent: vi.fn(),
  publishToolEvent: vi.fn(),
  getMCPToolsForWorld: vi.fn(async () => ({})),
  loadSkillExecute: vi.fn(async () => '<skill_context id="find-skills"><instructions># Skill</instructions></skill_context>'),
}));

vi.mock('../../../core/storage/storage-factory.js', () => ({
  createStorageWithWrappers: vi.fn(async () => ({
    saveAgent: mocks.saveAgent,
    getMemory: mocks.getMemory,
  })),
}));

vi.mock('../../../core/utils.js', async () => {
  const actual = await vi.importActual<typeof import('../../../core/utils.js')>('../../../core/utils.js');
  return {
    ...actual,
    prepareMessagesForLLM: mocks.prepareMessagesForLLM,
  };
});

vi.mock('../../../core/llm-manager.js', async () => {
  const actual = await vi.importActual<typeof import('../../../core/llm-manager.js')>('../../../core/llm-manager.js');
  return {
    ...actual,
    generateAgentResponse: mocks.generateAgentResponse,
  };
});

vi.mock('../../../core/mcp-server-registry.js', () => ({
  getMCPToolsForWorld: mocks.getMCPToolsForWorld,
}));

vi.mock('../../../core/events/publishers.js', () => ({
  publishMessage: vi.fn(),
  publishMessageWithId: mocks.publishMessageWithId,
  publishSSE: vi.fn(),
  publishEvent: mocks.publishEvent,
  publishToolEvent: mocks.publishToolEvent,
  isStreamingEnabled: vi.fn().mockReturnValue(false),
}));

function createWorld(): World {
  return {
    id: 'world-1',
    name: 'World 1',
    createdAt: new Date(),
    lastUpdated: new Date(),
    turnLimit: 20,
    totalAgents: 1,
    totalMessages: 0,
    currentChatId: 'chat-1',
    variables: 'working_directory=/tmp/work',
    eventEmitter: new EventEmitter(),
    agents: new Map(),
    chats: new Map(),
  } as World;
}

function createAgent(): Agent {
  return {
    id: 'agent-a',
    name: 'Agent A',
    type: 'assistant',
    provider: 'openai' as any,
    model: 'gpt-4o-mini',
    llmCallCount: 0,
    memory: [],
  } as Agent;
}

function createMessageEvent(overrides: Partial<WorldMessageEvent> = {}): WorldMessageEvent {
  return {
    content: overrides.content ?? 'hello',
    sender: overrides.sender ?? 'human',
    timestamp: overrides.timestamp ?? new Date('2026-02-27T15:00:00.000Z'),
    messageId: overrides.messageId ?? 'msg-1',
    chatId: overrides.chatId,
    replyToMessageId: overrides.replyToMessageId,
  };
}

function textResult(messageId: string, content: string) {
  return {
    response: {
      type: 'text' as const,
      content,
      assistantMessage: { role: 'assistant' as const, content },
    },
    messageId,
  };
}

function toolCallResult(
  messageId: string,
  toolName: string,
  rawArgs: string,
  toolCallId = 'tc-1'
) {
  return {
    response: {
      type: 'tool_calls' as const,
      content: `Calling tool: ${toolName}`,
      tool_calls: [
        {
          id: toolCallId,
          type: 'function' as const,
          function: {
            name: toolName,
            arguments: rawArgs,
          },
        },
      ],
      assistantMessage: {
        role: 'assistant' as const,
        content: `Calling tool: ${toolName}`,
      },
    },
    messageId,
  };
}

describe('memory-manager behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mocks.saveAgent.mockResolvedValue(undefined);
    mocks.getMemory.mockResolvedValue([]);
    mocks.prepareMessagesForLLM.mockResolvedValue([]);
    mocks.generateAgentResponse.mockReset();
    mocks.getMCPToolsForWorld.mockResolvedValue({});
    mocks.loadSkillExecute.mockResolvedValue(
      '<skill_context id="find-skills"><instructions># Skill</instructions></skill_context>'
    );
  });

  it('ignores self-sent messages and skips duplicate incoming message ids', async () => {
    const { saveIncomingMessageToMemory } = await import('../../../core/events/memory-manager.js');
    const world = createWorld();
    const agent = createAgent();

    await saveIncomingMessageToMemory(
      world,
      agent,
      createMessageEvent({ sender: 'agent-a', messageId: 'self-1', chatId: 'chat-1' })
    );
    expect(agent.memory).toHaveLength(0);
    expect(mocks.saveAgent).not.toHaveBeenCalled();

    agent.memory.push({
      role: 'user',
      content: 'existing',
      sender: 'human',
      messageId: 'dup-1',
      chatId: 'chat-1',
      createdAt: new Date('2026-02-27T15:00:00.000Z'),
      agentId: agent.id,
    } as any);

    await saveIncomingMessageToMemory(
      world,
      agent,
      createMessageEvent({ sender: 'human', messageId: 'dup-1', chatId: 'chat-1' })
    );

    expect(agent.memory).toHaveLength(1);
    expect(mocks.saveAgent).not.toHaveBeenCalled();
  });

  it('uses fallback world chatId for incoming messages and tolerates persistence failure', async () => {
    const { saveIncomingMessageToMemory } = await import('../../../core/events/memory-manager.js');
    const world = createWorld();
    const agent = createAgent();
    mocks.saveAgent.mockRejectedValueOnce(new Error('persistence failed'));

    await expect(
      saveIncomingMessageToMemory(
        world,
        agent,
        createMessageEvent({
          sender: 'human',
          messageId: 'msg-fallback',
          chatId: undefined,
          content: 'Fallback chat message',
        })
      )
    ).resolves.toBeUndefined();

    expect(agent.memory).toHaveLength(1);
    expect(agent.memory[0].chatId).toBe('chat-1');
    expect(agent.memory[0].messageId).toBe('msg-fallback');
  });

  it('resets llm call count only for human/world senders', async () => {
    const { resetLLMCallCountIfNeeded } = await import('../../../core/events/memory-manager.js');
    const world = createWorld();
    const agent = createAgent();

    agent.llmCallCount = 4;
    await resetLLMCallCountIfNeeded(world, agent, createMessageEvent({ sender: 'human' }));
    expect(agent.llmCallCount).toBe(0);
    expect(mocks.saveAgent).toHaveBeenCalledTimes(1);

    agent.llmCallCount = 5;
    await resetLLMCallCountIfNeeded(world, agent, createMessageEvent({ sender: 'agent-b' }));
    expect(agent.llmCallCount).toBe(5);
    expect(mocks.saveAgent).toHaveBeenCalledTimes(1);
  });

  it('synthesizes tool calls from plain-text tool intent and executes parsed loose arguments', async () => {
    const world = createWorld();
    const agent = createAgent();

    const execute = vi.fn(async () => '<skill_context id="find-skills"><instructions># Skill</instructions></skill_context>');
    mocks.getMCPToolsForWorld.mockResolvedValue({ load_skill: { execute } });

    mocks.generateAgentResponse
      .mockResolvedValueOnce(
        textResult(
          'assistant-1',
          "Calling tool: load_skill { skill_id: 'find-skills', retries: 2, enabled: true }"
        )
      )
      .mockResolvedValueOnce(textResult('assistant-2', 'Completed successfully'));

    const { continueLLMAfterToolExecution } = await import('../../../core/events/memory-manager.js');
    await continueLLMAfterToolExecution(world, agent, 'chat-1');

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        skill_id: 'find-skills',
        retries: 2,
        enabled: true,
      }),
      undefined,
      undefined,
      expect.objectContaining({
        chatId: 'chat-1',
        agentName: 'agent-a',
      })
    );
    expect(mocks.publishMessageWithId).toHaveBeenCalledWith(
      world,
      'Completed successfully',
      'agent-a',
      'assistant-2',
      'chat-1',
      undefined
    );
  });

  it('handles unknown tool definitions by publishing tool-error and continuing', async () => {
    const world = createWorld();
    const agent = createAgent();

    mocks.getMCPToolsForWorld.mockResolvedValue({});
    mocks.generateAgentResponse
      .mockResolvedValueOnce(toolCallResult('assistant-tool', 'unknown_tool', '{}', 'tc-missing'))
      .mockResolvedValueOnce(textResult('assistant-final', 'Recovered after missing tool'));

    const { continueLLMAfterToolExecution } = await import('../../../core/events/memory-manager.js');
    await continueLLMAfterToolExecution(world, agent, 'chat-1');

    expect(mocks.publishToolEvent).toHaveBeenCalledWith(
      world,
      expect.objectContaining({
        type: 'tool-error',
        messageId: 'tc-missing',
        chatId: 'chat-1',
        toolExecution: expect.objectContaining({ toolName: 'unknown_tool' }),
      })
    );
    expect(mocks.generateAgentResponse).toHaveBeenCalledTimes(2);
    expect(mocks.publishMessageWithId).toHaveBeenCalledTimes(1);
  });

  it('handles malformed tool-call JSON by publishing parse-error and continuing', async () => {
    const world = createWorld();
    const agent = createAgent();

    const execute = vi.fn(async () => 'should not execute');
    mocks.getMCPToolsForWorld.mockResolvedValue({ load_skill: { execute } });
    mocks.generateAgentResponse
      .mockResolvedValueOnce(toolCallResult('assistant-tool', 'load_skill', '{bad-json', 'tc-parse'))
      .mockResolvedValueOnce(textResult('assistant-final', 'Recovered after parse error'));

    const { continueLLMAfterToolExecution } = await import('../../../core/events/memory-manager.js');
    await continueLLMAfterToolExecution(world, agent, 'chat-1');

    expect(execute).not.toHaveBeenCalled();
    expect(mocks.publishToolEvent).toHaveBeenCalledWith(
      world,
      expect.objectContaining({
        type: 'tool-error',
        messageId: 'tc-parse',
        chatId: 'chat-1',
        toolExecution: expect.objectContaining({ toolName: 'load_skill' }),
      })
    );
    expect(mocks.generateAgentResponse).toHaveBeenCalledTimes(2);
    expect(mocks.publishMessageWithId).toHaveBeenCalledTimes(1);
  });

  it('resumes unresolved pending tool calls for a chat and continues the llm loop', async () => {
    const world = createWorld();
    const agent = createAgent();

    agent.memory.push({
      role: 'assistant',
      content: 'Calling tool: load_skill',
      sender: agent.id,
      createdAt: new Date('2026-02-27T15:10:00.000Z'),
      chatId: 'chat-1',
      messageId: 'assistant-pending',
      agentId: agent.id,
      tool_calls: [
        {
          id: 'tc-pending',
          type: 'function',
          function: {
            name: 'load_skill',
            arguments: JSON.stringify({ skill_id: 'find-skills' }),
          },
        },
      ],
      toolCallStatus: {
        'tc-pending': {
          complete: false,
          result: null,
        },
      },
    } as any);

    world.agents.set(agent.id, agent);

    const execute = vi.fn(async () => '<skill_context id="find-skills"><instructions># Skill</instructions></skill_context>');
    mocks.getMCPToolsForWorld.mockResolvedValue({ load_skill: { execute } });
    mocks.generateAgentResponse.mockResolvedValueOnce(textResult('assistant-final', 'Resume complete'));

    const { resumePendingToolCallsForChat } = await import('../../../core/events/memory-manager.js');
    const resumed = await resumePendingToolCallsForChat(world, 'chat-1');

    expect(resumed).toBe(1);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(mocks.saveAgent).toHaveBeenCalled();
    expect(mocks.publishMessageWithId).toHaveBeenCalledWith(
      world,
      'Resume complete',
      'agent-a',
      'assistant-final',
      'chat-1',
      undefined
    );
  });
});
