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
 *
 * Recent changes:
 * - 2026-04-12: Added regression coverage that planning-only continuation replies are not blocked and that validation retry budgets reset after non-validation progress.
 * - 2026-04-12: Added regression coverage for continuation intent-only narration rejection and bounded repeated validation-failure recovery.
 * - 2026-03-29: Added direct terminal-response idempotency coverage so the same turn does not republish an assistant final response twice.
 * - 2026-03-29: Added restore-resume coverage for terminal `send_message` handoffs and continuation no-op when the turn is already terminal.
 * - 2026-03-29: Added coverage for terminal assistant turn metadata and in-process idempotent pending-tool resume leases.
 * - 2026-03-06: Added coverage ensuring live `tool-result` events publish envelope preview payloads instead of truncated serialized envelope JSON.
 * - 2026-03-06: Added coverage for canonical shell approval-denied failure reasons and null exit codes in continuation-persisted tool results.
 * - 2026-03-06: Updated shell continuation coverage to assert the unified bounded-preview shell result mode across default and skill-script contexts.
 * - 2026-03-01: Added regression coverage that continuation executes `shell_cmd` with `llmResultMode: minimal` by default and upgrades to `smart` for skill-script execution context.
 */

import { EventEmitter } from 'events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Agent, World, WorldMessageEvent } from '../../../core/types.js';
import { parseToolExecutionEnvelopeContent } from '../../../core/tool-execution-envelope.js';

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
  loggerCalls: [] as Array<{
    category: string;
    level: 'trace' | 'debug' | 'info' | 'warn' | 'error';
    message: unknown;
    data: any;
  }>,
}));

vi.mock('../../../core/storage/storage-factory.js', () => ({
  createStorageWithWrappers: vi.fn(async () => ({
    saveAgent: mocks.saveAgent,
    getMemory: mocks.getMemory,
    loadWorld: vi.fn(async (worldId: string) => ({
      id: worldId,
      name: worldId,
      agents: new Map(),
      chats: new Map(),
      eventEmitter: new EventEmitter(),
    })),
    listAgents: vi.fn(async () => []),
    listChats: vi.fn(async () => [{
      id: 'chat-1',
      name: 'Chat 1',
      description: null,
      createdAt: new Date('2026-03-29T10:00:00.000Z'),
      updatedAt: new Date('2026-03-29T10:00:00.000Z'),
      titleProvenance: null,
    }]),
    saveChatData: vi.fn(async () => undefined),
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

vi.mock('../../../core/logger.js', () => ({
  initializeLogger: vi.fn(),
  createCategoryLogger: (category: string) => ({
    trace: (message: unknown, data?: unknown) => mocks.loggerCalls.push({ category, level: 'trace', message, data }),
    debug: (message: unknown, data?: unknown) => mocks.loggerCalls.push({ category, level: 'debug', message, data }),
    info: (message: unknown, data?: unknown) => mocks.loggerCalls.push({ category, level: 'info', message, data }),
    warn: (message: unknown, data?: unknown) => mocks.loggerCalls.push({ category, level: 'warn', message, data }),
    error: (message: unknown, data?: unknown) => mocks.loggerCalls.push({ category, level: 'error', message, data }),
  }),
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
    mocks.loggerCalls.length = 0;
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

  it('ignores incoming messages without explicit chatId', async () => {
    const { saveIncomingMessageToMemory } = await import('../../../core/events/memory-manager.js');
    const world = createWorld();
    const agent = createAgent();

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

    expect(agent.memory).toHaveLength(0);
    expect(mocks.saveAgent).not.toHaveBeenCalled();
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
    const finalAssistantMessage = agent.memory.find((message) => message.role === 'assistant' && message.messageId === 'assistant-2');
    expect(finalAssistantMessage?.agentTurn).toMatchObject({
      turnId: expect.any(String),
      source: 'continuation',
      action: 'final_response',
      outcome: 'completed',
    });
    expect(finalAssistantMessage?.agentTurn?.completion?.mechanism).toBe('assistant_message_metadata');
  });

  it('persists terminal assistant turn metadata for continuation text completion', async () => {
    const world = createWorld();
    const agent = createAgent();

    mocks.generateAgentResponse.mockResolvedValueOnce(textResult('assistant-final-meta-1', 'All done'));

    const { continueLLMAfterToolExecution } = await import('../../../core/events/memory-manager.js');
    await continueLLMAfterToolExecution(world, agent, 'chat-1', {
      turnId: 'turn-123',
    });

    const finalAssistantMessage = agent.memory.find((message) => message.messageId === 'assistant-final-meta-1');
    expect(finalAssistantMessage?.agentTurn).toMatchObject({
      turnId: 'turn-123',
      source: 'continuation',
      action: 'final_response',
      outcome: 'completed',
    });
    expect(finalAssistantMessage?.agentTurn?.completion?.mechanism).toBe('assistant_message_metadata');
  });

  it('retries once and then rejects continuation intent-only action narration without publishing a terminal assistant message', async () => {
    const world = createWorld();
    const agent = createAgent();

    mocks.generateAgentResponse
      .mockResolvedValueOnce(textResult('assistant-intent-only-cont-1', 'I will inspect the file next.'))
      .mockResolvedValueOnce(textResult('assistant-intent-only-cont-2', 'I will inspect the file next.'));

    const { continueLLMAfterToolExecution } = await import('../../../core/events/memory-manager.js');
    await continueLLMAfterToolExecution(world, agent, 'chat-1', {
      turnId: 'turn-intent-only-1',
    });

    expect(mocks.generateAgentResponse).toHaveBeenCalledTimes(2);
    expect(mocks.publishMessageWithId).not.toHaveBeenCalled();
    expect(mocks.publishEvent).toHaveBeenCalledWith(
      world,
      'system',
      expect.objectContaining({
        type: 'warning',
        message: expect.stringContaining('future tool action'),
      }),
      'chat-1',
    );
    expect(
      agent.memory.some((message) => message.role === 'assistant' && message.messageId === 'assistant-intent-only-cont-2')
    ).toBe(false);
  });

  it('allows planning-only continuation replies to complete without forcing an intent-only retry', async () => {
    const world = createWorld();
    const agent = createAgent();

    mocks.prepareMessagesForLLM.mockResolvedValue([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'What would you do next to investigate this issue?' },
      { role: 'assistant', content: 'Calling tool: demo_tool' },
      { role: 'tool', content: 'ok' },
    ]);
    mocks.generateAgentResponse.mockResolvedValueOnce(
      textResult(
        'assistant-plan-cont-1',
        'I will inspect the parser branch next and compare it with the direct-turn path.'
      )
    );

    const { continueLLMAfterToolExecution } = await import('../../../core/events/memory-manager.js');
    await continueLLMAfterToolExecution(world, agent, 'chat-1', {
      turnId: 'turn-plan-cont-1',
    });

    expect(mocks.generateAgentResponse).toHaveBeenCalledTimes(1);
    expect(mocks.publishMessageWithId).toHaveBeenCalledWith(
      world,
      'I will inspect the parser branch next and compare it with the direct-turn path.',
      'agent-a',
      'assistant-plan-cont-1',
      'chat-1',
      undefined
    );
    expect(mocks.publishEvent).not.toHaveBeenCalledWith(
      world,
      'system',
      expect.objectContaining({
        message: expect.stringContaining('future tool action'),
      }),
      'chat-1',
    );
  });

  it('stops after repeated validation failures instead of looping indefinitely on corrected-tool retries', async () => {
    const world = createWorld();
    const agent = createAgent();

    const execute = vi.fn(async () => 'Error: Tool parameter validation failed for demo_tool: Required parameter \'query\' is missing or empty');
    mocks.getMCPToolsForWorld.mockResolvedValue({ demo_tool: { execute } });
    mocks.generateAgentResponse
      .mockResolvedValueOnce(toolCallResult('assistant-validation-1', 'demo_tool', '{}', 'tc-validation-1'))
      .mockResolvedValueOnce(toolCallResult('assistant-validation-2', 'demo_tool', '{}', 'tc-validation-2'));

    const { continueLLMAfterToolExecution } = await import('../../../core/events/memory-manager.js');
    await continueLLMAfterToolExecution(world, agent, 'chat-1', {
      turnId: 'turn-validation-1',
    });

    expect(execute).toHaveBeenCalledTimes(2);
    expect(mocks.generateAgentResponse).toHaveBeenCalledTimes(2);
    expect(mocks.publishMessageWithId).not.toHaveBeenCalled();
    expect(mocks.publishEvent).toHaveBeenCalledWith(
      world,
      'system',
      expect.objectContaining({
        type: 'warning',
        message: expect.stringContaining('invalid tool parameters'),
      }),
      'chat-1',
    );
  });

  it('resets validation retry budget after a non-validation continuation step succeeds', async () => {
    const world = createWorld();
    const agent = createAgent();

    const firstToolExecute = vi.fn(
      async () => 'Error: Tool parameter validation failed for first_tool: Required parameter \'query\' is missing or empty'
    );
    const okToolExecute = vi.fn(async () => 'ok');
    const secondToolExecute = vi.fn(
      async () => 'Error: Tool parameter validation failed for second_tool: Required parameter \'path\' is missing or empty'
    );
    mocks.getMCPToolsForWorld.mockResolvedValue({
      first_tool: { execute: firstToolExecute },
      ok_tool: { execute: okToolExecute },
      second_tool: { execute: secondToolExecute },
    });
    mocks.generateAgentResponse
      .mockResolvedValueOnce(toolCallResult('assistant-validation-reset-1', 'first_tool', '{}', 'tc-validation-reset-1'))
      .mockResolvedValueOnce(toolCallResult('assistant-validation-reset-2', 'ok_tool', '{}', 'tc-validation-reset-2'))
      .mockResolvedValueOnce(toolCallResult('assistant-validation-reset-3', 'second_tool', '{}', 'tc-validation-reset-3'))
      .mockResolvedValueOnce(toolCallResult('assistant-validation-reset-4', 'second_tool', '{}', 'tc-validation-reset-4'));

    const { continueLLMAfterToolExecution } = await import('../../../core/events/memory-manager.js');
    await continueLLMAfterToolExecution(world, agent, 'chat-1', {
      turnId: 'turn-validation-reset-1',
    });

    expect(firstToolExecute).toHaveBeenCalledTimes(1);
    expect(okToolExecute).toHaveBeenCalledTimes(1);
    expect(secondToolExecute).toHaveBeenCalledTimes(2);
    expect(mocks.generateAgentResponse).toHaveBeenCalledTimes(4);
    expect(mocks.publishEvent).toHaveBeenCalledWith(
      world,
      'system',
      expect.objectContaining({
        type: 'warning',
        message: expect.stringContaining('invalid tool parameters'),
      }),
      'chat-1',
    );
  });

  it('does not republish the same direct terminal response twice for one turn', async () => {
    const world = createWorld();
    const agent = createAgent();
    const messageEvent = createMessageEvent({ messageId: 'turn-direct-1', chatId: 'chat-1', sender: 'human' });

    const { handleTextResponse } = await import('../../../core/events/memory-manager.js');

    await handleTextResponse(world, agent, 'Final answer', 'assistant-direct-final-1', messageEvent, 'chat-1', {
      turnId: 'turn-direct-1',
      source: 'direct',
    });
    await handleTextResponse(world, agent, 'Final answer', 'assistant-direct-final-1', messageEvent, 'chat-1', {
      turnId: 'turn-direct-1',
      source: 'direct',
    });

    expect(mocks.publishMessageWithId).toHaveBeenCalledTimes(1);
    expect(
      agent.memory.filter((message) => message.messageId === 'assistant-direct-final-1')
    ).toHaveLength(1);
  });

  it('skips continuation when the target turn is already terminal', async () => {
    const world = createWorld();
    const agent = createAgent();

    agent.memory.push({
      role: 'assistant',
      content: 'Already done',
      sender: agent.id,
      createdAt: new Date('2026-03-29T10:05:00.000Z'),
      chatId: 'chat-1',
      messageId: 'assistant-terminal-existing',
      agentId: agent.id,
      agentTurn: {
        turnId: 'turn-terminal-1',
        source: 'continuation',
        action: 'final_response',
        outcome: 'completed',
        updatedAt: '2026-03-29T10:05:00.000Z',
        completion: {
          mechanism: 'assistant_message_metadata',
          completedAt: '2026-03-29T10:05:00.000Z',
        },
      },
    } as any);

    const { continueLLMAfterToolExecution } = await import('../../../core/events/memory-manager.js');
    await continueLLMAfterToolExecution(world, agent, 'chat-1', {
      turnId: 'turn-terminal-1',
    });

    expect(mocks.generateAgentResponse).not.toHaveBeenCalled();
    expect(mocks.publishMessageWithId).not.toHaveBeenCalled();
  });

  it('skips duplicate same-process resume for the same unresolved tool call', async () => {
    const world = createWorld();
    const agent = createAgent();
    world.agents.set(agent.id, agent);

    vi.doMock('../../../core/mcp-server-registry.js', () => ({
      getMCPToolsForWorld: mocks.getMCPToolsForWorld,
    }));

    let releaseExecute: ((value: string) => void) | null = null;
    const execute = vi.fn(
      async () =>
        await new Promise<string>((resolve) => {
          releaseExecute = resolve;
        })
    );

    mocks.getMCPToolsForWorld.mockResolvedValue({
      demo_tool: { execute },
    });
    mocks.generateAgentResponse.mockResolvedValueOnce(textResult('assistant-after-resume-1', 'Resume complete'));

    agent.memory.push({
      role: 'assistant',
      content: 'Calling tool: demo_tool',
      sender: agent.id,
      createdAt: new Date('2026-03-29T10:00:00.000Z'),
      chatId: 'chat-1',
      messageId: 'assistant-pending-1',
      replyToMessageId: 'turn-root-1',
      agentId: agent.id,
      tool_calls: [
        {
          id: 'tool-call-pending-1',
          type: 'function',
          function: {
            name: 'demo_tool',
            arguments: '{}',
          },
        },
      ],
      toolCallStatus: {
        'tool-call-pending-1': { complete: false, result: null },
      },
      agentTurn: {
        turnId: 'turn-root-1',
        source: 'direct',
        action: 'tool_call',
        state: 'waiting_for_tool_result',
        resumeKey: 'world-1:agent-a:chat-1:assistant-pending-1:tool-call-pending-1',
        updatedAt: '2026-03-29T10:00:00.000Z',
      },
    } as any);

    const { resumePendingToolCallsForChat } = await import('../../../core/events/memory-manager.js');
    const firstResume = resumePendingToolCallsForChat(world, 'chat-1');
    await Promise.resolve();

    const secondResumeCount = await resumePendingToolCallsForChat(world, 'chat-1');
    expect(secondResumeCount).toBe(0);
    expect(execute).toHaveBeenCalledTimes(1);

    releaseExecute?.('tool-result');
    await firstResume;
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('logs continuation tool-result persistence failures with world/chat scope', async () => {
    const world = createWorld();
    const agent = createAgent();

    const execute = vi.fn(async () => 'tool-output');
    mocks.getMCPToolsForWorld.mockResolvedValue({ demo_tool: { execute } });
    mocks.generateAgentResponse
      .mockResolvedValueOnce(toolCallResult('assistant-tool-1', 'demo_tool', '{}', 'tool-call-1'))
      .mockResolvedValueOnce(textResult('assistant-final-1', 'done'));

    let saveCount = 0;
    mocks.saveAgent.mockImplementation(async () => {
      saveCount += 1;
      if (saveCount === 3) {
        throw new Error('persist tool result failed');
      }
      return undefined;
    });

    const { continueLLMAfterToolExecution } = await import('../../../core/events/memory-manager.js');
    await continueLLMAfterToolExecution(world, agent, 'chat-1');

    const scopedLog = mocks.loggerCalls.find((call) =>
      call.category === 'memory'
      && call.level === 'error'
      && call.message === 'Failed to save continuation tool result to memory'
    );

    expect(scopedLog?.data).toMatchObject({
      worldId: 'world-1',
      chatId: 'chat-1',
      agentId: 'agent-a',
      toolCallId: 'tool-call-1',
      error: 'persist tool result failed',
    });
  });

  it('executes shell_cmd in continuation with minimal llm result mode by default', async () => {
    const world = createWorld();
    const agent = createAgent();

    const execute = vi.fn(async () => 'stdout line one\nstdout line two');
    mocks.getMCPToolsForWorld.mockResolvedValue({ shell_cmd: { execute } });

    mocks.generateAgentResponse
      .mockResolvedValueOnce(toolCallResult('assistant-shell-1', 'shell_cmd', '{"command":"echo","parameters":["ok"]}', 'tc-shell-1'))
      .mockResolvedValueOnce(textResult('assistant-shell-2', 'Done'));

    const { continueLLMAfterToolExecution } = await import('../../../core/events/memory-manager.js');
    await continueLLMAfterToolExecution(world, agent, 'chat-1');

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'echo',
        parameters: ['ok'],
      }),
      undefined,
      undefined,
      expect.objectContaining({
        chatId: 'chat-1',
        agentName: 'agent-a',
        llmResultMode: 'minimal',
      })
    );
    expect(mocks.publishMessageWithId).toHaveBeenCalledWith(
      world,
      'Done',
      'agent-a',
      'assistant-shell-2',
      'chat-1',
      undefined
    );
  });

  it('executes shell_cmd in continuation with minimal llm result mode for skill-script context', async () => {
    const world = createWorld();
    const agent = createAgent();

    agent.memory.push({
      role: 'tool',
      content: '<skill_context id="music-to-svg"><instructions># Skill</instructions></skill_context>',
      sender: 'agent-a',
      createdAt: new Date('2026-03-01T12:00:00.000Z'),
      chatId: 'chat-1',
      messageId: 'skill-context-1',
      tool_call_id: 'load-skill-1',
      agentId: 'agent-a',
    } as any);

    const execute = vi.fn(async () => '![score](data:image/svg+xml;base64,AAA...)');
    mocks.getMCPToolsForWorld.mockResolvedValue({ shell_cmd: { execute } });

    mocks.generateAgentResponse
      .mockResolvedValueOnce(toolCallResult('assistant-shell-skill-1', 'shell_cmd', '{"command":"python","parameters":["scripts/convert.py","-i","./score.musicxml"]}', 'tc-shell-skill-1'))
      .mockResolvedValueOnce(textResult('assistant-shell-skill-2', 'Done with rendered score'));

    const { continueLLMAfterToolExecution } = await import('../../../core/events/memory-manager.js');
    await continueLLMAfterToolExecution(world, agent, 'chat-1');

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'python',
        parameters: ['scripts/convert.py', '-i', './score.musicxml'],
      }),
      undefined,
      undefined,
      expect.objectContaining({
        chatId: 'chat-1',
        agentName: 'agent-a',
        llmResultMode: 'minimal',
      })
    );
  });

  it('persists canonical shell tool error content when shell_cmd execution throws', async () => {
    const world = createWorld();
    const agent = createAgent();

    const execute = vi.fn(async () => {
      throw new Error('approval required for remote_download and request was not approved');
    });
    mocks.getMCPToolsForWorld.mockResolvedValue({ shell_cmd: { execute } });

    mocks.generateAgentResponse
      .mockResolvedValueOnce(toolCallResult('assistant-shell-error-1', 'shell_cmd', '{"command":"curl","parameters":["-O","https://example.com/file"]}', 'tc-shell-error-1'))
      .mockResolvedValueOnce(textResult('assistant-shell-error-2', 'Recovered after shell error'));

    const { continueLLMAfterToolExecution } = await import('../../../core/events/memory-manager.js');
    await continueLLMAfterToolExecution(world, agent, 'chat-1');

    const shellErrorMessage = agent.memory.find((message) =>
      message.role === 'tool'
      && message.tool_call_id === 'tc-shell-error-1'
    );

    const envelope = parseToolExecutionEnvelopeContent(shellErrorMessage?.content || '');
    expect(envelope).not.toBeNull();
    expect(envelope?.tool).toBe('shell_cmd');
    expect(String(envelope?.result || '')).toContain('status: failed');
    expect(String(envelope?.result || '')).toContain('exit_code: null');
    expect(String(envelope?.result || '')).toContain('reason: approval_denied');
    expect(JSON.stringify(envelope?.preview || null)).toContain('approval required for remote_download and request was not approved');
    expect(String(envelope?.result || '')).not.toContain('Error executing tool:');
  });

  it('publishes envelope preview payloads for live tool-result events during continuation', async () => {
    const world = createWorld();
    const agent = createAgent();

    const envelopeResult = JSON.stringify({
      __type: 'tool_execution_envelope',
      version: 1,
      tool: 'load_skill',
      tool_call_id: 'tc-preview-1',
      status: 'completed',
      preview: {
        kind: 'url',
        renderer: 'youtube',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      },
      result: '<skill_context id="demo"></skill_context>',
    });
    const execute = vi.fn(async () => envelopeResult);
    mocks.getMCPToolsForWorld.mockResolvedValue({ load_skill: { execute } });

    mocks.generateAgentResponse
      .mockResolvedValueOnce(toolCallResult('assistant-preview-1', 'load_skill', '{"skill_id":"demo"}', 'tc-preview-1'))
      .mockResolvedValueOnce(textResult('assistant-preview-2', 'Done'));

    const { continueLLMAfterToolExecution } = await import('../../../core/events/memory-manager.js');
    await continueLLMAfterToolExecution(world, agent, 'chat-1');

    expect(mocks.publishToolEvent).toHaveBeenCalledWith(
      world,
      expect.objectContaining({
        type: 'tool-result',
        messageId: 'tc-preview-1',
        chatId: 'chat-1',
        toolExecution: expect.objectContaining({
          toolName: 'load_skill',
          preview: {
            kind: 'url',
            renderer: 'youtube',
            url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          },
          result: '<skill_context id="demo"></skill_context>',
          resultType: 'string',
          resultSize: envelopeResult.length,
        }),
      }),
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

  it('marks resumed pending send_message handoffs terminal and skips follow-up continuation', async () => {
    const world = createWorld();
    const agent = createAgent();

    agent.memory.push({
      role: 'assistant',
      content: 'Calling tool: send_message',
      sender: agent.id,
      createdAt: new Date('2026-03-29T10:10:00.000Z'),
      chatId: 'chat-1',
      messageId: 'assistant-handoff-pending',
      replyToMessageId: 'turn-handoff-1',
      agentId: agent.id,
      tool_calls: [
        {
          id: 'tc-handoff',
          type: 'function',
          function: {
            name: 'send_message',
            arguments: JSON.stringify({ agent: 'agent-b', message: 'Take over.' }),
          },
        },
      ],
      toolCallStatus: {
        'tc-handoff': {
          complete: false,
          result: null,
        },
      },
      agentTurn: {
        turnId: 'turn-handoff-1',
        source: 'direct',
        action: 'agent_handoff',
        state: 'waiting_for_tool_result',
        updatedAt: '2026-03-29T10:10:00.000Z',
      },
    } as any);

    world.agents.set(agent.id, agent);

    const execute = vi.fn(async () => JSON.stringify({
      ok: true,
      status: 'dispatched',
      dispatched: 1,
    }));
    mocks.getMCPToolsForWorld.mockResolvedValue({ send_message: { execute } });

    const { resumePendingToolCallsForChat } = await import('../../../core/events/memory-manager.js');
    const resumed = await resumePendingToolCallsForChat(world, 'chat-1');

    expect(resumed).toBe(1);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(mocks.generateAgentResponse).not.toHaveBeenCalled();
    expect(mocks.publishMessageWithId).not.toHaveBeenCalled();

    const assistantMessage = agent.memory.find((message) => message.messageId === 'assistant-handoff-pending');
    expect(assistantMessage?.agentTurn).toMatchObject({
      turnId: 'turn-handoff-1',
      source: 'restore',
      action: 'agent_handoff',
      outcome: 'handoff_dispatched',
    });
  });
});
