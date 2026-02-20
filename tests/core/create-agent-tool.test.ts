/**
 * create_agent Tool Tests
 *
 * Purpose:
 * - Validate approval-gated built-in agent creation behavior and deterministic prompt formatting.
 *
 * Key Features Tested:
 * - Required `name` validation through shared tool validation wrapper.
 * - Denied/timeout approval paths that prevent persistence.
 * - Alias normalization for `auto-reply` and `next agent` variants.
 * - Deterministic prompt first-line behavior with and without optional `role`.
 * - World provider/model inheritance with deterministic fallback defaults.
 * - Manager error propagation for duplicate/conflicting create attempts.
 *
 * Implementation Notes:
 * - Uses vitest mocks for HITL and manager calls (no real storage/LLM access).
 * - Uses wrapper-based execution to exercise real alias/validation behavior.
 *
 * Recent Changes:
 * - 2026-02-20: Added coverage that `create_agent` forwards manager override to allow in-turn creation while world processing is active.
 * - 2026-02-20: Added initial unit coverage for built-in `create_agent`.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCreateAgentToolDefinition } from '../../core/create-agent-tool.js';
import { requestWorldOption } from '../../core/hitl.js';
import { createAgent, claimAgentCreationSlot } from '../../core/managers.js';
import { wrapToolWithValidation } from '../../core/tool-utils.js';
import { LLMProvider } from '../../core/types.js';

vi.mock('../../core/hitl.js', () => ({
  requestWorldOption: vi.fn(async () => ({
    worldId: 'world-1',
    requestId: 'req-1',
    chatId: 'chat-1',
    optionId: 'yes',
    source: 'user',
  })),
}));

vi.mock('../../core/managers.js', () => ({
  claimAgentCreationSlot: vi.fn(async () => ({
    claimed: true,
    release: vi.fn(),
  })),
  createAgent: vi.fn(async (_worldId: string, params: any) => ({
    id: String(params.name || '').toLowerCase().replace(/\s+/g, '-'),
    name: params.name,
    type: params.type,
    autoReply: params.autoReply ?? false,
    status: 'inactive',
    provider: params.provider,
    model: params.model,
    systemPrompt: params.systemPrompt,
    temperature: undefined,
    maxTokens: undefined,
    createdAt: new Date('2026-02-20T00:00:00.000Z'),
    lastActive: new Date('2026-02-20T00:00:00.000Z'),
    llmCallCount: 0,
    memory: [],
  })),
}));

const mockedRequestWorldOption = vi.mocked(requestWorldOption);
const mockedCreateAgent = vi.mocked(createAgent);
const mockedClaimAgentCreationSlot = vi.mocked(claimAgentCreationSlot);

function buildWrappedCreateAgentTool() {
  const tool = createCreateAgentToolDefinition();
  return wrapToolWithValidation(tool, 'create_agent');
}

function buildToolContext(overrides?: Record<string, unknown>) {
  return {
    world: {
      id: 'world-1',
      name: 'World 1',
      turnLimit: 5,
      chatLLMProvider: LLMProvider.OPENAI,
      chatLLMModel: 'gpt-4.1',
      currentChatId: 'chat-1',
      eventEmitter: { emit: vi.fn() },
      ...overrides,
    },
    chatId: 'chat-1',
  };
}

describe('core/create-agent-tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedClaimAgentCreationSlot.mockResolvedValue({
      claimed: true,
      release: vi.fn(),
    });
    mockedRequestWorldOption.mockResolvedValue({
      worldId: 'world-1',
      requestId: 'req-1',
      chatId: 'chat-1',
      optionId: 'yes',
      source: 'user',
    });
  });

  it('rejects execution when required name is missing', async () => {
    const tool = buildWrappedCreateAgentTool();
    const result = await tool.execute({}, undefined, undefined, buildToolContext());

    expect(typeof result).toBe('string');
    expect(String(result)).toContain('Tool parameter validation failed for create_agent');
    expect(String(result)).toContain("Required parameter 'name' is missing or empty");
    expect(mockedClaimAgentCreationSlot).not.toHaveBeenCalled();
    expect(mockedRequestWorldOption).not.toHaveBeenCalled();
    expect(mockedCreateAgent).not.toHaveBeenCalled();
  });

  it('returns denied result and does not create when approval is denied', async () => {
    mockedRequestWorldOption.mockResolvedValueOnce({
      worldId: 'world-1',
      requestId: 'req-2',
      chatId: 'chat-1',
      optionId: 'no',
      source: 'user',
    });

    const tool = buildWrappedCreateAgentTool();
    const result = await tool.execute(
      { name: 'Review Agent' },
      undefined,
      undefined,
      buildToolContext(),
    );

    const payload = JSON.parse(String(result));
    expect(payload).toMatchObject({
      ok: false,
      status: 'denied',
      created: false,
      reason: 'user_denied',
      name: 'Review Agent',
    });
    expect(mockedCreateAgent).not.toHaveBeenCalled();
    expect(mockedRequestWorldOption).toHaveBeenCalledTimes(1);
  });

  it('returns timeout denial result and does not create when approval times out', async () => {
    mockedRequestWorldOption.mockResolvedValueOnce({
      worldId: 'world-1',
      requestId: 'req-3',
      chatId: 'chat-1',
      optionId: 'no',
      source: 'timeout',
    });

    const tool = buildWrappedCreateAgentTool();
    const result = await tool.execute(
      { name: 'Slow Agent' },
      undefined,
      undefined,
      buildToolContext(),
    );

    const payload = JSON.parse(String(result));
    expect(payload).toMatchObject({
      ok: false,
      status: 'denied',
      created: false,
      reason: 'timeout',
      name: 'Slow Agent',
    });
    expect(mockedCreateAgent).not.toHaveBeenCalled();
    expect(mockedRequestWorldOption).toHaveBeenCalledTimes(1);
  });

  it('returns agent_exists error before approval when pre-claim detects existing agent', async () => {
    mockedClaimAgentCreationSlot.mockResolvedValueOnce({
      claimed: false,
      reason: 'already_exists',
      name: 'Dup Agent',
    } as any);

    const tool = buildWrappedCreateAgentTool();
    const result = await tool.execute(
      { name: 'Dup Agent' },
      undefined,
      undefined,
      buildToolContext(),
    );

    const payload = JSON.parse(String(result));
    expect(payload).toMatchObject({
      ok: false,
      status: 'error',
      code: 'agent_exists',
      created: false,
      name: 'Dup Agent',
    });
    expect(mockedRequestWorldOption).not.toHaveBeenCalled();
    expect(mockedCreateAgent).not.toHaveBeenCalled();
  });

  it('normalizes auto-reply and next agent aliases into canonical create params', async () => {
    const tool = buildWrappedCreateAgentTool();
    await tool.execute(
      {
        name: 'Router Agent',
        'auto-reply': false,
        'next agent': 'reviewer',
      },
      undefined,
      undefined,
      buildToolContext(),
    );

    expect(mockedCreateAgent).toHaveBeenCalledTimes(1);
    expect(mockedCreateAgent).toHaveBeenCalledWith(
      'world-1',
      expect.objectContaining({
        name: 'Router Agent',
        autoReply: false,
        type: 'default',
        systemPrompt: expect.stringContaining('\n@reviewer\n'),
      }),
      { allowWhileWorldProcessing: true, slotAlreadyClaimed: true },
    );
  });

  it('builds exact deterministic prompt when role is provided', async () => {
    const tool = buildWrappedCreateAgentTool();
    await tool.execute(
      {
        name: 'Planner',
        role: 'Plan tasks',
        nextAgent: 'executor',
      },
      undefined,
      undefined,
      buildToolContext(),
    );

    expect(mockedCreateAgent).toHaveBeenCalledWith(
      'world-1',
      expect.objectContaining({
        systemPrompt: [
          'You are agent Planner. Your role is Plan tasks.',
          '',
          'Always respond in exactly this structure:',
          '@executor',
          '{Your response}',
        ].join('\n'),
      }),
      { allowWhileWorldProcessing: true, slotAlreadyClaimed: true },
    );
  });

  it('builds exact deterministic prompt with default nextAgent when role is omitted', async () => {
    const tool = buildWrappedCreateAgentTool();
    const result = await tool.execute(
      { name: 'Worker' },
      undefined,
      undefined,
      buildToolContext({ chatLLMProvider: undefined, chatLLMModel: undefined }),
    );

    expect(mockedCreateAgent).toHaveBeenCalledWith(
      'world-1',
      expect.objectContaining({
        autoReply: false,
        provider: 'openai',
        model: 'gpt-4',
        systemPrompt: [
          'You are agent Worker.',
          '',
          'Always respond in exactly this structure:',
          '@human',
          '{Your response}',
        ].join('\n'),
      }),
      { allowWhileWorldProcessing: true, slotAlreadyClaimed: true },
    );

    const payload = JSON.parse(String(result));
    expect(payload).toMatchObject({
      ok: true,
      status: 'created',
      created: true,
      agent: {
        autoReply: false,
      },
      effective: {
        role: null,
        nextAgent: 'human',
      },
    });
  });

  it('inherits provider/model from world chat settings when configured', async () => {
    const tool = buildWrappedCreateAgentTool();
    await tool.execute(
      { name: 'Inherited Model Agent' },
      undefined,
      undefined,
      buildToolContext({
        chatLLMProvider: LLMProvider.ANTHROPIC,
        chatLLMModel: 'claude-3-7-sonnet',
      }),
    );

    expect(mockedCreateAgent).toHaveBeenCalledWith(
      'world-1',
      expect.objectContaining({
        provider: LLMProvider.ANTHROPIC,
        model: 'claude-3-7-sonnet',
      }),
      { allowWhileWorldProcessing: true, slotAlreadyClaimed: true },
    );
  });

  it('forwards allowWhileWorldProcessing override to manager createAgent', async () => {
    const tool = buildWrappedCreateAgentTool();
    await tool.execute(
      { name: 'Retry Agent' },
      undefined,
      undefined,
      buildToolContext(),
    );

    expect(mockedCreateAgent).toHaveBeenCalledTimes(1);
    expect(mockedCreateAgent).toHaveBeenCalledWith(
      'world-1',
      expect.objectContaining({
        name: 'Retry Agent',
      }),
      { allowWhileWorldProcessing: true, slotAlreadyClaimed: true },
    );
  });

  it('shows post-create info confirmation with refresh metadata after successful creation', async () => {
    const tool = buildWrappedCreateAgentTool();
    await tool.execute(
      { name: 'Notifier', role: 'Assist', nextAgent: 'human' },
      undefined,
      undefined,
      buildToolContext(),
    );

    expect(mockedRequestWorldOption).toHaveBeenCalledTimes(2);
    const secondCallArgs = mockedRequestWorldOption.mock.calls[1];
    expect(secondCallArgs?.[1]).toMatchObject({
      title: 'Agent Notifier created',
      message: expect.stringContaining('Agent Notifier has been created.'),
      options: [{ id: 'dismiss', label: 'Dismiss', description: 'Close this confirmation.' }],
      defaultOptionId: 'dismiss',
      metadata: {
        kind: 'create_agent_created',
        refreshAfterDismiss: true,
      },
    });
  });

  it('returns create_failed result when manager createAgent throws', async () => {
    mockedCreateAgent.mockRejectedValueOnce(new Error("Agent with ID 'dup-agent' already exists"));

    const tool = buildWrappedCreateAgentTool();
    const result = await tool.execute(
      { name: 'Dup Agent' },
      undefined,
      undefined,
      buildToolContext(),
    );

    const payload = JSON.parse(String(result));
    expect(payload).toMatchObject({
      ok: false,
      status: 'error',
      code: 'create_failed',
      created: false,
      name: 'Dup Agent',
    });
    expect(String(payload.message)).toContain("already exists");
  });
});
