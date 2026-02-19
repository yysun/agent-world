/**
 * create_agent Tool Tests
 *
 * Purpose:
 * - Validate approval-gated `create_agent` behavior and deterministic prompt generation.
 *
 * Key Features:
 * - Enforces approval before agent creation.
 * - Uses world-level provider/model for newly created agents when configured.
 * - Applies deterministic fallback provider/model defaults when world values are missing.
 * - Produces required system prompt structure with optional role and next-agent routing.
 *
 * Notes on Implementation:
 * - Uses mocked HITL + manager APIs for deterministic behavior.
 * - Avoids filesystem and external LLM providers.
 *
 * Recent Changes:
 * - 2026-02-19: Initial coverage for built-in `create_agent` tool behavior.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCreateAgentToolDefinition } from '../../core/create-agent-tool.js';
import { requestWorldOption } from '../../core/hitl.js';
import { createAgent } from '../../core/managers.js';
import { LLMProvider } from '../../core/types.js';

vi.mock('../../core/hitl.js', () => ({
  requestWorldOption: vi.fn(async () => ({
    requestId: 'hitl-1',
    worldId: 'world-1',
    chatId: 'chat-1',
    optionId: 'yes',
    source: 'user',
  })),
}));

vi.mock('../../core/managers.js', () => ({
  createAgent: vi.fn(async () => ({
    id: 'planner',
    name: 'Planner',
    type: 'default',
    autoReply: true,
    provider: 'anthropic',
    model: 'claude-3-5-sonnet',
    systemPrompt: 'stub',
    llmCallCount: 0,
    memory: [],
  })),
}));

const mockedRequestWorldOption = vi.mocked(requestWorldOption);
const mockedCreateAgent = vi.mocked(createAgent);

function buildWorldContext(overrides: Record<string, unknown> = {}): any {
  return {
    id: 'world-1',
    currentChatId: 'chat-1',
    chatLLMProvider: 'anthropic',
    chatLLMModel: 'claude-3-5-sonnet',
    eventEmitter: { emit: vi.fn() },
    ...overrides,
  };
}

describe('core/create-agent-tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedRequestWorldOption.mockResolvedValue({
      requestId: 'hitl-1',
      worldId: 'world-1',
      chatId: 'chat-1',
      optionId: 'yes',
      source: 'user',
    });
    mockedCreateAgent.mockResolvedValue({
      id: 'planner',
      name: 'Planner',
      type: 'default',
      autoReply: true,
      provider: 'anthropic',
      model: 'claude-3-5-sonnet',
      systemPrompt: 'stub',
      llmCallCount: 0,
      memory: [],
    } as any);
  });

  it('returns validation error when name is missing', async () => {
    const tool = createCreateAgentToolDefinition();
    const resultRaw = await tool.execute({}, undefined, undefined, {
      world: buildWorldContext(),
    });
    const result = JSON.parse(resultRaw);

    expect(result.success).toBe(false);
    expect(result.created).toBe(false);
    expect(result.error).toContain('Missing required parameter: name');
    expect(mockedRequestWorldOption).not.toHaveBeenCalled();
    expect(mockedCreateAgent).not.toHaveBeenCalled();
  });

  it('returns denial payload and does not create agent when approval is denied', async () => {
    mockedRequestWorldOption.mockResolvedValueOnce({
      requestId: 'hitl-2',
      worldId: 'world-1',
      chatId: 'chat-1',
      optionId: 'no',
      source: 'user',
    });

    const tool = createCreateAgentToolDefinition();
    const resultRaw = await tool.execute(
      { name: 'Planner' },
      undefined,
      undefined,
      { world: buildWorldContext() },
    );
    const result = JSON.parse(resultRaw);

    expect(result.success).toBe(false);
    expect(result.created).toBe(false);
    expect(result.approval.approved).toBe(false);
    expect(result.approval.optionId).toBe('no');
    expect(mockedCreateAgent).not.toHaveBeenCalled();
  });

  it('inherits provider/model from world configuration and creates deterministic prompt', async () => {
    mockedCreateAgent.mockResolvedValueOnce({
      id: 'planner',
      name: 'Planner',
      type: 'default',
      autoReply: false,
      provider: 'anthropic',
      model: 'claude-3-5-sonnet',
      systemPrompt: [
        'You are agent Planner. Your role is triage coordinator.',
        '',
        'Always respond in exactly this structure:',
        '@reviewer',
        '{Your response}',
      ].join('\n'),
      llmCallCount: 0,
      memory: [],
    } as any);

    const tool = createCreateAgentToolDefinition();
    const resultRaw = await tool.execute(
      {
        name: 'Planner',
        autoReply: false,
        role: 'triage coordinator',
        nextAgent: 'reviewer',
      },
      undefined,
      undefined,
      { world: buildWorldContext() },
    );
    const result = JSON.parse(resultRaw);

    expect(mockedCreateAgent).toHaveBeenCalledWith(
      'world-1',
      expect.objectContaining({
        name: 'Planner',
        type: 'default',
        autoReply: false,
        provider: LLMProvider.ANTHROPIC,
        model: 'claude-3-5-sonnet',
        systemPrompt: [
          'You are agent Planner. Your role is triage coordinator.',
          '',
          'Always respond in exactly this structure:',
          '@reviewer',
          '{Your response}',
        ].join('\n'),
      }),
      { allowWhileProcessing: true },
    );

    expect(result.success).toBe(true);
    expect(result.created).toBe(true);
    expect(result.agent.provider).toBe('anthropic');
    expect(result.agent.model).toBe('claude-3-5-sonnet');
    expect(result.agent.nextAgent).toBe('reviewer');
  });

  it('uses deterministic defaults when world provider/model/nextAgent are missing', async () => {
    mockedCreateAgent.mockResolvedValueOnce({
      id: 'planner',
      name: 'Planner',
      type: 'default',
      autoReply: true,
      provider: 'openai',
      model: 'gpt-4',
      systemPrompt: [
        'You are agent Planner. Your role is not specified.',
        '',
        'Always respond in exactly this structure:',
        '@human',
        '{Your response}',
      ].join('\n'),
      llmCallCount: 0,
      memory: [],
    } as any);

    const tool = createCreateAgentToolDefinition();
    const resultRaw = await tool.execute(
      { name: 'Planner' },
      undefined,
      undefined,
      {
        world: buildWorldContext({
          chatLLMProvider: '',
          chatLLMModel: '',
        }),
      },
    );
    const result = JSON.parse(resultRaw);

    expect(mockedCreateAgent).toHaveBeenCalledWith(
      'world-1',
      expect.objectContaining({
        provider: LLMProvider.OPENAI,
        model: 'gpt-4',
        systemPrompt: [
          'You are agent Planner. Your role is not specified.',
          '',
          'Always respond in exactly this structure:',
          '@human',
          '{Your response}',
        ].join('\n'),
      }),
      { allowWhileProcessing: true },
    );
    expect(result.success).toBe(true);
    expect(result.created).toBe(true);
    expect(result.agent.provider).toBe('openai');
    expect(result.agent.model).toBe('gpt-4');
    expect(result.agent.nextAgent).toBe('human');
  });

  it('returns error when world runtime context is unavailable', async () => {
    const tool = createCreateAgentToolDefinition();
    const resultRaw = await tool.execute({ name: 'Planner' });
    const result = JSON.parse(resultRaw);

    expect(result.success).toBe(false);
    expect(result.created).toBe(false);
    expect(result.error).toContain('Approval context unavailable');
    expect(mockedRequestWorldOption).not.toHaveBeenCalled();
    expect(mockedCreateAgent).not.toHaveBeenCalled();
  });

  it('returns structured error when createAgent throws', async () => {
    mockedCreateAgent.mockRejectedValueOnce(new Error("Agent with ID 'planner' already exists"));

    const tool = createCreateAgentToolDefinition();
    const resultRaw = await tool.execute(
      { name: 'Planner' },
      undefined,
      undefined,
      { world: buildWorldContext() },
    );
    const result = JSON.parse(resultRaw);

    expect(result.success).toBe(false);
    expect(result.created).toBe(false);
    expect(result.error).toContain("already exists");
  });
});
