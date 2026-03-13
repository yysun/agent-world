/**
 * Direct Provider Abort Logging Tests
 *
 * Purpose:
 * - Verify streaming aborts are logged as cancellations instead of provider errors.
 *
 * Key Features:
 * - Covers Google, Anthropic, and OpenAI direct streaming adapters.
 * - Verifies AbortError paths emit info logs and suppress error logs.
 * - Uses fake provider clients and mocked loggers only.
 *
 * Implementation Notes:
 * - Direct provider modules are unmocked per test because vitest setup replaces them globally.
 * - Logger instances are captured per category so canonical and legacy categories can be asserted independently.
 *
 * Recent Changes:
 * - 2026-03-12: Added regression coverage for info-level abort logging in direct streaming providers.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type MockLogger = {
  trace: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  child: ReturnType<typeof vi.fn>;
  level: 'trace';
};

const loggerRegistry = vi.hoisted(() => {
  const loggers = new Map<string, MockLogger>();

  function createMockLogger(): MockLogger {
    const logger = {
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn(),
      level: 'trace' as const,
    };
    logger.child.mockReturnValue(logger);
    return logger;
  }

  function getLogger(category: string): MockLogger {
    if (!loggers.has(category)) {
      loggers.set(category, createMockLogger());
    }
    return loggers.get(category)!;
  }

  function reset(): void {
    loggers.clear();
  }

  return {
    getLogger,
    reset,
  };
});

vi.mock('../../../core/logger.js', () => ({
  createCategoryLogger: vi.fn((category: string) => loggerRegistry.getLogger(category)),
}));

function createAgent(provider: string, model: string): any {
  return {
    id: `${provider}-agent`,
    name: `${provider}-agent`,
    type: 'assistant',
    provider,
    model,
    temperature: 0.1,
    maxTokens: 256,
    llmCallCount: 0,
    memory: [],
  };
}

function createWorld(): any {
  return {
    id: 'world-1',
    name: 'world-1',
    turnLimit: 5,
    createdAt: new Date(),
    lastUpdated: new Date(),
    totalAgents: 0,
    totalMessages: 0,
    eventEmitter: {} as any,
    agents: new Map(),
    chats: new Map(),
  };
}

function getAbortError(): DOMException {
  return new DOMException('stream aborted by test', 'AbortError');
}

async function importGoogleDirect() {
  vi.doUnmock('../../../core/google-direct');
  vi.doUnmock('../../../core/google-direct.js');
  return await import('../../../core/google-direct.js');
}

async function importAnthropicDirect() {
  vi.doUnmock('../../../core/anthropic-direct');
  vi.doUnmock('../../../core/anthropic-direct.js');
  return await import('../../../core/anthropic-direct.js');
}

async function importOpenAIDirect() {
  vi.doUnmock('../../../core/openai-direct');
  vi.doUnmock('../../../core/openai-direct.js');
  return await import('../../../core/openai-direct.js');
}

describe('direct provider abort logging', () => {
  beforeEach(() => {
    vi.resetModules();
    loggerRegistry.reset();
  });

  it('logs Google streaming AbortError as info without error severity', async () => {
    const googleDirect = await importGoogleDirect();
    const abortError = getAbortError();
    const fakeClient = {
      getGenerativeModel: vi.fn().mockReturnValue({
        generateContentStream: vi.fn().mockResolvedValue({
          stream: (async function* () {
            throw abortError;
          })(),
        }),
      }),
    } as any;

    await expect(
      googleDirect.streamGoogleResponse(
        fakeClient,
        'gemini-2.5-flash',
        [{ role: 'user', content: 'hello' }],
        createAgent('google', 'gemini-2.5-flash'),
        {},
        createWorld(),
        vi.fn(),
        'message-1'
      )
    ).rejects.toBe(abortError);

    const googleLogger = loggerRegistry.getLogger('llm.google');
    expect(googleLogger.info).toHaveBeenCalledWith(
      'Google Direct: Streaming canceled for agent=google-agent',
      expect.objectContaining({ error: 'stream aborted by test' })
    );
    expect(googleLogger.error).not.toHaveBeenCalled();
  });

  it('logs Anthropic streaming AbortError as info without error severity', async () => {
    const anthropicDirect = await importAnthropicDirect();
    const abortError = getAbortError();
    const fakeClient = {
      messages: {
        create: vi.fn().mockResolvedValue((async function* () {
          throw abortError;
        })()),
      },
    } as any;

    await expect(
      anthropicDirect.streamAnthropicResponse(
        fakeClient,
        'claude-3-5-sonnet-latest',
        [{ role: 'user', content: 'hello' }],
        createAgent('anthropic', 'claude-3-5-sonnet-latest'),
        {},
        createWorld(),
        vi.fn(),
        'message-1'
      )
    ).rejects.toBe(abortError);

    const canonicalLogger = loggerRegistry.getLogger('llm.anthropic');
    const legacyLogger = loggerRegistry.getLogger('anthropic');
    expect(canonicalLogger.info).toHaveBeenCalledWith(
      'Anthropic Direct: Streaming canceled for agent=anthropic-agent',
      expect.objectContaining({ error: 'stream aborted by test' })
    );
    expect(legacyLogger.info).toHaveBeenCalledWith(
      'Anthropic Direct: Streaming canceled for agent=anthropic-agent',
      expect.objectContaining({ error: 'stream aborted by test' })
    );
    expect(canonicalLogger.error).not.toHaveBeenCalled();
    expect(legacyLogger.error).not.toHaveBeenCalled();
  });

  it('logs OpenAI streaming AbortError as info without error severity', async () => {
    const openaiDirect = await importOpenAIDirect();
    const abortError = getAbortError();
    const fakeClient = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue((async function* () {
            throw abortError;
          })()),
        },
      },
    } as any;

    await expect(
      openaiDirect.streamOpenAIResponse(
        fakeClient,
        'gpt-4o-mini',
        [{ role: 'user', content: 'hello' }],
        createAgent('openai', 'gpt-4o-mini'),
        {},
        createWorld(),
        vi.fn(),
        'message-1'
      )
    ).rejects.toBe(abortError);

    const canonicalLogger = loggerRegistry.getLogger('llm.openai');
    const legacyLogger = loggerRegistry.getLogger('openai');
    expect(canonicalLogger.info).toHaveBeenCalledWith(
      'OpenAI Direct: Streaming canceled for agent=openai-agent',
      expect.objectContaining({ error: 'stream aborted by test' })
    );
    expect(legacyLogger.info).toHaveBeenCalledWith(
      'OpenAI Direct: Streaming canceled for agent=openai-agent',
      expect.objectContaining({ error: 'stream aborted by test' })
    );
    expect(canonicalLogger.error).not.toHaveBeenCalled();
    expect(legacyLogger.error).not.toHaveBeenCalled();
  });
});