/**
 * Reliability Config
 *
 * Purpose:
 * - Centralize timeout, retry, and backoff configuration used by runtime reliability boundaries.
 *
 * Key features:
 * - Shared defaults for MCP, queue dispatch, shell, web fetch, LLM queue, and storage retries.
 * - Environment-aware parsing helpers with deterministic fallback behavior.
 * - Boundary-specific helpers where runtime reads must remain dynamic (for example shell kill grace).
 *
 * Implementation notes:
 * - Keep parsing semantics aligned with existing boundary behavior to avoid drift.
 * - Export plain objects/functions only (no class/stateful runtime dependencies).
 *
 * Recent changes:
 * - 2026-03-05: Initial extraction of reliability timeout/retry constants and env parsing helpers.
 */

type EnvSource = NodeJS.ProcessEnv;

function parseInteger(value: string | undefined): number | null {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePositiveIntOrDefault(value: string | undefined, fallback: number): number {
  const parsed = parseInteger(value);
  if (parsed == null || parsed <= 0) return fallback;
  return parsed;
}

function parseMinIntOrDefault(value: string | undefined, fallback: number, minInclusive: number): number {
  const parsed = parseInteger(value);
  if (parsed == null || parsed < minInclusive) return fallback;
  return parsed;
}

function resolveMCPConfig(env: EnvSource) {
  const discoveryTimeoutMs = parsePositiveIntOrDefault(
    env.AGENT_WORLD_MCP_DISCOVERY_TIMEOUT_MS,
    5000,
  );
  const executionMaxAttempts = parseMinIntOrDefault(
    env.AGENT_WORLD_MCP_EXECUTION_MAX_ATTEMPTS,
    2,
    1,
  );
  const executionRetryBaseDelayMs = parseMinIntOrDefault(
    env.AGENT_WORLD_MCP_EXECUTION_RETRY_BASE_DELAY_MS,
    1000,
    0,
  );

  return {
    discoveryTimeoutMs,
    executionMaxAttempts,
    executionRetryBaseDelayMs,
  } as const;
}

function resolveQueueConfig(env: EnvSource) {
  const configured = parseInteger(env.AGENT_WORLD_QUEUE_NO_RESPONSE_FALLBACK_MS);
  const noResponseFallbackMs = configured == null || configured <= 0
    ? 5000
    : Math.max(configured, 1000);

  return {
    noResponseFallbackMs,
    maxRetryAttempts: 3,
    retryBaseDelayMs: 1000,
  } as const;
}

function resolveShellConfig(env: EnvSource) {
  const timeoutKillGraceMs = parseMinIntOrDefault(
    env.AGENT_WORLD_SHELL_TIMEOUT_KILL_GRACE_MS,
    2000,
    0,
  );

  return {
    timeoutKillGraceMs,
  } as const;
}

function resolveStorageConfig(env: EnvSource) {
  const sqliteBusyTimeoutMs = parseInteger(env.AGENT_WORLD_SQLITE_TIMEOUT) ?? 30000;

  return {
    agentLoadRetries: 2,
    agentLoadRetryDelayMs: 75,
    sqliteBusyTimeoutMs,
  } as const;
}

function resolveLLMConfig() {
  return {
    processingTimeoutMs: 900000,
    warningThresholdRatio: 0.5,
    minProcessingTimeoutMs: 1000,
  } as const;
}

function resolveWebFetchConfig() {
  return {
    defaultTimeoutMs: 12000,
    maxTimeoutMs: 30000,
    minTimeoutMs: 1000,
    defaultMaxChars: 24000,
    maxMaxChars: 120000,
  } as const;
}

export function getReliabilityConfig(env: EnvSource = process.env) {
  return {
    mcp: resolveMCPConfig(env),
    queue: resolveQueueConfig(env),
    shell: resolveShellConfig(env),
    storage: resolveStorageConfig(env),
    llm: resolveLLMConfig(),
    webFetch: resolveWebFetchConfig(),
  } as const;
}

const DEFAULT_CONFIG = getReliabilityConfig();

export const RELIABILITY_CONFIG = {
  mcp: DEFAULT_CONFIG.mcp,
  queue: DEFAULT_CONFIG.queue,
  storage: DEFAULT_CONFIG.storage,
  llm: DEFAULT_CONFIG.llm,
  webFetch: DEFAULT_CONFIG.webFetch,
} as const;

export function getShellTimeoutKillGraceMs(): number {
  return resolveShellConfig(process.env).timeoutKillGraceMs;
}
