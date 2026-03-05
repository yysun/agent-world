/**
 * LLM Manager Feature-Path Logging Tests
 *
 * Purpose:
 * - Validate canonical feature-path logging at the LLM boundary.
 *
 * Key features:
 * - Verifies `llm.prep`, `llm.request.meta`, and `llm.response.meta` emissions.
 * - Verifies opt-in raw payload category gating for `llm.request.raw` and `llm.response.raw`.
 * - Verifies redaction is applied to raw payload logs.
 *
 * Implementation notes:
 * - Mocks provider/runtime dependencies to keep tests deterministic and unit-scoped.
 * - Captures per-category logger calls via mocked `createCategoryLogger`.
 *
 * Recent changes:
 * - 2026-03-05: Added warning-then-success queue-timeout threshold coverage to verify `taking too long` can precede successful completion without timeout.
 * - 2026-03-05: Added streaming-path timeout parity coverage to verify warning/timeout status behavior matches non-streaming queue semantics.
 * - 2026-03-05: Added queue-timeout warning/timeout system-event coverage (`taking too long` + hard timeout abort path).
 * - 2026-03-05: Added regression assertion that queue hard-timeout is classified/logged as timeout (not cancellation).
 * - 2026-03-04: Added Azure deployment routing tests to ensure `agent.model` drives Azure deployment URL selection, with configured deployment fallback.
 * - 2026-02-28: Added targeted coverage for feature-path LLM boundary logging.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LLMProvider } from '../../core/types.js';

type LoggedCall = {
  category: string;
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error';
  message: unknown;
  data: any;
};

type LoadResult = {
  mod: typeof import('../../core/llm-manager.js');
  calls: LoggedCall[];
  openaiDirectMocks: {
    createClientForProvider: ReturnType<typeof vi.fn>;
    streamOpenAIResponse: ReturnType<typeof vi.fn>;
    generateOpenAIResponse: ReturnType<typeof vi.fn>;
  };
};

async function loadModuleWithMocks(options?: {
  rawEnabled?: boolean;
  llmProviderConfig?: Record<string, unknown>;
}): Promise<LoadResult> {
  vi.resetModules();
  const rawEnabled = options?.rawEnabled ?? false;
  const llmProviderConfig = options?.llmProviderConfig ?? { apiKey: 'openai-key' };
  const calls: LoggedCall[] = [];
  const openaiDirectMocks = {
    createClientForProvider: vi.fn(() => ({ client: 'ok' })),
    streamOpenAIResponse: vi.fn(async () => ({
      type: 'text',
      content: 'stream-response',
      assistantMessage: { role: 'assistant', content: 'stream-response' },
    })),
    generateOpenAIResponse: vi.fn(async () => ({
      type: 'text',
      content: 'non-stream-response',
      assistantMessage: { role: 'assistant', content: 'non-stream-response' },
      debugToken: 'sensitive-response-token',
    })),
  };

  vi.doMock('../../core/logger.js', () => ({
    createCategoryLogger: (category: string) => ({
      trace: (message: unknown, data?: unknown) => calls.push({ category, level: 'trace', message, data }),
      debug: (message: unknown, data?: unknown) => calls.push({ category, level: 'debug', message, data }),
      info: (message: unknown, data?: unknown) => calls.push({ category, level: 'info', message, data }),
      warn: (message: unknown, data?: unknown) => calls.push({ category, level: 'warn', message, data }),
      error: (message: unknown, data?: unknown) => calls.push({ category, level: 'error', message, data }),
    }),
    shouldLogForCategory: vi.fn((_level: string, category: string) => {
      if (category === 'llm.request.raw' || category === 'llm.response.raw') {
        return rawEnabled;
      }
      return false;
    }),
  }));

  vi.doMock('../../core/mcp-server-registry.js', () => ({
    getMCPToolsForWorld: vi.fn(async () => ({
      shell_cmd: {
        description: 'execute shell',
        parameters: { type: 'object', properties: {} },
        execute: vi.fn(),
        apiKey: 'sensitive-mcp-key',
      },
    })),
  }));

  vi.doMock('../../core/openai-direct.js', () => ({
    createClientForProvider: openaiDirectMocks.createClientForProvider,
    streamOpenAIResponse: openaiDirectMocks.streamOpenAIResponse,
    generateOpenAIResponse: openaiDirectMocks.generateOpenAIResponse,
  }));

  vi.doMock('../../core/anthropic-direct.js', () => ({
    createAnthropicClientForAgent: vi.fn(),
    streamAnthropicResponse: vi.fn(),
    generateAnthropicResponse: vi.fn(),
  }));

  vi.doMock('../../core/google-direct.js', () => ({
    createGoogleClientForAgent: vi.fn(),
    streamGoogleResponse: vi.fn(),
    generateGoogleResponse: vi.fn(),
  }));

  vi.doMock('../../core/llm-config.js', () => ({
    getLLMProviderConfig: vi.fn(() => llmProviderConfig),
  }));

  const mod = await import('../../core/llm-manager.js');
  return { mod, calls, openaiDirectMocks };
}

function buildWorld(): any {
  return {
    id: 'world-1',
    currentChatId: 'chat-1',
    eventEmitter: {
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    },
  };
}

function buildAgent(): any {
  return {
    id: 'agent-1',
    provider: LLMProvider.OPENAI,
    model: 'gpt-test',
    temperature: 0.2,
    maxTokens: 256,
    llmCallCount: 0,
    memory: [],
  };
}

describe('llm-manager feature-path logging', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('emits canonical request/response metadata categories in non-streaming flow', async () => {
    const { mod, calls } = await loadModuleWithMocks({ rawEnabled: false });

    const world = buildWorld();
    const agent = buildAgent();
    const messages = [
      { role: 'system', content: 'You are helpful', sender: 'system', createdAt: new Date() },
      { role: 'user', content: 'hello', sender: 'human', createdAt: new Date() },
    ] as any;

    await mod.generateAgentResponse(world, agent, messages, undefined, false, 'chat-1');

    const prepCall = calls.find(call => call.category === 'llm.prep' && call.message === 'Prepared messages for LLM request');
    const requestMetaCall = calls.find(call => call.category === 'llm.request.meta' && call.message === 'LLM request ready');
    const responseMetaCall = calls.find(call => call.category === 'llm.response.meta' && call.message === 'LLM response received');

    expect(prepCall).toBeTruthy();
    expect(requestMetaCall).toBeTruthy();
    expect(responseMetaCall).toBeTruthy();
    expect(requestMetaCall?.data.worldId).toBe('world-1');
    expect(requestMetaCall?.data.chatId).toBe('chat-1');
    expect(requestMetaCall?.data.agentId).toBe('agent-1');
    expect(typeof requestMetaCall?.data.messageId).toBe('string');

    expect(calls.some(call => call.category === 'llm.request.raw')).toBe(false);
    expect(calls.some(call => call.category === 'llm.response.raw')).toBe(false);
  });

  it('emits redacted raw payload categories only when raw logging is enabled', async () => {
    const { mod, calls } = await loadModuleWithMocks({ rawEnabled: true });

    const world = buildWorld();
    const agent = buildAgent();
    const messages = [
      { role: 'system', content: 'System prompt', sender: 'system', createdAt: new Date() },
      { role: 'user', content: 'Run tool', sender: 'human', createdAt: new Date() },
    ] as any;

    await mod.generateAgentResponse(world, agent, messages, undefined, false, 'chat-1');

    const requestRawCall = calls.find(call => call.category === 'llm.request.raw' && call.message === 'LLM request payload');
    const responseRawCall = calls.find(call => call.category === 'llm.response.raw' && call.message === 'LLM response payload');

    expect(requestRawCall).toBeTruthy();
    expect(responseRawCall).toBeTruthy();
    expect(requestRawCall?.data?.payload?.tools?.shell_cmd?.apiKey).toBe('[REDACTED]');
    expect(responseRawCall?.data?.payload?.debugToken).toBe('[REDACTED]');
  });

  it('uses agent.model as Azure deployment when creating Azure OpenAI client', async () => {
    const { mod, openaiDirectMocks } = await loadModuleWithMocks({
      llmProviderConfig: {
        apiKey: 'azure-key',
        resourceName: 'my-resource',
        deployment: 'env-deployment',
      },
    });

    const world = buildWorld();
    const agent = {
      ...buildAgent(),
      provider: LLMProvider.AZURE,
      model: 'gpt-5-mini',
    } as any;
    const messages = [
      { role: 'user', content: 'hello', sender: 'human', createdAt: new Date() },
    ] as any;

    await mod.generateAgentResponse(world, agent, messages, undefined, false, 'chat-1');

    expect(openaiDirectMocks.createClientForProvider).toHaveBeenCalledWith('azure', expect.objectContaining({
      deployment: 'gpt-5-mini',
    }));
  });

  it('falls back to configured Azure deployment when agent.model is blank', async () => {
    const { mod, openaiDirectMocks } = await loadModuleWithMocks({
      llmProviderConfig: {
        apiKey: 'azure-key',
        resourceName: 'my-resource',
        deployment: 'env-deployment',
      },
    });
    const world = buildWorld();
    const agent = { ...buildAgent(), provider: LLMProvider.AZURE, model: '   ' } as any;
    const messages = [{ role: 'user', content: 'hello', sender: 'human', createdAt: new Date() }] as any;

    await mod.generateAgentResponse(world, agent, messages, undefined, false, 'chat-1');

    expect(openaiDirectMocks.createClientForProvider).toHaveBeenCalledWith('azure', expect.objectContaining({
      deployment: 'env-deployment',
    }));
  });

  it('emits chat-scoped taking-too-long and timeout system events for long LLM calls', async () => {
    vi.useFakeTimers();
    try {
      const { mod, openaiDirectMocks, calls } = await loadModuleWithMocks({ rawEnabled: false });
      let capturedAbortSignal: AbortSignal | undefined;

      openaiDirectMocks.generateOpenAIResponse.mockImplementation(async (...args: any[]) => {
        capturedAbortSignal = args[6];
        return await new Promise(() => { });
      });

      const world = buildWorld();
      const agent = buildAgent();
      const messages = [
        { role: 'user', content: 'hello', sender: 'human', createdAt: new Date() },
      ] as any;

      const pending = mod.generateAgentResponse(world, agent, messages, undefined, false, 'chat-1');
      const observedError = pending.then(
        () => null,
        (error) => error as Error,
      );

      await vi.advanceTimersByTimeAsync(450000);
      expect(world.eventEmitter.emit).toHaveBeenCalledWith(
        'system',
        expect.objectContaining({
          chatId: 'chat-1',
          content: expect.stringContaining('taking too long'),
        }),
      );

      await vi.advanceTimersByTimeAsync(450000);
      const timeoutError = await observedError;
      expect(timeoutError).toBeInstanceOf(Error);
      expect(timeoutError?.message).toContain('LLM call timeout after 900000ms');

      expect(capturedAbortSignal?.aborted).toBe(true);
      expect(world.eventEmitter.emit).toHaveBeenCalledWith(
        'system',
        expect.objectContaining({
          chatId: 'chat-1',
          content: expect.stringContaining('timed out'),
        }),
      );
      expect(calls.some((call) =>
        call.category === 'llm.queue' &&
        call.level === 'warn' &&
        call.message === 'LLM queue call timed out'
      )).toBe(true);
      expect(calls.some((call) =>
        call.category === 'llm.queue' &&
        call.level === 'info' &&
        call.message === 'LLM queue call canceled'
      )).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('emits taking-too-long warning and still succeeds before hard timeout', async () => {
    vi.useFakeTimers();
    try {
      const { mod, openaiDirectMocks } = await loadModuleWithMocks({ rawEnabled: false });

      openaiDirectMocks.generateOpenAIResponse.mockImplementation(async () => {
        return await new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              type: 'text',
              content: 'completed-after-warning',
              assistantMessage: { role: 'assistant', content: 'completed-after-warning' },
            });
          }, 500000);
        });
      });

      const world = buildWorld();
      const agent = buildAgent();
      const messages = [
        { role: 'user', content: 'hello', sender: 'human', createdAt: new Date() },
      ] as any;

      const pending = mod.generateAgentResponse(world, agent, messages, undefined, false, 'chat-1');
      await vi.advanceTimersByTimeAsync(450000);
      expect(world.eventEmitter.emit).toHaveBeenCalledWith(
        'system',
        expect.objectContaining({
          chatId: 'chat-1',
          content: expect.stringContaining('taking too long'),
        }),
      );

      await vi.advanceTimersByTimeAsync(50000);
      await expect(pending).resolves.toMatchObject({
        response: expect.objectContaining({
          type: 'text',
          content: 'completed-after-warning',
        }),
      });
      expect(world.eventEmitter.emit).not.toHaveBeenCalledWith(
        'system',
        expect.objectContaining({
          chatId: 'chat-1',
          content: expect.stringContaining('timed out'),
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('applies warning/timeout status parity for streaming LLM calls', async () => {
    vi.useFakeTimers();
    try {
      const { mod, openaiDirectMocks } = await loadModuleWithMocks({ rawEnabled: false });
      let capturedAbortSignal: AbortSignal | undefined;

      openaiDirectMocks.streamOpenAIResponse.mockImplementation(async (...args: any[]) => {
        capturedAbortSignal = args[8];
        return await new Promise(() => { });
      });

      const world = buildWorld();
      const agent = buildAgent();
      const messages = [
        { role: 'user', content: 'hello', sender: 'human', createdAt: new Date() },
      ] as any;
      const publishSSE = vi.fn();

      const pending = mod.streamAgentResponse(world, agent, messages, publishSSE, 'chat-1');
      const observedError = pending.then(
        () => null,
        (error) => error as Error,
      );

      await vi.advanceTimersByTimeAsync(450000);
      expect(world.eventEmitter.emit).toHaveBeenCalledWith(
        'system',
        expect.objectContaining({
          chatId: 'chat-1',
          content: expect.stringContaining('taking too long'),
        }),
      );

      await vi.advanceTimersByTimeAsync(450000);
      const timeoutError = await observedError;
      expect(timeoutError).toBeInstanceOf(Error);
      expect(timeoutError?.message).toContain('LLM call timeout after 900000ms');
      expect(capturedAbortSignal?.aborted).toBe(true);

      expect(world.eventEmitter.emit).toHaveBeenCalledWith(
        'system',
        expect.objectContaining({
          chatId: 'chat-1',
          content: expect.stringContaining('timed out'),
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
