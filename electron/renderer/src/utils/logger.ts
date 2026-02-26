/**
 * Renderer Logging Utility
 * Purpose:
 * - Provide categorized, env-configurable logging for Electron renderer modules.
 *
 * Key Features:
 * - Category + level filtering with hierarchical category matching.
 * - Renderer-safe initialization via preload-bridged logging config.
 * - Structured log payload output with basic sensitive-field redaction.
 *
 * Implementation Notes:
 * - Does not access `process.env` directly; config is fetched from main via desktop bridge.
 * - Defaults to verbose logging in dev builds until bridge config is loaded.
 *
 * Recent Changes:
 * - 2026-02-26: Added initial renderer logging adapter for env-controlled categorized logs.
 */

import type { DesktopApi, LogLevel, RendererLoggingConfig } from '../types/desktop-api';

const LOG_LEVEL_VALUES: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50
};

const VALID_LOG_LEVELS = new Set<LogLevel>(['trace', 'debug', 'info', 'warn', 'error']);
const REDACT_KEY_PATTERN = /(token|password|secret|api[_-]?key|authorization|cookie)/i;

const DEFAULT_RENDERER_LOGGING_CONFIG: RendererLoggingConfig = {
  globalLevel: 'error',
  categoryLevels: {},
  nodeEnv: 'unknown'
};

let currentLoggingConfig: RendererLoggingConfig = DEFAULT_RENDERER_LOGGING_CONFIG;
let loggerInitialized = false;
let initializePromise: Promise<void> | null = null;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeCategoryKey(raw: string): string {
  if (!raw) return '';
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '.')
    .replace(/\.+/g, '.')
    .replace(/^\.|\.$/g, '');
}

function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === 'string' && VALID_LOG_LEVELS.has(value as LogLevel);
}

function sanitizeLogData(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (depth >= 4) return '[MaxDepth]';
  if (value == null) return value;
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message
    };
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    return value.map((entry) => sanitizeLogData(entry, depth + 1, seen));
  }
  if (!isPlainObject(value)) return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  const next: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (REDACT_KEY_PATTERN.test(key)) {
      next[key] = '[REDACTED]';
      continue;
    }
    next[key] = sanitizeLogData(entry, depth + 1, seen);
  }
  return next;
}

function normalizeLoggingConfig(config: RendererLoggingConfig): RendererLoggingConfig {
  const globalLevel = isLogLevel(config?.globalLevel) ? config.globalLevel : DEFAULT_RENDERER_LOGGING_CONFIG.globalLevel;
  const categoryLevels: Record<string, LogLevel> = {};
  const categoryEntries = isPlainObject(config?.categoryLevels) ? Object.entries(config.categoryLevels) : [];
  for (const [key, level] of categoryEntries) {
    if (!isLogLevel(level)) continue;
    const normalizedKey = normalizeCategoryKey(String(key));
    if (!normalizedKey) continue;
    categoryLevels[normalizedKey] = level;
  }

  const nodeEnv = typeof config?.nodeEnv === 'string' && config.nodeEnv.trim().length > 0
    ? config.nodeEnv.trim()
    : DEFAULT_RENDERER_LOGGING_CONFIG.nodeEnv;

  return {
    globalLevel,
    categoryLevels,
    nodeEnv
  };
}

function resolveCategoryLogLevel(category: string): LogLevel {
  const normalized = normalizeCategoryKey(category);
  if (!normalized) return currentLoggingConfig.globalLevel;

  if (currentLoggingConfig.categoryLevels[normalized]) {
    return currentLoggingConfig.categoryLevels[normalized] as LogLevel;
  }

  const parts = normalized.split('.');
  for (let i = parts.length - 1; i > 0; i -= 1) {
    const parent = parts.slice(0, i).join('.');
    if (currentLoggingConfig.categoryLevels[parent]) {
      return currentLoggingConfig.categoryLevels[parent] as LogLevel;
    }
  }

  return currentLoggingConfig.globalLevel;
}

function shouldLog(level: LogLevel, category: string): boolean {
  return LOG_LEVEL_VALUES[level] >= LOG_LEVEL_VALUES[resolveCategoryLogLevel(category)];
}

function emitRendererLog(level: LogLevel, category: string, message: string, data?: unknown): void {
  const normalizedCategory = normalizeCategoryKey(category);
  if (!shouldLog(level, normalizedCategory)) return;

  const label = `[${level.toUpperCase()}] ${normalizedCategory || 'renderer'}`;
  const payload = {
    process: 'renderer',
    category: normalizedCategory,
    message,
    data: data === undefined ? undefined : sanitizeLogData(data)
  };

  if (level === 'error') {
    console.error(label, payload);
    return;
  }
  if (level === 'warn') {
    console.warn(label, payload);
    return;
  }
  if (level === 'info') {
    console.info(label, payload);
    return;
  }
  console.debug(label, payload);
}

export async function initializeRendererLogger(api: DesktopApi): Promise<void> {
  if (loggerInitialized) return;
  if (initializePromise) {
    await initializePromise;
    return;
  }

  initializePromise = (async () => {
    try {
      if (typeof api.getLoggingConfig !== 'function') {
        return;
      }
      const config = await api.getLoggingConfig();
      if (isPlainObject(config)) {
        currentLoggingConfig = normalizeLoggingConfig(config as RendererLoggingConfig);
      }
    } catch (error) {
      console.warn('[renderer.logger] Failed to load renderer logging config', {
        message: error instanceof Error ? error.message : String(error)
      });
    } finally {
      loggerInitialized = true;
    }
  })();

  await initializePromise;
}

export const rendererLogger = {
  trace: (category: string, message: string, data?: unknown) => emitRendererLog('trace', category, message, data),
  debug: (category: string, message: string, data?: unknown) => emitRendererLog('debug', category, message, data),
  info: (category: string, message: string, data?: unknown) => emitRendererLog('info', category, message, data),
  warn: (category: string, message: string, data?: unknown) => emitRendererLog('warn', category, message, data),
  error: (category: string, message: string, data?: unknown) => emitRendererLog('error', category, message, data)
};
