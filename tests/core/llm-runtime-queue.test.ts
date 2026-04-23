/**
 * LLM Runtime Queue Regression Tests
 *
 * Purpose:
 * - Lock the host queue behavior introduced by the llm-runtime migration.
 *
 * Key Features:
 * - Verifies chat cancellation rejects queued callers instead of leaving them pending forever.
 * - Verifies queue timeouts reject even when the provider ignores abort signals.
 *
 * Implementation Notes:
 * - Mocks the external llm-runtime package so tests stay deterministic and in-memory.
 * - Uses `skipTools=true` to keep the coverage focused on queue semantics.
 *
 * Recent Changes:
 * - 2026-04-23: Added regression coverage that successful LLM calls clear queue timeout timers and do not emit stale timeout system events later.
 * - 2026-04-16: Added regression coverage for chat cancel and timeout behavior after the llm-runtime migration.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGenerate, mockStream, mockGetLLMProviderConfig } = vi.hoisted(() => ({
  mockGenerate: vi.fn(),
  mockStream: vi.fn(),
  mockGetLLMProviderConfig: vi.fn(() => ({ apiKey: 'test-key' })),
}));

vi.mock('llm-runtime', () => ({
  createMCPRegistry: vi.fn(() => ({
    resolveTools: vi.fn(async () => ({})),
  })),
  clearAllConfiguration: vi.fn(),
  configureLLMProvider: vi.fn(),
  generate: mockGenerate,
  getConfiguredProviders: vi.fn(() => []),
  getConfigurationStatus: vi.fn(() => ({})),
  getLLMProviderConfig: mockGetLLMProviderConfig,
  isProviderConfigured: vi.fn(() => false),
  parseMCPConfigJson: vi.fn(() => null),
  stream: mockStream,
  validateProviderConfig: vi.fn(),
}));

vi.mock('../../core/reliability-config.js', () => ({
  RELIABILITY_CONFIG: {
    mcp: {
      discoveryTimeoutMs: 5000,
      executionMaxAttempts: 2,
      executionRetryBaseDelayMs: 1000,
    },
    queue: {
      noResponseFallbackMs: 5000,
      maxRetryAttempts: 3,
      retryBaseDelayMs: 1000,
    },
    storage: {
      agentLoadRetries: 2,
      agentLoadRetryDelayMs: 75,
      sqliteBusyTimeoutMs: 30000,
    },
    llm: {
      processingTimeoutMs: 50,
      warningThresholdRatio: 0.5,
      minProcessingTimeoutMs: 1,
    },
    webFetch: {
      defaultTimeoutMs: 12000,
      maxTimeoutMs: 30000,
      minTimeoutMs: 1000,
      defaultMaxChars: 24000,
      maxMaxChars: 120000,
    },
  },
}));

import { cancelLLMCallsForChat, clearLLMQueue, generateAgentResponse, streamAgentResponse } from '../../core/llm-runtime.js';
import { LLMProvider } from '../../core/types.js';

function createWorld() {
  return {
    id: 'world-1',
    variables: '',
    mcpConfig: null,
    eventEmitter: {
      emit: vi.fn(),
    },
  } as any;
}

function createAgent() {
  return {
    id: 'agent-1',
    provider: LLMProvider.OPENAI,
    model: 'gpt-test',
    llmCallCount: 0,
    lastActive: new Date(0),
    lastLLMCall: new Date(0),
  } as any;
}

describe('llm-runtime queue behavior', () => {
  beforeEach(() => {
    mockGenerate.mockReset();
    mockStream.mockReset();
    mockGetLLMProviderConfig.mockClear();
  });

  afterEach(() => {
    clearLLMQueue();
    vi.useRealTimers();
  });

  it('rejects queued callers when a chat is canceled', async () => {
    mockGenerate.mockImplementationOnce(async ({ context }: { context?: { abortSignal?: AbortSignal } }) => {
      return await new Promise((_, reject) => {
        context?.abortSignal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        }, { once: true });
      });
    });

    const world = createWorld();
    const agent = createAgent();
    const activeCall = generateAgentResponse(world, agent, [], undefined, true, 'chat-1');
    const queuedCall = generateAgentResponse(world, agent, [], undefined, true, 'chat-1');

    await vi.waitFor(() => {
      expect(mockGenerate).toHaveBeenCalledTimes(1);
    });

    expect(cancelLLMCallsForChat(world.id, 'chat-1')).toEqual({
      canceledPending: 1,
      abortedActive: 1,
    });

    await expect(activeCall).rejects.toMatchObject({ name: 'AbortError' });
    await expect(queuedCall).rejects.toMatchObject({ name: 'AbortError' });
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });

  it('rejects with a timeout error even if the provider ignores abort', async () => {
    vi.useFakeTimers();

    mockGenerate.mockImplementationOnce(async () => {
      return await new Promise(() => undefined);
    });

    const world = createWorld();
    const agent = createAgent();
    const pendingCall = generateAgentResponse(world, agent, [], undefined, true, 'chat-timeout');
    const observedTimeout = expect(pendingCall).rejects.toThrow('LLM call timeout after 50ms');

    await vi.advanceTimersByTimeAsync(51);

    await observedTimeout;
  });

  it('passes configured provider config into streaming calls', async () => {
    mockStream.mockResolvedValueOnce({
      type: 'text',
      content: 'streamed',
      assistantMessage: {
        role: 'assistant',
        content: 'streamed',
      },
    });

    const world = createWorld();
    const agent = {
      ...createAgent(),
      provider: LLMProvider.GOOGLE,
      model: 'gemini-2.5-flash',
    } as any;

    await streamAgentResponse(world, agent, [], vi.fn(), 'chat-stream');

    expect(mockGetLLMProviderConfig).toHaveBeenCalledWith('google');
    expect(mockStream).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'google',
      providerConfig: { apiKey: 'test-key' },
    }));
  });

  it('does not emit timeout system status after a successful call already resolved', async () => {
    vi.useFakeTimers();

    mockGenerate.mockResolvedValueOnce({
      type: 'text',
      content: 'done',
      assistantMessage: {
        role: 'assistant',
        content: 'done',
      },
    });

    const world = createWorld();
    const agent = createAgent();

    const result = await generateAgentResponse(world, agent, [], undefined, true, 'chat-success');
    expect(result.response.content).toBe('done');

    await vi.advanceTimersByTimeAsync(500);

    expect(world.eventEmitter.emit).not.toHaveBeenCalledWith(
      'system',
      expect.objectContaining({
        content: expect.stringContaining('timed out for'),
        chatId: 'chat-success',
      }),
    );
  });
});