/**
 * Reliability Config Tests
 *
 * Purpose:
 * - Validate shared timeout/retry configuration defaults and environment parsing behavior.
 *
 * Key features:
 * - Ensures deterministic fallback values for invalid/missing env inputs.
 * - Verifies clamping and minimum-bound behavior for retry/timeout settings.
 * - Verifies dynamic shell timeout-grace reads from environment.
 *
 * Recent changes:
 * - 2026-03-05: Added initial coverage for centralized reliability config extraction.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { getReliabilityConfig, getShellTimeoutKillGraceMs } from '../../core/reliability-config.js';

describe('reliability-config', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns deterministic defaults when env overrides are missing', () => {
    const config = getReliabilityConfig({});

    expect(config.mcp).toMatchObject({
      discoveryTimeoutMs: 5000,
      executionMaxAttempts: 2,
      executionRetryBaseDelayMs: 1000,
    });
    expect(config.queue).toMatchObject({
      noResponseFallbackMs: 5000,
      maxRetryAttempts: 3,
      retryBaseDelayMs: 1000,
    });
    expect(config.storage).toMatchObject({
      agentLoadRetries: 2,
      agentLoadRetryDelayMs: 75,
      sqliteBusyTimeoutMs: 30000,
    });
    expect(config.llm).toMatchObject({
      processingTimeoutMs: 900000,
      warningThresholdRatio: 0.5,
      minProcessingTimeoutMs: 1000,
    });
    expect(config.webFetch).toMatchObject({
      defaultTimeoutMs: 12000,
      maxTimeoutMs: 30000,
      minTimeoutMs: 1000,
      defaultMaxChars: 24000,
      maxMaxChars: 120000,
    });
  });

  it('applies env overrides with existing clamp/fallback semantics', () => {
    const config = getReliabilityConfig({
      AGENT_WORLD_MCP_DISCOVERY_TIMEOUT_MS: '7000',
      AGENT_WORLD_MCP_EXECUTION_MAX_ATTEMPTS: '0',
      AGENT_WORLD_MCP_EXECUTION_RETRY_BASE_DELAY_MS: '-1',
      AGENT_WORLD_QUEUE_NO_RESPONSE_FALLBACK_MS: '10',
      AGENT_WORLD_SQLITE_TIMEOUT: '1234',
    });

    expect(config.mcp.discoveryTimeoutMs).toBe(7000);
    expect(config.mcp.executionMaxAttempts).toBe(2);
    expect(config.mcp.executionRetryBaseDelayMs).toBe(1000);
    expect(config.queue.noResponseFallbackMs).toBe(1000);
    expect(config.storage.sqliteBusyTimeoutMs).toBe(1234);
  });

  it('reads shell timeout kill grace dynamically from environment', () => {
    vi.stubEnv('AGENT_WORLD_SHELL_TIMEOUT_KILL_GRACE_MS', '120');
    expect(getShellTimeoutKillGraceMs()).toBe(120);

    vi.stubEnv('AGENT_WORLD_SHELL_TIMEOUT_KILL_GRACE_MS', '-1');
    expect(getShellTimeoutKillGraceMs()).toBe(2000);
  });
});
