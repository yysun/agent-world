/**
 * Unit Tests for Electron Renderer Logger Utility
 *
 * Features:
 * - Verifies env-derived level/category gating behavior after initialization.
 * - Verifies sensitive-field redaction in structured log payloads.
 *
 * Implementation Notes:
 * - Uses dynamic module import with `vi.resetModules()` to isolate module-level logger state.
 * - Mocks preload bridge API surface with in-memory doubles (no filesystem/network).
 *
 * Recent Changes:
 * - 2026-02-27: Added coverage for renderer logger subscribe/unsubscribe behavior used by the logs panel.
 * - 2026-02-26: Added initial renderer logger gating/redaction coverage.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('renderer logger utility', () => {
  it('applies category overrides and redacts sensitive fields', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { initializeRendererLogger, rendererLogger } = await import('../../../electron/renderer/src/utils/logger');

    await initializeRendererLogger({
      getLoggingConfig: async () => ({
        globalLevel: 'warn',
        categoryLevels: {
          'electron.renderer.session': 'debug',
        },
        nodeEnv: 'test',
      }),
    } as any);

    rendererLogger.debug('electron.renderer.session', 'session-debug', {
      token: 'top-secret',
      nested: { apiKey: 'abc' },
    });
    rendererLogger.info('electron.renderer.messages', 'suppressed-info');
    rendererLogger.warn('electron.renderer.messages', 'allowed-warn');

    expect(debugSpy).toHaveBeenCalledTimes(1);
    const debugPayload = debugSpy.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(debugPayload).toMatchObject({
      process: 'renderer',
      category: 'electron.renderer.session',
      message: 'session-debug',
      data: {
        token: '[REDACTED]',
        nested: { apiKey: '[REDACTED]' },
      },
    });

    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('notifies subscribers for allowed logs and stops after unsubscribe', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);

    const { initializeRendererLogger, rendererLogger } = await import('../../../electron/renderer/src/utils/logger');
    await initializeRendererLogger({
      getLoggingConfig: async () => ({
        globalLevel: 'warn',
        categoryLevels: {
          'electron.renderer.panel': 'debug',
        },
        nodeEnv: 'test',
      }),
    } as any);

    const onLog = vi.fn();
    const unsubscribe = rendererLogger.subscribe(onLog);

    rendererLogger.debug('electron.renderer.panel', 'panel-debug', { traceId: 'abc' });
    rendererLogger.info('electron.renderer.messages', 'suppressed-info');
    unsubscribe();
    rendererLogger.debug('electron.renderer.panel', 'post-unsubscribe');

    expect(debugSpy).toHaveBeenCalledTimes(2);
    expect(onLog).toHaveBeenCalledTimes(1);
    expect(onLog.mock.calls[0]?.[0]).toMatchObject({
      process: 'renderer',
      level: 'debug',
      category: 'electron.renderer.panel',
      message: 'panel-debug',
      data: { traceId: 'abc' },
    });
  });
});
