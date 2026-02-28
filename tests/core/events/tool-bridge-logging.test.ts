/**
 * Tool Bridge Logging Behavioral Tests
 *
 * Purpose:
 * - Validate environment-gated tool bridge logging behavior and payload shaping.
 *
 * Key features:
 * - LOG_LLM_TOOL_BRIDGE level resolution and enablement checks
 * - Structured payload extraction/truncation for bridge events
 * - Logger initialization and level-specific emission paths
 *
 * Implementation notes:
 * - Mocks core/logger to assert emitted log level and payload shape.
 * - Uses module reload per test to isolate environment and module state.
 *
 * Recent changes:
 * - 2026-02-27: Added targeted production-path coverage for core/events/tool-bridge-logging.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type LoggerSpies = {
  initializeLogger: ReturnType<typeof vi.fn>;
  calls: Array<{
    category: string;
    level: 'trace' | 'debug' | 'info' | 'warn' | 'error';
    message: unknown;
    data: unknown;
  }>;
};

async function loadModuleWithLoggerSpies() {
  vi.resetModules();

  const spies: LoggerSpies = {
    initializeLogger: vi.fn(),
    calls: [],
  };

  vi.doMock('../../../core/logger.js', () => ({
    initializeLogger: spies.initializeLogger,
    createCategoryLogger: vi.fn((category: string) => ({
      trace: (message: unknown, data?: unknown) => {
        spies.calls.push({ category, level: 'trace', message, data });
      },
      debug: (message: unknown, data?: unknown) => {
        spies.calls.push({ category, level: 'debug', message, data });
      },
      info: (message: unknown, data?: unknown) => {
        spies.calls.push({ category, level: 'info', message, data });
      },
      warn: (message: unknown, data?: unknown) => {
        spies.calls.push({ category, level: 'warn', message, data });
      },
      error: (message: unknown, data?: unknown) => {
        spies.calls.push({ category, level: 'error', message, data });
      },
    })),
    shouldLogForCategory: vi.fn(() => false),
  }));

  const mod = await import('../../../core/events/tool-bridge-logging.js');
  return { mod, spies };
}

describe('tool-bridge-logging behavior', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.LOG_LLM_TOOL_BRIDGE;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('is disabled by default and treats falsey env values as off', async () => {
    let loaded = await loadModuleWithLoggerSpies();
    expect(loaded.mod.isToolBridgeLoggingEnabled()).toBe(false);

    process.env.LOG_LLM_TOOL_BRIDGE = 'off';
    loaded = await loadModuleWithLoggerSpies();
    expect(loaded.mod.isToolBridgeLoggingEnabled()).toBe(false);

    process.env.LOG_LLM_TOOL_BRIDGE = 'false';
    loaded = await loadModuleWithLoggerSpies();
    expect(loaded.mod.isToolBridgeLoggingEnabled()).toBe(false);
  });

  it('enables logging for boolean aliases and emits debug records', async () => {
    process.env.LOG_LLM_TOOL_BRIDGE = 'true';
    const { mod, spies } = await loadModuleWithLoggerSpies();

    expect(mod.isToolBridgeLoggingEnabled()).toBe(true);
    mod.logToolBridge('LLM->TOOLS', {
      type: 'tool_call',
      toolName: 'list_files',
      toolCallId: 'call_abcdef123456',
      args: { path: '/tmp', recursive: true },
      content: 'x'.repeat(200),
      resultPreview: 'done',
    });

    expect(spies.initializeLogger).toHaveBeenCalledWith({
      categoryLevels: {
        'llm.tool.bridge': 'debug',
      },
    });
    const canonicalCall = spies.calls.find(call =>
      call.category === 'tool.call.request'
      && call.level === 'debug'
      && call.message === 'Tool path event'
    );
    expect(canonicalCall).toBeTruthy();

    const bridgeCall = spies.calls.find(call =>
      call.category === 'llm.tool.bridge'
      && call.level === 'debug'
      && call.message === 'LLM tool bridge event'
    );
    expect(bridgeCall).toBeTruthy();
    const payload = bridgeCall?.data as Record<string, unknown>;
    expect(payload.direction).toBe('LLM->TOOLS');
    expect(payload.type).toBe('tool_call');
    expect(payload.tool).toBe('list_files');
    expect(payload.id).toBe('call_abc');
    expect(String(payload.content)).toContain('...[100 more]');
  });

  it('emits raw payload previews for non-object payloads', async () => {
    process.env.LOG_LLM_TOOL_BRIDGE = 'info';
    const { mod, spies } = await loadModuleWithLoggerSpies();

    mod.logToolBridge('TOOLS->LLM', 'z'.repeat(350));

    const canonicalCall = spies.calls.find(call =>
      call.category === 'tool.call.response'
      && call.level === 'debug'
      && call.message === 'Tool path event'
    );
    expect(canonicalCall).toBeTruthy();

    const payload = spies.calls.find(call =>
      call.category === 'llm.tool.bridge'
      && call.level === 'info'
    )?.data as Record<string, unknown>;
    expect(payload).toBeTruthy();
    expect(payload.direction).toBe('TOOLS->LLM');
    expect(String(payload.payload)).toContain('...[50 more]');
  });

  it('routes to warn and error levels when explicitly configured', async () => {
    process.env.LOG_LLM_TOOL_BRIDGE = 'warn';
    let loaded = await loadModuleWithLoggerSpies();
    loaded.mod.logToolBridge('bridge', { type: 'event' });
    expect(loaded.spies.calls.some(call =>
      call.category === 'llm.tool.bridge' && call.level === 'warn'
    )).toBe(true);

    process.env.LOG_LLM_TOOL_BRIDGE = 'error';
    loaded = await loadModuleWithLoggerSpies();
    loaded.mod.logToolBridge('bridge', { type: 'event' });
    expect(loaded.spies.calls.some(call =>
      call.category === 'llm.tool.bridge' && call.level === 'error'
    )).toBe(true);
  });

  it('serializes circular values safely and truncates long previews', async () => {
    const { mod } = await loadModuleWithLoggerSpies();
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(mod.safeSerializeForConsole(circular)).toContain('[object Object]');
    const preview = mod.getToolResultPreview('a'.repeat(260));
    expect(preview).toContain('[truncated 60 chars]');
  });
});
