/**
 * Orchestrator Chat ID Isolation Tests
 *
 * Purpose:
 * - Verify orchestrator event publishing keeps explicit chat scope.
 *
 * Key Features:
 * - Ensures `tool-execution` system events are emitted with explicit `chatId`.
 * - Protects against fallback routing to `world.currentChatId` after mid-run chat switches.
 *
 * Implementation Notes:
 * - Uses mocked storage/LLM/tool registry dependencies.
 * - Keeps execution in-memory and deterministic.
 *
 * Recent Changes:
 * - 2026-04-12: Added regression coverage that planning-only prompts are not blocked by the direct intent-only narration guard.
 * - 2026-04-12: Added regression coverage that direct intent-only action narration retries once and then stops without terminal assistant completion.
 * - 2026-03-29: Added Phase 1 regression coverage that direct tool-call turns execute at most one tool per hop.
 * - 2026-03-29: Added coverage that direct HITL tool requests persist `hitl_request` action metadata with `waiting_for_hitl` state.
 * - 2026-03-29: Added coverage that successful `send_message` tool execution marks the assistant tool request as terminal handoff-dispatched metadata and stops follow-up continuation.
 * - 2026-03-24: Added coverage that plain-text initial tool intents are synthesized into executable tool calls.
 * - 2026-03-24: Added coverage that empty initial LLM text responses retry once and then fail with a chat-scoped durable error instead of ending silently.
 * - 2026-03-10: Added coverage that terminal agent-turn failures publish one chat-scoped persisted `system` error event.
 * - 2026-02-27: Added coverage for explicit `chatId` routing on `tool-execution` publish events.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import type { Agent, World, WorldMessageEvent } from '../../../core/types.js';

const mocks = vi.hoisted(() => ({
  saveAgent: vi.fn(async () => undefined),
  prepareMessagesForLLM: vi.fn(async () => []),
  generateAgentResponse: vi.fn(),
  streamAgentResponse: vi.fn(),
  getMCPToolsForWorld: vi.fn(),
  publishEvent: vi.fn(),
  publishToolEvent: vi.fn(),
  publishSSE: vi.fn(),
  publishMessage: vi.fn(),
  isStreamingEnabled: vi.fn().mockReturnValue(false),
  continueLLMAfterToolExecution: vi.fn(async () => undefined),
  handleTextResponse: vi.fn(async () => undefined),
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
  })),
}));

vi.mock('../../../core/utils.js', async () => {
  const actual = await vi.importActual<typeof import('../../../core/utils.js')>('../../../core/utils.js');
  return {
    ...actual,
    prepareMessagesForLLM: mocks.prepareMessagesForLLM,
  };
});

vi.mock('../../../core/llm-runtime.js', async () => {
  const actual = await vi.importActual<typeof import('../../../core/llm-runtime.js')>('../../../core/llm-runtime.js');
  return {
    ...actual,
    generateAgentResponse: mocks.generateAgentResponse,
    streamAgentResponse: mocks.streamAgentResponse,
  };
});

vi.mock('../../../core/mcp-server-registry.js', () => ({
  getMCPToolsForWorld: mocks.getMCPToolsForWorld,
}));

vi.mock('../../../core/events/publishers.js', () => ({
  publishMessage: mocks.publishMessage,
  publishSSE: mocks.publishSSE,
  publishEvent: mocks.publishEvent,
  publishToolEvent: mocks.publishToolEvent,
  isStreamingEnabled: mocks.isStreamingEnabled,
}));

vi.mock('../../../core/events/memory-manager.js', () => ({
  handleTextResponse: mocks.handleTextResponse,
  continueLLMAfterToolExecution: mocks.continueLLMAfterToolExecution,
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
    name: 'Test World',
    createdAt: new Date(),
    lastUpdated: new Date(),
    turnLimit: 10,
    totalAgents: 1,
    totalMessages: 0,
    currentChatId: 'chat-1',
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
    model: 'gpt-4',
    llmCallCount: 0,
    memory: [],
  } as Agent;
}

function createMessageEvent(chatId: string, content = 'Run the test tool'): WorldMessageEvent {
  return {
    content,
    sender: 'human',
    timestamp: new Date(),
    messageId: 'msg-user-1',
    chatId,
  };
}

describe('processAgentMessage chat isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mocks.saveAgent.mockResolvedValue(undefined);
    mocks.prepareMessagesForLLM.mockResolvedValue([]);
    mocks.isStreamingEnabled.mockReturnValue(false);
    mocks.continueLLMAfterToolExecution.mockResolvedValue(undefined);
    mocks.handleTextResponse.mockResolvedValue(undefined);
    mocks.loggerCalls.length = 0;
  });

  it('publishes tool-execution event with explicit chatId argument', async () => {
    const world = createWorld();
    const agent = createAgent();

    mocks.generateAgentResponse.mockResolvedValueOnce({
      response: {
        type: 'tool_calls',
        content: 'Calling tool: demo_tool',
        tool_calls: [{
          id: 'tool-call-1',
          type: 'function',
          function: {
            name: 'demo_tool',
            arguments: '{}',
          },
        }],
      },
      messageId: 'assistant-tool-msg-1',
    });

    mocks.getMCPToolsForWorld.mockResolvedValue({
      demo_tool: {
        execute: vi.fn(async () => {
          world.currentChatId = 'chat-2';
          return 'ok';
        }),
      },
    });

    const { processAgentMessage } = await import('../../../core/events/orchestrator.js');
    await processAgentMessage(world, agent, createMessageEvent('chat-1'));

    expect(mocks.publishEvent).toHaveBeenCalledWith(
      world,
      'tool-execution',
      expect.objectContaining({
        chatId: 'chat-1',
        toolCallId: 'tool-call-1',
      }),
      'chat-1',
    );
  });

  it('executes at most one direct tool call per hop when the model returns multiple tools', async () => {
    const world = createWorld();
    const agent = createAgent();
    const firstExecute = vi.fn(async () => 'first-ok');
    const secondExecute = vi.fn(async () => 'second-ok');

    mocks.generateAgentResponse.mockResolvedValueOnce({
      response: {
        type: 'tool_calls',
        content: 'Calling 2 tools',
        tool_calls: [
          {
            id: 'tool-call-1',
            type: 'function',
            function: {
              name: 'demo_tool',
              arguments: '{}',
            },
          },
          {
            id: 'tool-call-2',
            type: 'function',
            function: {
              name: 'second_tool',
              arguments: '{}',
            },
          },
        ],
      },
      messageId: 'assistant-tool-msg-multi-1',
    });

    mocks.getMCPToolsForWorld.mockResolvedValue({
      demo_tool: { execute: firstExecute },
      second_tool: { execute: secondExecute },
    });

    const { processAgentMessage } = await import('../../../core/events/orchestrator.js');
    await processAgentMessage(world, agent, createMessageEvent('chat-1'));

    expect(firstExecute).toHaveBeenCalledTimes(1);
    expect(secondExecute).not.toHaveBeenCalled();
    const assistantToolRequest = agent.memory.find((message) => message.messageId === 'assistant-tool-msg-multi-1');
    expect(assistantToolRequest?.tool_calls).toHaveLength(1);
    expect(assistantToolRequest?.tool_calls?.[0]?.function.name).toBe('demo_tool');
  });

  it('synthesizes plain-text initial tool intents into executable tool calls', async () => {
    const world = createWorld();
    const agent = createAgent();

    mocks.generateAgentResponse.mockResolvedValueOnce({
      response: {
        type: 'text',
        content: 'Calling tool: web_fetch (url: "https://example.com/")',
      },
      messageId: 'assistant-plaintext-tool-1',
    });

    mocks.getMCPToolsForWorld.mockResolvedValue({
      web_fetch: {
        execute: vi.fn(async () => 'ok'),
      },
    });

    const { processAgentMessage } = await import('../../../core/events/orchestrator.js');
    await processAgentMessage(world, agent, createMessageEvent('chat-1'));

    expect(mocks.publishEvent).toHaveBeenCalledWith(
      world,
      'tool-execution',
      expect.objectContaining({
        chatId: 'chat-1',
        toolName: 'web_fetch',
      }),
      'chat-1',
    );
    expect(mocks.handleTextResponse).not.toHaveBeenCalledWith(
      world,
      agent,
      'Calling tool: web_fetch (url: "https://example.com/")',
      'assistant-plaintext-tool-1',
      expect.anything(),
      'chat-1',
    );
  });

  it('retries once and then rejects direct intent-only action narration without publishing a terminal assistant message', async () => {
    const world = createWorld();
    const agent = createAgent();

    mocks.generateAgentResponse
      .mockResolvedValueOnce({
        response: {
          type: 'text',
          content: 'I will run the command now.',
        },
        messageId: 'assistant-intent-only-1',
      })
      .mockResolvedValueOnce({
        response: {
          type: 'text',
          content: 'I will run the command now.',
        },
        messageId: 'assistant-intent-only-2',
      });

    const { processAgentMessage } = await import('../../../core/events/orchestrator.js');
    await processAgentMessage(world, agent, createMessageEvent('chat-1'));

    expect(mocks.generateAgentResponse).toHaveBeenCalledTimes(2);
    expect(mocks.handleTextResponse).not.toHaveBeenCalled();
    expect(mocks.publishEvent).toHaveBeenCalledWith(
      world,
      'system',
      expect.objectContaining({
        type: 'warning',
        message: expect.stringContaining('future tool action'),
      }),
      'chat-1',
    );
  });

  it('allows clarifying-question replies to complete without intent-only retry', async () => {
    const world = createWorld();
    const agent = createAgent();

    mocks.generateAgentResponse.mockResolvedValueOnce({
      response: {
        type: 'text',
        content: 'I will create the presentation, but first: who is the audience and how many slides do you want?',
      },
      messageId: 'assistant-clarify-1',
    });

    const { processAgentMessage } = await import('../../../core/events/orchestrator.js');
    await processAgentMessage(
      world,
      agent,
      createMessageEvent('chat-1', 'Create a presentation for this project.')
    );

    expect(mocks.generateAgentResponse).toHaveBeenCalledTimes(1);
    expect(mocks.handleTextResponse).toHaveBeenCalledWith(
      world,
      agent,
      'I will create the presentation, but first: who is the audience and how many slides do you want?',
      'assistant-clarify-1',
      expect.objectContaining({
        messageId: 'msg-user-1',
        chatId: 'chat-1',
      }),
      'chat-1',
      expect.objectContaining({
        source: 'direct',
      }),
    );
    expect(mocks.publishEvent).not.toHaveBeenCalledWith(
      world,
      'system',
      expect.objectContaining({
        type: 'warning',
        message: expect.stringContaining('future tool action'),
      }),
      'chat-1',
    );
  });

  it('discards streamed intent-only replies before retrying or stopping', async () => {
    const world = createWorld();
    const agent = createAgent();

    mocks.isStreamingEnabled.mockReturnValue(true);
    mocks.streamAgentResponse
      .mockResolvedValueOnce({
        response: {
          type: 'text',
          content: 'I will create the presentation after I ask a few questions.',
        },
        messageId: 'assistant-stream-intent-1',
      })
      .mockResolvedValueOnce({
        response: {
          type: 'text',
          content: 'I will create the presentation after I ask a few questions.',
        },
        messageId: 'assistant-stream-intent-2',
      });

    const { processAgentMessage } = await import('../../../core/events/orchestrator.js');
    await processAgentMessage(
      world,
      agent,
      createMessageEvent('chat-1', 'Create a presentation for this project.')
    );

    expect(mocks.streamAgentResponse).toHaveBeenCalledTimes(2);
    expect(mocks.handleTextResponse).not.toHaveBeenCalled();
    expect(mocks.publishSSE).toHaveBeenCalledWith(
      world,
      expect.objectContaining({
        agentName: 'agent-a',
        type: 'end',
        chatId: 'chat-1',
        messageId: 'assistant-stream-intent-1',
        discard: true,
      })
    );
    expect(mocks.publishSSE).toHaveBeenCalledWith(
      world,
      expect.objectContaining({
        agentName: 'agent-a',
        type: 'end',
        chatId: 'chat-1',
        messageId: 'assistant-stream-intent-2',
        discard: true,
      })
    );
  });

  it('allows planning-only prompts to return a future-tense text plan without forcing a retry', async () => {
    const world = createWorld();
    const agent = createAgent();

    mocks.generateAgentResponse.mockResolvedValueOnce({
      response: {
        type: 'text',
        content: 'I will inspect the loop boundaries first, then compare how retries are persisted.',
      },
      messageId: 'assistant-plan-only-1',
    });

    const { processAgentMessage } = await import('../../../core/events/orchestrator.js');
    await processAgentMessage(
      world,
      agent,
      createMessageEvent('chat-1', 'What would you do to review the LLM call loop?')
    );

    expect(mocks.generateAgentResponse).toHaveBeenCalledTimes(1);
    expect(mocks.handleTextResponse).toHaveBeenCalledWith(
      world,
      agent,
      'I will inspect the loop boundaries first, then compare how retries are persisted.',
      'assistant-plan-only-1',
      expect.objectContaining({
        content: 'What would you do to review the LLM call loop?',
      }),
      'chat-1',
      expect.objectContaining({
        source: 'direct',
      })
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

  it('marks successful send_message tool execution as terminal handoff and skips continuation', async () => {
    const world = createWorld();
    const agent = createAgent();

    mocks.generateAgentResponse.mockResolvedValueOnce({
      response: {
        type: 'tool_calls',
        content: 'Calling tool: send_message',
        tool_calls: [{
          id: 'tool-call-send-message-1',
          type: 'function',
          function: {
            name: 'send_message',
            arguments: '{"messages":["Forward this"]}',
          },
        }],
      },
      messageId: 'assistant-tool-msg-send-1',
    });

    mocks.getMCPToolsForWorld.mockResolvedValue({
      send_message: {
        execute: vi.fn(async () => JSON.stringify({
          ok: true,
          status: 'dispatched',
          requested: 1,
          accepted: 1,
          dispatched: 1,
          failed: 0,
          results: [{ index: 0, status: 'dispatched' }],
        })),
      },
    });

    const { processAgentMessage } = await import('../../../core/events/orchestrator.js');
    await processAgentMessage(world, agent, createMessageEvent('chat-1'));

    expect(mocks.continueLLMAfterToolExecution).not.toHaveBeenCalled();
    const assistantToolRequest = agent.memory.find((message) => message.messageId === 'assistant-tool-msg-send-1');
    expect(assistantToolRequest?.agentTurn).toMatchObject({
      turnId: 'msg-user-1',
      source: 'direct',
      action: 'agent_handoff',
      outcome: 'handoff_dispatched',
    });
    expect(assistantToolRequest?.agentTurn?.completion?.mechanism).toBe('assistant_message_metadata');
  });

  it('persists waiting HITL action metadata for direct human_intervention_request tool calls', async () => {
    const world = createWorld();
    const agent = createAgent();
    let resolveExecute: ((value: string) => void) | null = null;

    mocks.generateAgentResponse.mockResolvedValueOnce({
      response: {
        type: 'tool_calls',
        content: 'Calling tool: human_intervention_request',
        tool_calls: [{
          id: 'tool-call-hitl-1',
          type: 'function',
          function: {
            name: 'human_intervention_request',
            arguments: JSON.stringify({
              question: 'Proceed?',
              options: ['Yes', 'No'],
            }),
          },
        }],
      },
      messageId: 'assistant-hitl-msg-1',
    });

    mocks.getMCPToolsForWorld.mockResolvedValue({
      human_intervention_request: {
        execute: vi.fn(
          async () =>
            await new Promise<string>((resolve) => {
              resolveExecute = resolve;
            })
        ),
      },
    });

    const { processAgentMessage } = await import('../../../core/events/orchestrator.js');
    const processPromise = processAgentMessage(world, agent, createMessageEvent('chat-1'));
    await vi.waitFor(() => {
      expect(
        agent.memory.find((message) => message.messageId === 'assistant-hitl-msg-1')
      ).toBeDefined();
    });

    const pendingAssistantMessage = agent.memory.find(
      (message) => message.messageId === 'assistant-hitl-msg-1'
    );
    expect(pendingAssistantMessage?.agentTurn).toMatchObject({
      source: 'direct',
      action: 'hitl_request',
      state: 'waiting_for_hitl',
    });

    resolveExecute?.(JSON.stringify({
      ok: true,
      status: 'confirmed',
      confirmed: true,
      selectedOption: 'Yes',
      source: 'user',
      requestId: 'hitl-req-1',
    }));
    await processPromise;
  });

  it('persists direct tool execution failures with scoped logs and completed tool status', async () => {
    const world = createWorld();
    const agent = createAgent();

    mocks.generateAgentResponse.mockResolvedValueOnce({
      response: {
        type: 'tool_calls',
        content: 'Calling tool: demo_tool',
        tool_calls: [{
          id: 'tool-call-err-1',
          type: 'function',
          function: {
            name: 'demo_tool',
            arguments: '{}',
          },
        }],
      },
      messageId: 'assistant-tool-msg-err-1',
    });

    mocks.getMCPToolsForWorld.mockResolvedValue({
      demo_tool: {
        execute: vi.fn(async () => {
          throw new Error('tool exploded');
        }),
      },
    });

    const { processAgentMessage } = await import('../../../core/events/orchestrator.js');
    await processAgentMessage(world, agent, createMessageEvent('chat-1'));

    const scopedLog = mocks.loggerCalls.find((call) =>
      call.category === 'agent'
      && call.level === 'error'
      && call.message === 'Tool execution error'
    );

    expect(scopedLog?.data).toMatchObject({
      worldId: 'world-1',
      chatId: 'chat-1',
      agentId: 'agent-a',
      toolCallId: 'tool-call-err-1',
      error: 'tool exploded',
    });

    const persistedToolError = agent.memory.find((message) => message.role === 'tool' && message.tool_call_id === 'tool-call-err-1');
    expect(persistedToolError?.content).toContain('tool exploded');

    const assistantToolRequest = agent.memory.find((message) => message.messageId === 'assistant-tool-msg-err-1');
    expect(assistantToolRequest?.toolCallStatus?.['tool-call-err-1']).toMatchObject({
      complete: true,
      result: expect.stringContaining('tool exploded'),
    });
  });

  it('publishes one chat-scoped system error event when agent turn processing fails terminally', async () => {
    const world = createWorld();
    const agent = createAgent();

    mocks.generateAgentResponse.mockRejectedValueOnce(new Error('provider missing'));

    const { processAgentMessage } = await import('../../../core/events/orchestrator.js');

    await expect(processAgentMessage(world, agent, createMessageEvent('chat-1'))).rejects.toThrow('provider missing');

    expect(mocks.publishEvent).toHaveBeenCalledWith(
      world,
      'system',
      expect.objectContaining({
        type: 'error',
        eventType: 'error',
        agentName: 'agent-a',
        message: expect.stringContaining('provider missing'),
      }),
      'chat-1',
    );
  });

  it('retries one empty initial text response before handling the recovered reply', async () => {
    const world = createWorld();
    const agent = createAgent();

    mocks.generateAgentResponse
      .mockResolvedValueOnce({
        response: {
          type: 'text',
          content: '',
        },
        messageId: 'assistant-empty-1',
      })
      .mockResolvedValueOnce({
        response: {
          type: 'text',
          content: 'Recovered reply',
        },
        messageId: 'assistant-recovered-1',
      });

    const { processAgentMessage } = await import('../../../core/events/orchestrator.js');
    await processAgentMessage(world, agent, createMessageEvent('chat-1'));

    expect(mocks.generateAgentResponse).toHaveBeenCalledTimes(2);
    const retryGenerateCall = mocks.generateAgentResponse.mock.calls[1];
    expect(retryGenerateCall?.[2]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'system',
          content: expect.stringContaining('Do not return an empty response'),
        }),
      ]),
    );
    expect(mocks.handleTextResponse).toHaveBeenCalledWith(
      world,
      agent,
      'Recovered reply',
      'assistant-recovered-1',
      expect.objectContaining({
        chatId: 'chat-1',
        messageId: 'msg-user-1',
        sender: 'human',
        content: 'Run the test tool',
      }),
      'chat-1',
      {
        turnId: 'msg-user-1',
        source: 'direct',
      },
    );
    expect(mocks.publishEvent).not.toHaveBeenCalledWith(
      world,
      'system',
      expect.objectContaining({
        message: expect.stringContaining('empty response'),
      }),
      'chat-1',
    );
  });

  it('publishes a chat-scoped durable error when empty initial text responses persist', async () => {
    const world = createWorld();
    const agent = createAgent();

    mocks.generateAgentResponse
      .mockResolvedValueOnce({
        response: {
          type: 'text',
          content: '',
        },
        messageId: 'assistant-empty-1',
      })
      .mockResolvedValueOnce({
        response: {
          type: 'text',
          content: '   ',
        },
        messageId: 'assistant-empty-2',
      });

    const { processAgentMessage } = await import('../../../core/events/orchestrator.js');
    await processAgentMessage(world, agent, createMessageEvent('chat-1'));

    expect(mocks.generateAgentResponse).toHaveBeenCalledTimes(2);
    expect(mocks.handleTextResponse).not.toHaveBeenCalled();
    expect(mocks.publishEvent).toHaveBeenCalledWith(
      world,
      'system',
      expect.objectContaining({
        type: 'error',
        eventType: 'error',
        agentName: 'agent-a',
        message: '[Error] Agent returned an empty response. Please retry the request.',
      }),
      'chat-1',
    );
  });
});
