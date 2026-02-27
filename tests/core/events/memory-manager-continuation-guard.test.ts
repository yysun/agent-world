/**
 * Continuation Guard Tests for memory-manager
 *
 * Purpose:
 * - Verify `continueLLMAfterToolExecution` skips concurrent duplicate continuation runs
 *   for the same `(world, agent, chat)` scope.
 *
 * Key Features:
 * - Ensures an in-flight continuation prevents parallel duplicate LLM calls.
 * - Ensures the guard releases after completion so subsequent runs can proceed.
 *
 * Implementation Notes:
 * - Uses mocked in-memory storage and mocked LLM responses.
 * - Avoids any real provider/tool execution and filesystem-backed state.
 *
 * Recent Changes:
 * - 2026-02-27: Added coverage to suppress repeated identical `load_skill` tool calls within one continuation run.
 * - 2026-02-27: Added initial concurrency guard coverage for continuation runs.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import type { Agent, World } from '../../../core/types.js';

const mocks = vi.hoisted(() => ({
  saveAgent: vi.fn(async () => undefined),
  prepareMessagesForLLM: vi.fn(async () => []),
  generateAgentResponse: vi.fn(),
  publishMessageWithId: vi.fn(),
  getMCPToolsForWorld: vi.fn(),
  loadSkillExecute: vi.fn(),
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
  publishMessage: vi.fn(),
  publishMessageWithId: mocks.publishMessageWithId,
  publishSSE: vi.fn(),
  publishEvent: vi.fn(),
  publishToolEvent: vi.fn(),
  isStreamingEnabled: vi.fn().mockReturnValue(false),
}));

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForGenerateCallCount(count: number, timeoutMs = 250): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    if (mocks.generateAgentResponse.mock.calls.length >= count) {
      return;
    }
    await delay(10);
  }
}

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

function buildTextResponse(messageId: string, content = 'done') {
  return {
    response: {
      type: 'text' as const,
      content,
      assistantMessage: {
        role: 'assistant' as const,
        content,
      },
    },
    messageId,
  };
}

function buildToolCallResponse(messageId: string, toolCallId: string, toolName: string, args: Record<string, unknown>, content?: string) {
  return {
    response: {
      type: 'tool_calls' as const,
      content: content ?? `Calling tool: ${toolName}`,
      tool_calls: [{
        id: toolCallId,
        type: 'function' as const,
        function: {
          name: toolName,
          arguments: JSON.stringify(args),
        },
      }],
      assistantMessage: {
        role: 'assistant' as const,
        content: content ?? `Calling tool: ${toolName}`,
      },
    },
    messageId,
  };
}

describe('continueLLMAfterToolExecution guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mocks.saveAgent.mockResolvedValue(undefined);
    mocks.prepareMessagesForLLM.mockResolvedValue([]);
    mocks.getMCPToolsForWorld.mockResolvedValue({});
    mocks.loadSkillExecute.mockReset();
  });

  it('skips duplicate concurrent continuation run for same scope', async () => {
    const deferred = createDeferred<void>();
    mocks.generateAgentResponse.mockImplementation(async () => {
      await deferred.promise;
      return buildTextResponse('assistant-1');
    });

    const { continueLLMAfterToolExecution } = await import('../../../core/events/memory-manager.js');
    const world = createWorld();
    const agent = createAgent();

    const firstRun = continueLLMAfterToolExecution(world, agent, 'chat-1');

    await waitForGenerateCallCount(1);
    expect(mocks.generateAgentResponse).toHaveBeenCalledTimes(1);

    const secondRun = continueLLMAfterToolExecution(world, agent, 'chat-1');
    const secondRunOutcome = await Promise.race([
      secondRun.then(() => 'resolved'),
      delay(60).then(() => 'timeout'),
    ]);

    expect(secondRunOutcome).toBe('resolved');
    expect(mocks.generateAgentResponse).toHaveBeenCalledTimes(1);

    deferred.resolve();
    await firstRun;

    expect(mocks.publishMessageWithId).toHaveBeenCalledTimes(1);
  });

  it('allows a new run after previous continuation completes', async () => {
    mocks.generateAgentResponse
      .mockResolvedValueOnce(buildTextResponse('assistant-1', 'first'))
      .mockResolvedValueOnce(buildTextResponse('assistant-2', 'second'));

    const { continueLLMAfterToolExecution } = await import('../../../core/events/memory-manager.js');
    const world = createWorld();
    const agent = createAgent();

    await continueLLMAfterToolExecution(world, agent, 'chat-1');
    await continueLLMAfterToolExecution(world, agent, 'chat-1');

    expect(mocks.generateAgentResponse).toHaveBeenCalledTimes(2);
    expect(mocks.publishMessageWithId).toHaveBeenCalledTimes(2);
  });

  it('suppresses repeated identical load_skill calls in the same continuation run', async () => {
    mocks.generateAgentResponse
      .mockResolvedValueOnce(
        buildToolCallResponse(
          'assistant-tool-1',
          'call-load-skill-1',
          'load_skill',
          { skill_id: 'find-skills' },
          'Calling tool: load_skill (skill_id: "find-skills")',
        ),
      )
      .mockResolvedValueOnce(
        buildToolCallResponse(
          'assistant-tool-2',
          'call-load-skill-2',
          'load_skill',
          { skill_id: 'find-skills' },
          'Calling tool: load_skill',
        ),
      )
      .mockResolvedValueOnce(buildTextResponse('assistant-final', 'final answer'));

    mocks.loadSkillExecute.mockResolvedValue('<skill_context id="find-skills"><instructions># Find Skills</instructions></skill_context>');
    mocks.getMCPToolsForWorld.mockResolvedValue({
      load_skill: {
        execute: mocks.loadSkillExecute,
      },
    });

    const { continueLLMAfterToolExecution } = await import('../../../core/events/memory-manager.js');
    const world = createWorld();
    const agent = createAgent();

    await continueLLMAfterToolExecution(world, agent, 'chat-1');

    expect(mocks.loadSkillExecute).toHaveBeenCalledTimes(1);
    expect(mocks.generateAgentResponse).toHaveBeenCalledTimes(3);

    const loadSkillAssistantCalls = agent.memory.filter((message: any) =>
      message.role === 'assistant'
      && Array.isArray(message.tool_calls)
      && message.tool_calls.some((toolCall: any) => toolCall?.function?.name === 'load_skill')
    );
    expect(loadSkillAssistantCalls).toHaveLength(1);
    expect(mocks.publishMessageWithId).toHaveBeenCalledTimes(1);
  });

  it('suppresses immediate duplicate load_skill when skill is preloaded before continuation starts', async () => {
    mocks.generateAgentResponse
      .mockResolvedValueOnce(
        buildToolCallResponse(
          'assistant-tool-1',
          'call-load-skill-dup',
          'load_skill',
          { skill_id: 'find-skills' },
          'Calling tool: load_skill',
        ),
      )
      .mockResolvedValueOnce(buildTextResponse('assistant-final-2', 'done without duplicate'));

    mocks.loadSkillExecute.mockResolvedValue('<skill_context id="find-skills"><instructions># Find Skills</instructions></skill_context>');
    mocks.getMCPToolsForWorld.mockResolvedValue({
      load_skill: {
        execute: mocks.loadSkillExecute,
      },
    });

    const { continueLLMAfterToolExecution } = await import('../../../core/events/memory-manager.js');
    const world = createWorld();
    const agent = createAgent();

    await continueLLMAfterToolExecution(world, agent, 'chat-1', {
      preloadedSkillIds: ['find-skills'],
    });

    expect(mocks.loadSkillExecute).toHaveBeenCalledTimes(0);
    expect(mocks.generateAgentResponse).toHaveBeenCalledTimes(2);

    const loadSkillAssistantCalls = agent.memory.filter((message: any) =>
      message.role === 'assistant'
      && Array.isArray(message.tool_calls)
      && message.tool_calls.some((toolCall: any) => toolCall?.function?.name === 'load_skill')
    );
    expect(loadSkillAssistantCalls).toHaveLength(0);
    expect(mocks.publishMessageWithId).toHaveBeenCalledTimes(1);
  });
});
