/**
 * Feature-Path Logging Utilities
 *
 * Purpose:
 * - Provide shared helpers for feature-path diagnostics across message prep,
 *   LLM request/response logging, and tool lifecycle tracing.
 *
 * Key Features:
 * - Canonical category helper for dual-category migration logging.
 * - Raw-payload log gating using existing per-category logger controls.
 * - Recursive sensitive-field redaction for structured payloads.
 * - Safe truncation of oversized string values to limit log bloat.
 *
 * Implementation Notes:
 * - Uses core logger category filtering (`shouldLogForCategory`) for gating.
 * - Redaction is key-name based and preserves object structure where possible.
 * - Circular object references are replaced with a stable marker.
 *
 * Recent Changes:
 * - 2026-02-28: Added shared feature-path logging helpers and redaction utilities.
 */

import { createCategoryLogger, shouldLogForCategory, type LogLevel } from './logger.js';

const SENSITIVE_KEY_PATTERN = /(key|token|secret|password|authorization|cookie|credential|session)/i;
const MAX_REDACTION_DEPTH = 8;
const DEFAULT_STRING_LIMIT = 4000;

type PlainRecord = Record<string, unknown>;

function isPlainRecord(value: unknown): value is PlainRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function redactRecursively(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
  maxStringLength: number
): unknown {
  if (value == null) {
    return value;
  }

  if (typeof value === 'string') {
    if (value.length <= maxStringLength) {
      return value;
    }
    return `${value.slice(0, maxStringLength)}...[${value.length - maxStringLength} more]`;
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (seen.has(value as object)) {
    return '[Circular]';
  }

  if (depth >= MAX_REDACTION_DEPTH) {
    return '[MaxDepth]';
  }

  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((entry) => redactRecursively(entry, depth + 1, seen, maxStringLength));
  }

  const result: PlainRecord = {};
  for (const [key, entry] of Object.entries(value as PlainRecord)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      result[key] = '[REDACTED]';
      continue;
    }
    result[key] = redactRecursively(entry, depth + 1, seen, maxStringLength);
  }
  return result;
}

/**
 * Redact sensitive values and truncate overlong strings in structured log payloads.
 */
export function sanitizeRawPayloadForLog(
  payload: unknown,
  options?: { maxStringLength?: number }
): unknown {
  const maxStringLength = options?.maxStringLength ?? DEFAULT_STRING_LIMIT;
  return redactRecursively(payload, 0, new WeakSet<object>(), maxStringLength);
}

/**
 * Returns true when a raw logging category is enabled for the given level.
 */
export function shouldEmitRawLog(
  category: 'llm.request.raw' | 'llm.response.raw',
  level: LogLevel = 'debug'
): boolean {
  return shouldLogForCategory(level, category);
}

/**
 * Emit to a canonical category and optional migration aliases.
 */
export function emitAliasedCategoryLog(
  level: LogLevel,
  canonicalCategory: string,
  message: string,
  data?: Record<string, unknown>,
  aliases: string[] = []
): void {
  const categories = [canonicalCategory, ...aliases];
  for (const category of categories) {
    const logger = createCategoryLogger(category);
    if (level === 'trace') {
      logger.trace(message, data);
    } else if (level === 'debug') {
      logger.debug(message, data);
    } else if (level === 'info') {
      logger.info(message, data);
    } else if (level === 'warn') {
      logger.warn(message, data);
    } else {
      logger.error(message, data);
    }
  }
}

/**
 * Build a standard correlation envelope for feature-path logs.
 */
export function buildFeaturePathCorrelation(
  values: {
    worldId?: string;
    chatId?: string | null;
    agentId?: string;
    messageId?: string;
    turnId?: string;
    runId?: string;
    toolCallId?: string;
    toolName?: string;
  }
): Record<string, unknown> {
  const correlation: Record<string, unknown> = {};
  if (values.worldId) correlation.worldId = values.worldId;
  if (values.chatId != null) correlation.chatId = values.chatId;
  if (values.agentId) correlation.agentId = values.agentId;
  if (values.messageId) correlation.messageId = values.messageId;
  if (values.turnId) correlation.turnId = values.turnId;
  if (values.runId) correlation.runId = values.runId;
  if (values.toolCallId) correlation.toolCallId = values.toolCallId;
  if (values.toolName) correlation.toolName = values.toolName;
  return correlation;
}

export function mergeFeaturePathData(
  correlation: Record<string, unknown>,
  data?: Record<string, unknown>
): Record<string, unknown> {
  if (!data) {
    return correlation;
  }
  if (!isPlainRecord(data)) {
    return correlation;
  }
  return { ...correlation, ...data };
}
