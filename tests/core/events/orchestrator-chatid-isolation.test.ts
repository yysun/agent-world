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
 * - 2026-02-27: Added coverage for explicit `chatId` routing on `tool-execution` publish events.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import type { Agent, World, WorldMessageEvent } from '../../../core/types.js';

const mocks = vi.hoisted(() => ({
  saveAgent: vi.fn(async () => undefined),
  prepareMessagesForLLM: vi.fn(async () => []),
  generateAgentResponse: vi.fn(),
  getMCPToolsForWorld: vi.fn(),
  publishEvent: vi.fn(),
  publishToolEvent: vi.fn(),
  publishSSE: vi.fn(),
  publishMessage: vi.fn(),
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
  publishMessage: mocks.publishMessage,
  publishSSE: mocks.publishSSE,
  publishEvent: mocks.publishEvent,
  publishToolEvent: mocks.publishToolEvent,
  isStreamingEnabled: vi.fn().mockReturnValue(false),
}));

vi.mock('../../../core/events/memory-manager.js', () => ({
  handleTextResponse: mocks.handleTextResponse,
  continueLLMAfterToolExecution: mocks.continueLLMAfterToolExecution,
}));

vi.mock('../../../core/logger.js', () => ({
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

function createMessageEvent(chatId: string): WorldMessageEvent {
  return {
    content: 'Run the test tool',
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

  it('logs tool execution failures with world/chat scope', async () => {
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
  });
});
