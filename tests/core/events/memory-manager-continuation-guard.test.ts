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
 * - 2026-03-01: Added coverage that duplicate `shell_cmd` suppression ignores `output_format`/`output_detail` differences and omits those format fields from tool event payloads.
 * - 2026-03-01: Added regression coverage for broader script hosts (`bash`, `node`, and `env <interpreter>`) using smart shell continuation mode when skill context is loaded.
 * - 2026-03-01: Added regression coverage ensuring shell_cmd path-based interpreter commands (for example `.venv/bin/python`) use smart continuation result mode when skill context is already loaded.
 * - 2026-03-01: Added coverage to suppress repeated identical `shell_cmd` calls within one continuation run by reusing prior command result.
 * - 2026-02-27: Added regression coverage ensuring continuation system events include explicit chatId scope.
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
  publishEvent: vi.fn(),
  publishToolEvent: vi.fn(),
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
  publishEvent: mocks.publishEvent,
  publishToolEvent: mocks.publishToolEvent,
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
    mocks.publishToolEvent.mockReset();
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

  it('suppresses repeated identical shell_cmd calls in the same continuation run', async () => {
    mocks.generateAgentResponse
      .mockResolvedValueOnce(
        buildToolCallResponse(
          'assistant-tool-shell-1',
          'call-shell-1',
          'shell_cmd',
          { command: 'python', parameters: ['scripts/convert.py', '-i', './score.musicxml'] },
          'Calling tool: shell_cmd',
        ),
      )
      .mockResolvedValueOnce(
        buildToolCallResponse(
          'assistant-tool-shell-2',
          'call-shell-2',
          'shell_cmd',
          { command: 'python', parameters: ['scripts/convert.py', '-i', './score.musicxml'] },
          'Calling tool: shell_cmd',
        ),
      )
      .mockResolvedValueOnce(buildTextResponse('assistant-final-shell', 'done with shell output'));

    const shellOutput = '![score](data:image/svg+xml;base64,AAA...)';
    const shellExecute = vi.fn().mockResolvedValue(shellOutput);
    mocks.getMCPToolsForWorld.mockResolvedValue({
      shell_cmd: {
        execute: shellExecute,
      },
    });

    const { continueLLMAfterToolExecution } = await import('../../../core/events/memory-manager.js');
    const world = createWorld();
    const agent = createAgent();

    await continueLLMAfterToolExecution(world, agent, 'chat-1');

    expect(shellExecute).toHaveBeenCalledTimes(1);
    expect(mocks.generateAgentResponse).toHaveBeenCalledTimes(3);

    const shellToolMessages = agent.memory.filter((message: any) =>
      message.role === 'tool' && typeof message.tool_call_id === 'string' && message.tool_call_id.startsWith('call-shell-')
    );
    expect(shellToolMessages).toHaveLength(2);
    expect(shellToolMessages[0]?.content).toBe(shellOutput);
    expect(shellToolMessages[1]?.content).toBe(shellOutput);

    expect(mocks.publishToolEvent).toHaveBeenCalledWith(
      world,
      expect.objectContaining({
        type: 'tool-result',
        messageId: 'call-shell-2',
        toolExecution: expect.objectContaining({
          metadata: expect.objectContaining({
            reusedFromContinuationRun: true,
          }),
        }),
      }),
    );

    expect(mocks.publishMessageWithId).toHaveBeenCalledTimes(1);
  });

  it('suppresses shell_cmd duplicates even when only output format/detail differ', async () => {
    mocks.generateAgentResponse
      .mockResolvedValueOnce(
        buildToolCallResponse(
          'assistant-tool-shell-format-1',
          'call-shell-format-1',
          'shell_cmd',
          {
            command: 'python3',
            parameters: ['scripts/convert.py', 'score.musicxml'],
            output_format: 'markdown',
            output_detail: 'minimal',
          },
          'Calling tool: shell_cmd',
        ),
      )
      .mockResolvedValueOnce(
        buildToolCallResponse(
          'assistant-tool-shell-format-2',
          'call-shell-format-2',
          'shell_cmd',
          {
            command: 'python3',
            parameters: ['scripts/convert.py', 'score.musicxml'],
            output_format: 'json',
            output_detail: 'full',
          },
          'Calling tool: shell_cmd',
        ),
      )
      .mockResolvedValueOnce(buildTextResponse('assistant-final-shell-format', 'done with format variants'));

    const shellOutput = 'stdout omitted from LLM context (contains image data URI output; 1000 chars).';
    const shellExecute = vi.fn().mockResolvedValue(shellOutput);
    mocks.getMCPToolsForWorld.mockResolvedValue({
      shell_cmd: {
        execute: shellExecute,
      },
    });

    const { continueLLMAfterToolExecution } = await import('../../../core/events/memory-manager.js');
    const world = createWorld();
    const agent = createAgent();

    await continueLLMAfterToolExecution(world, agent, 'chat-1');

    expect(shellExecute).toHaveBeenCalledTimes(1);
    expect(mocks.generateAgentResponse).toHaveBeenCalledTimes(3);

    const dedupedResultCall = mocks.publishToolEvent.mock.calls.find(([, event]) =>
      event?.type === 'tool-result'
      && event?.messageId === 'call-shell-format-2'
      && event?.toolExecution?.metadata?.reusedFromContinuationRun === true
    );
    expect(dedupedResultCall).toBeDefined();
    const dedupedResultEvent = dedupedResultCall?.[1];
    expect(dedupedResultEvent.toolExecution.input).not.toHaveProperty('output_format');
    expect(dedupedResultEvent.toolExecution.input).not.toHaveProperty('output_detail');
  });

  it('uses smart shell result mode for path-based python script calls when skill context is loaded', async () => {
    mocks.generateAgentResponse
      .mockResolvedValueOnce(
        buildToolCallResponse(
          'assistant-tool-shell-smart-1',
          'call-shell-smart-1',
          'shell_cmd',
          {
            command: '.agents/skills/music-to-svg/.venv/bin/python',
            parameters: ['.agents/skills/music-to-svg/scripts/convert.py', 'score.musicxml'],
          },
          'Calling tool: shell_cmd',
        ),
      )
      .mockResolvedValueOnce(buildTextResponse('assistant-final-smart-shell', 'finished'));

    const shellExecute = vi.fn().mockResolvedValue('status: success\nexit_code: 0');
    mocks.getMCPToolsForWorld.mockResolvedValue({
      shell_cmd: {
        execute: shellExecute,
      },
    });

    const { continueLLMAfterToolExecution } = await import('../../../core/events/memory-manager.js');
    const world = createWorld();
    const agent = createAgent();
    agent.memory.push({
      role: 'tool',
      content: '<skill_context id="music-to-svg"><instructions># Music to SVG</instructions></skill_context>',
      tool_call_id: 'call-load-skill-preloaded',
      sender: agent.id,
      createdAt: new Date(),
      chatId: 'chat-1',
      messageId: 'tool-preloaded-skill-context',
      agentId: agent.id,
    } as any);

    await continueLLMAfterToolExecution(world, agent, 'chat-1');

    expect(shellExecute).toHaveBeenCalledTimes(1);
    const shellContext = shellExecute.mock.calls[0]?.[3];
    expect(shellContext).toBeDefined();
    expect(shellContext.llmResultMode).toBe('smart');
    expect(mocks.publishMessageWithId).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      label: 'bash',
      command: '/bin/bash',
      parameters: ['scripts/render.sh'],
    },
    {
      label: 'node',
      command: '.tools/node/bin/node',
      parameters: ['scripts/render.mjs'],
    },
    {
      label: 'env-python',
      command: 'env',
      parameters: ['python3.11', 'scripts/convert.py'],
    },
  ])('uses smart shell result mode for generic script host: $label', async ({ command, parameters }) => {
    mocks.generateAgentResponse
      .mockResolvedValueOnce(
        buildToolCallResponse(
          'assistant-tool-shell-generic-1',
          'call-shell-generic-1',
          'shell_cmd',
          {
            command,
            parameters,
          },
          'Calling tool: shell_cmd',
        ),
      )
      .mockResolvedValueOnce(buildTextResponse('assistant-final-smart-generic', 'finished'));

    const shellExecute = vi.fn().mockResolvedValue('ok');
    mocks.getMCPToolsForWorld.mockResolvedValue({
      shell_cmd: {
        execute: shellExecute,
      },
    });

    const { continueLLMAfterToolExecution } = await import('../../../core/events/memory-manager.js');
    const world = createWorld();
    const agent = createAgent();
    agent.memory.push({
      role: 'tool',
      content: '<skill_context id="generic-script-skill"><instructions># Generic Script Skill</instructions></skill_context>',
      tool_call_id: 'call-load-skill-preloaded-generic',
      sender: agent.id,
      createdAt: new Date(),
      chatId: 'chat-1',
      messageId: 'tool-preloaded-skill-context-generic',
      agentId: agent.id,
    } as any);

    await continueLLMAfterToolExecution(world, agent, 'chat-1');

    expect(shellExecute).toHaveBeenCalledTimes(1);
    const shellContext = shellExecute.mock.calls[0]?.[3];
    expect(shellContext).toBeDefined();
    expect(shellContext.llmResultMode).toBe('smart');
    expect(mocks.publishMessageWithId).toHaveBeenCalledTimes(1);
  });

  it('publishes empty-follow-up warning to explicit chat scope', async () => {
    const world = createWorld();
    const agent = createAgent();

    mocks.generateAgentResponse.mockImplementationOnce(async () => {
      world.currentChatId = 'chat-2';
      return buildTextResponse('assistant-empty', '');
    });

    const { continueLLMAfterToolExecution } = await import('../../../core/events/memory-manager.js');
    await continueLLMAfterToolExecution(world, agent, 'chat-1', {
      emptyTextRetryCount: 2,
    });

    expect(mocks.publishEvent).toHaveBeenCalledWith(
      world,
      'system',
      expect.objectContaining({ type: 'warning' }),
      'chat-1',
    );
  });

  it('publishes continuation errors to explicit chat scope', async () => {
    const world = createWorld();
    const agent = createAgent();

    mocks.generateAgentResponse.mockImplementationOnce(async () => {
      world.currentChatId = 'chat-2';
      throw new Error('forced continuation failure');
    });

    const { continueLLMAfterToolExecution } = await import('../../../core/events/memory-manager.js');
    await continueLLMAfterToolExecution(world, agent, 'chat-1');

    expect(mocks.publishEvent).toHaveBeenCalledWith(
      world,
      'system',
      expect.objectContaining({ type: 'error' }),
      'chat-1',
    );
  });
});
