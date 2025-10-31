/**
 * Logger Module - High-Performance Cross-Platform Logging with Pino
 *
 * Features:
 * - High-performance structured logging powered by Pino
 * - Pretty-printing in development with pino-pretty
 * - JSON structured output in production for log aggregation
 * - Hierarchical category-specific loggers with independent levels
 * - Auto-initialization with environment variables on module load
 * - Configuration-driven setup with level filtering
 * - Environment variable support for per-category log levels (e.g., LOG_CORE_DB=debug)
 * - Backward compatible API with previous console-based logger
 *
 * Categories: Dot-separated hierarchies (e.g., "core.db", "api.handler.users")
 * Usage: Auto-initialized on import → createCategoryLogger(category, bindings?)
 *
 * Environment Variable Support:
 *   - Set per-category log level with LOG_{CATEGORY} (e.g., LOG_CORE_DB=debug)
 *   - Category name normalization: dots preserved for hierarchy, other non-alphanumeric characters become dots
 *   - Hierarchical resolution: most-specific match wins (e.g., LOG_CORE_DB > LOG_CORE > LOG_LEVEL)
 *   - Any LOG_{CATEGORY} variable is supported dynamically (no fixed list)
 *   - These override global LOG_LEVEL and config.categoryLevels
 *   - LOG_LEVEL sets the global default if no category override is present
 *
 * Auto-Initialization:
 *   - Logger automatically scans environment variables when module is imported
 *   - No manual initialization required for basic usage
 *   - initializeLogger() can still be used to override settings
 *
 * Implementation: Pino-based structured logging with performance optimizations
 * - Development: Pretty-printed colored output via pino-pretty
 * - Production: JSON structured logs for log aggregation systems
 */

// Load environment variables from .env file
import dotenv from 'dotenv';
import pino from 'pino';
dotenv.config({ quiet: true });

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  trace: 10, debug: 20, info: 30, warn: 40, error: 50
};

function shouldLog(messageLevel: LogLevel, currentLevel: LogLevel): boolean {
  return LOG_LEVELS[messageLevel] >= LOG_LEVELS[currentLevel];
}

// Normalize category keys for consistent lookup across environment variables and function calls
// Preserves dots for hierarchy, converts other non-alphanumeric characters to dots
function normalizeCategoryKey(raw: string): string {
  if (!raw) return '';
  if (raw === 'default') return 'default';

  return raw
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '.')  // Replace any non-alphanumeric (except dots) with dots
    .replace(/\.+/g, '.')          // Collapse multiple dots into single dot
    .replace(/^\.|\.$/g, '');      // Trim leading/trailing dots
}

// Pino logger configuration
const pinoOptions: pino.LoggerOptions = {
  level: 'trace', // Set to trace to let our wrapper handle filtering
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(typeof process !== 'undefined' && process.env.NODE_ENV !== 'production' ? {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        ignore: 'pid,hostname',
        translateTime: 'SYS:standard',
      },
    },
  } : {}),
};

const pinoLogger = pino(pinoOptions);

// Get effective log level for a category using hierarchical resolution
// Walks from most-specific to least-specific, checking environment variables
// e.g., for "core.db.connection": LOG_CORE_DB_CONNECTION > LOG_CORE_DB > LOG_CORE > LOG_LEVEL
function getEffectiveLevelForCategory(category: string): LogLevel {
  const normalizedCategory = normalizeCategoryKey(category);
  if (!normalizedCategory) return globalLevel;

  // Check for exact match first
  if (categoryLevels[normalizedCategory]) {
    return categoryLevels[normalizedCategory];
  }

  // Walk hierarchy from most-specific to least-specific
  const parts = normalizedCategory.split('.');
  for (let i = parts.length - 1; i > 0; i--) {
    const parentCategory = parts.slice(0, i).join('.');
    if (categoryLevels[parentCategory]) {
      return categoryLevels[parentCategory];
    }
  }

  // Fall back to global level
  return globalLevel;
}

// Logger interface
export interface Logger {
  trace: (msg: any, ...args: any[]) => void;
  debug: (msg: any, ...args: any[]) => void;
  info: (msg: any, ...args: any[]) => void;
  warn: (msg: any, ...args: any[]) => void;
  error: (msg: any, ...args: any[]) => void;
  child: (bindings: Record<string, any>) => Logger;
  level: LogLevel;
}

// Pino-based logger implementation with log streaming support
function createSimpleLogger(category?: string, level: LogLevel = 'error', bindings?: Record<string, any>): Logger {
  const childBindings = { ...(category ? { category: category.toUpperCase() } : {}), ...bindings };
  const childLogger = Object.keys(childBindings).length > 0 ? pinoLogger.child(childBindings) : pinoLogger;

  return {
    trace: (msg: any, ...args: any[]) => {
      if (shouldLog('trace', level)) {
        if (args.length > 0) {
          childLogger.trace({ args }, msg);
        } else {
          childLogger.trace(msg);
        }
        // Emit log event for streaming
        if (category) {
          emitLogEvent('trace', category, msg, args.length > 0 ? args[0] : undefined);
        }
      }
    },
    debug: (msg: any, ...args: any[]) => {
      if (shouldLog('debug', level)) {
        if (args.length > 0) {
          childLogger.debug({ args }, msg);
        } else {
          childLogger.debug(msg);
        }
        // Emit log event for streaming
        if (category) {
          emitLogEvent('debug', category, msg, args.length > 0 ? args[0] : undefined);
        }
      }
    },
    info: (msg: any, ...args: any[]) => {
      if (shouldLog('info', level)) {
        if (args.length > 0) {
          childLogger.info({ args }, msg);
        } else {
          childLogger.info(msg);
        }
        // Emit log event for streaming
        if (category) {
          emitLogEvent('info', category, msg, args.length > 0 ? args[0] : undefined);
        }
      }
    },
    warn: (msg: any, ...args: any[]) => {
      if (shouldLog('warn', level)) {
        if (args.length > 0) {
          childLogger.warn({ args }, msg);
        } else {
          childLogger.warn(msg);
        }
        // Emit log event for streaming
        if (category) {
          emitLogEvent('warn', category, msg, args.length > 0 ? args[0] : undefined);
        }
      }
    },
    error: (msg: any, ...args: any[]) => {
      if (shouldLog('error', level)) {
        if (args.length > 0) {
          childLogger.error({ args }, msg);
        } else {
          childLogger.error(msg);
        }
        // Emit log event for streaming
        if (category) {
          emitLogEvent('error', category, msg, args.length > 0 ? args[0] : undefined);
        }
      }
    },
    child: (childBindings: Record<string, any>) => {
      // Create a new logger with merged bindings
      return createSimpleLogger(category, level, { ...bindings, ...childBindings });
    },
    level
  };
}

// Global state
let globalLevel: LogLevel = 'error';
const categoryLevels: Record<string, LogLevel> = {};
const categoryLoggers: Record<string, Logger> = {};

// Auto-initialize logger with environment variables when module loads
function autoInitializeLogger(): void {
  // Set global level from environment
  const envGlobalLevel = (typeof process !== 'undefined' && process.env && process.env.LOG_LEVEL) ? process.env.LOG_LEVEL.toLowerCase() : undefined;
  globalLevel = (envGlobalLevel && LOG_LEVELS[envGlobalLevel as LogLevel]) ? envGlobalLevel as LogLevel : 'error';

  // Dynamically scan environment for LOG_{CATEGORY} variables
  // Convert underscores to dots for hierarchy (e.g., LOG_CORE_DB -> core.db)
  if (typeof process !== 'undefined' && process.env) {
    const env = process.env;
    Object.keys(env).forEach(key => {
      if (key.startsWith('LOG_') && key !== 'LOG_LEVEL') {
        // Convert LOG_CORE_DB to core.db (underscores to dots for hierarchy)
        const categoryRaw = key.slice(4).toLowerCase().replace(/_/g, '.');
        const cat = normalizeCategoryKey(categoryRaw);
        const val = env[key];
        if (val && LOG_LEVELS[val.toLowerCase() as LogLevel]) {
          categoryLevels[cat] = val.toLowerCase() as LogLevel;
        }
      }
    });
  }
}

// Auto-initialize when module loads
autoInitializeLogger();

// Add startup diagnostic logging (only when not in production)
if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
  if (Object.keys(categoryLevels).length > 0) {
    console.info(`[LOGGER] Category levels:`, Object.keys(categoryLevels).sort());
  }
}

// Log streaming callback management
const logStreamCallbacks = new Set<(logEvent: import('./subscription.js').LogStreamEvent) => void>();

export function addLogStreamCallback(callback: (logEvent: import('./subscription.js').LogStreamEvent) => void): () => void {
  logStreamCallbacks.add(callback);
  return () => logStreamCallbacks.delete(callback);
}

// Check if a log event should be streamed based on configuration
function shouldStreamLogEvent(level: LogLevel, category: string): boolean {
  // Always stream all logs when there are callbacks - no configuration checks
  return logStreamCallbacks.size > 0;
}

// Emit log event to all registered callbacks
function emitLogEvent(level: LogLevel, category: string, message: string, data?: any): void {
  if (!shouldStreamLogEvent(level, category)) {
    return;
  }

  const logEvent: import('./subscription.js').LogStreamEvent = {
    level,
    category,
    message: typeof message === 'string' ? message : JSON.stringify(message),
    timestamp: new Date().toISOString(),
    data,
    messageId: `log-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  };

  logStreamCallbacks.forEach(callback => {
    try {
      callback(logEvent);
    } catch (error) {
      // Prevent log streaming errors from breaking the logger
      console.error('Log streaming callback error:', error);
    }
  });
}

export interface LoggerConfig {
  globalLevel?: LogLevel;
  categoryLevels?: Record<string, LogLevel>;
}

// Simple synchronous logger initialization
export function initializeLogger(config: LoggerConfig = {}): void {
  // Override global level if provided in config
  if (config.globalLevel) {
    globalLevel = config.globalLevel;
  }

  // Override category levels if provided in config
  if (config.categoryLevels) {
    Object.assign(categoryLevels, config.categoryLevels);
  }

  // Re-scan environment variables to ensure they take precedence
  // Convert underscores to dots for hierarchy (e.g., LOG_CORE_DB -> core.db)
  if (typeof process !== 'undefined' && process.env) {
    const env = process.env;
    Object.keys(env).forEach(key => {
      if (key.startsWith('LOG_') && key !== 'LOG_LEVEL') {
        // Convert LOG_CORE_DB to core.db (underscores to dots for hierarchy)
        const categoryRaw = key.slice(4).toLowerCase().replace(/_/g, '.');
        const cat = normalizeCategoryKey(categoryRaw);
        const val = env[key];
        if (val && LOG_LEVELS[val.toLowerCase() as LogLevel]) {
          categoryLevels[cat] = val.toLowerCase() as LogLevel;
        }
      }
    });
  }

  // Migrate existing categoryLoggers to normalized keys
  const existingLoggers = { ...categoryLoggers };
  Object.keys(existingLoggers).forEach(oldKey => {
    const normalizedKey = normalizeCategoryKey(oldKey);
    if (normalizedKey !== oldKey && !categoryLoggers[normalizedKey]) {
      // Move logger to normalized key
      categoryLoggers[normalizedKey] = existingLoggers[oldKey];
      delete categoryLoggers[oldKey];
    }
  });

  // Update existing category loggers
  Object.keys(categoryLoggers).forEach(category => {
    const level = getEffectiveLevelForCategory(category);
    categoryLoggers[category] = createSimpleLogger(category, level);
  });
}

// Category logger management
export function createCategoryLogger(category: string, bindings?: Record<string, any>): Logger {
  const normalizedCategory = normalizeCategoryKey(category);

  // Check if we already have a cached logger for this exact category (without additional bindings)
  if (!bindings && categoryLoggers[normalizedCategory]) {
    return categoryLoggers[normalizedCategory];
  }

  // Use hierarchical resolution to get the effective level
  const level = getEffectiveLevelForCategory(normalizedCategory);
  const logger = createSimpleLogger(normalizedCategory, level, bindings);

  // Only cache loggers without additional bindings
  if (!bindings) {
    categoryLoggers[normalizedCategory] = logger;
  }

  return logger;
}

export function getCategoryLogLevel(category: string): LogLevel {
  return getEffectiveLevelForCategory(category);
}

export function shouldLogForCategory(messageLevel: LogLevel, category: string): boolean {
  return shouldLog(messageLevel, getCategoryLogLevel(category));
}

// Default logger instance
export const logger = createSimpleLogger();

// Pre-created category loggers for common use cases
export const loggers = {
  core: createCategoryLogger('core'),
  'core.db': createCategoryLogger('core.db'),
  api: createCategoryLogger('api'),
  llm: createCategoryLogger('llm'),
  events: createCategoryLogger('events'),
  ws: createCategoryLogger('ws'),
  storage: createCategoryLogger('storage'),
  server: createCategoryLogger('server'),
  cli: createCategoryLogger('cli'),
};

export default logger;
