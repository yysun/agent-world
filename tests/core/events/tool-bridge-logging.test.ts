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
  trace: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  initializeLogger: ReturnType<typeof vi.fn>;
};

async function loadModuleWithLoggerSpies() {
  vi.resetModules();

  const spies: LoggerSpies = {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    initializeLogger: vi.fn(),
  };

  vi.doMock('../../../core/logger.js', () => ({
    initializeLogger: spies.initializeLogger,
    createCategoryLogger: vi.fn(() => ({
      trace: spies.trace,
      debug: spies.debug,
      info: spies.info,
      warn: spies.warn,
      error: spies.error,
    })),
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
    expect(spies.debug).toHaveBeenCalledTimes(1);
    const payload = spies.debug.mock.calls[0][1];
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

    expect(spies.info).toHaveBeenCalledTimes(1);
    const payload = spies.info.mock.calls[0][1];
    expect(payload.direction).toBe('TOOLS->LLM');
    expect(String(payload.payload)).toContain('...[50 more]');
  });

  it('routes to warn and error levels when explicitly configured', async () => {
    process.env.LOG_LLM_TOOL_BRIDGE = 'warn';
    let loaded = await loadModuleWithLoggerSpies();
    loaded.mod.logToolBridge('bridge', { type: 'event' });
    expect(loaded.spies.warn).toHaveBeenCalledTimes(1);

    process.env.LOG_LLM_TOOL_BRIDGE = 'error';
    loaded = await loadModuleWithLoggerSpies();
    loaded.mod.logToolBridge('bridge', { type: 'event' });
    expect(loaded.spies.error).toHaveBeenCalledTimes(1);
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
