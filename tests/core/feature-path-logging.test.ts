/**
 * Feature-Path Logging Utility Tests
 *
 * Purpose:
 * - Validate redaction, raw-category gating, and aliased emission behavior for
 *   feature-path logging helpers.
 *
 * Key Features:
 * - Sensitive key redaction for nested structured payloads.
 * - Raw-category gating via category-level logger predicates.
 * - Canonical + alias category emission behavior.
 *
 * Implementation Notes:
 * - Mocks `core/logger` to keep tests deterministic and isolated from runtime config.
 * - Asserts production-path utility outputs without relying on console inspection.
 *
 * Recent Changes:
 * - 2026-02-28: Added targeted coverage for new feature-path logging helpers.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type EmittedCall = {
  category: string;
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error';
  message: unknown;
  data: unknown;
};

const emittedCalls: EmittedCall[] = [];
const shouldLogForCategoryMock = vi.fn(() => false);

vi.mock('../../core/logger.js', () => ({
  createCategoryLogger: (category: string) => ({
    trace: (message: unknown, data?: unknown) => emittedCalls.push({ category, level: 'trace', message, data }),
    debug: (message: unknown, data?: unknown) => emittedCalls.push({ category, level: 'debug', message, data }),
    info: (message: unknown, data?: unknown) => emittedCalls.push({ category, level: 'info', message, data }),
    warn: (message: unknown, data?: unknown) => emittedCalls.push({ category, level: 'warn', message, data }),
    error: (message: unknown, data?: unknown) => emittedCalls.push({ category, level: 'error', message, data }),
  }),
  shouldLogForCategory: shouldLogForCategoryMock,
}));

describe('feature-path-logging utilities', () => {
  beforeEach(() => {
    emittedCalls.length = 0;
    shouldLogForCategoryMock.mockReset();
    shouldLogForCategoryMock.mockReturnValue(false);
  });

  it('redacts nested sensitive fields and truncates long strings', async () => {
    const mod = await import('../../core/feature-path-logging.js');
    const payload = {
      apiKey: 'secret-key',
      nested: {
        password: 'secret-password',
        plain: 'ok',
      },
      text: 'x'.repeat(30),
    };

    const sanitized = mod.sanitizeRawPayloadForLog(payload, { maxStringLength: 12 }) as Record<string, unknown>;

    expect(sanitized.apiKey).toBe('[REDACTED]');
    expect((sanitized.nested as Record<string, unknown>).password).toBe('[REDACTED]');
    expect((sanitized.nested as Record<string, unknown>).plain).toBe('ok');
    expect(String(sanitized.text)).toContain('...[18 more]');
  });

  it('checks raw category gating through logger category filtering', async () => {
    const mod = await import('../../core/feature-path-logging.js');
    shouldLogForCategoryMock.mockReturnValueOnce(true);

    expect(mod.shouldEmitRawLog('llm.request.raw')).toBe(true);
    expect(shouldLogForCategoryMock).toHaveBeenCalledWith('debug', 'llm.request.raw');
  });

  it('emits canonical and alias categories for migration compatibility', async () => {
    const mod = await import('../../core/feature-path-logging.js');

    mod.emitAliasedCategoryLog(
      'info',
      'llm.prep',
      'Prepared messages for LLM request',
      { messageCount: 4 },
      ['llm.message-prep']
    );

    expect(emittedCalls).toHaveLength(2);
    expect(emittedCalls[0]).toMatchObject({
      category: 'llm.prep',
      level: 'info',
      message: 'Prepared messages for LLM request',
    });
    expect(emittedCalls[1]).toMatchObject({
      category: 'llm.message-prep',
      level: 'info',
      message: 'Prepared messages for LLM request',
    });
  });
});
