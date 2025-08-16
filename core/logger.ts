/**
 * Logger Module - High-Performance Cross-Platform Logging with Pino
 *
 * Features:
 * - High-performance structured logging powered by Pino
 * - Pretty-printing in development with pino-pretty
 * - JSON structured output in production for log aggregation
 * - Category-specific loggers with independent levels
 * - Auto-initialization with environment variables on module load
 * - Configuration-driven setup with level filtering
 * - Environment variable support for per-category log levels (e.g., LOG_EVENTS=debug)
 * - Backward compatible API with previous console-based logger
 *
 * Categories: ws, cli, core, storage, llm, events, api, server
 * Usage: Auto-initialized on import → createCategoryLogger(category)
 *
 * Environment Variable Support:
 *   - Set per-category log level with LOG_{CATEGORY} (e.g., LOG_EVENTS=debug)
 *   - Category name is case-insensitive, dashes and underscores are normalized (LOG_API, LOG_SERVER, LOG_my_custom)
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
dotenv.config();

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  trace: 10, debug: 20, info: 30, warn: 40, error: 50
};

function shouldLog(messageLevel: LogLevel, currentLevel: LogLevel): boolean {
  return LOG_LEVELS[messageLevel] >= LOG_LEVELS[currentLevel];
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

// Logger interface
export interface Logger {
  trace: (msg: any, ...args: any[]) => void;
  debug: (msg: any, ...args: any[]) => void;
  info: (msg: any, ...args: any[]) => void;
  warn: (msg: any, ...args: any[]) => void;
  error: (msg: any, ...args: any[]) => void;
  level: LogLevel;
}

// Pino-based logger implementation
function createSimpleLogger(category?: string, level: LogLevel = 'error'): Logger {
  const childLogger = category ? pinoLogger.child({ category: category.toUpperCase() }) : pinoLogger;

  return {
    trace: (msg: any, ...args: any[]) => {
      if (shouldLog('trace', level)) {
        if (args.length > 0) {
          childLogger.trace({ args }, msg);
        } else {
          childLogger.trace(msg);
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
      }
    },
    info: (msg: any, ...args: any[]) => {
      if (shouldLog('info', level)) {
        if (args.length > 0) {
          childLogger.info({ args }, msg);
        } else {
          childLogger.info(msg);
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
      }
    },
    error: (msg: any, ...args: any[]) => {
      if (shouldLog('error', level)) {
        if (args.length > 0) {
          childLogger.error({ args }, msg);
        } else {
          childLogger.error(msg);
        }
      }
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

  // Dynamically scan environment for LOG_{CATEGORY} variables (case-insensitive, dashes/underscores normalized)
  if (typeof process !== 'undefined' && process.env) {
    const env = process.env;
    Object.keys(env).forEach(key => {
      if (key.startsWith('LOG_') && key !== 'LOG_LEVEL') {
        // Normalize: LOG_{CATEGORY} => category (lowercase, underscores/dashes to dashes)
        const cat = key.slice(4).toLowerCase().replace(/[_]+/g, '-');
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
  if (typeof process !== 'undefined' && process.env) {
    const env = process.env;
    Object.keys(env).forEach(key => {
      if (key.startsWith('LOG_') && key !== 'LOG_LEVEL') {
        // Normalize: LOG_{CATEGORY} => category (lowercase, underscores/dashes to dashes)
        const cat = key.slice(4).toLowerCase().replace(/[_]+/g, '-');
        const val = env[key];
        if (val && LOG_LEVELS[val.toLowerCase() as LogLevel]) {
          categoryLevels[cat] = val.toLowerCase() as LogLevel;
        }
      }
    });
  }

  // Update existing category loggers
  Object.keys(categoryLoggers).forEach(category => {
    const level = categoryLevels[category] || globalLevel;
    categoryLoggers[category] = createSimpleLogger(category, level);
  });
}

// Category logger management
export function createCategoryLogger(category: string): Logger {
  if (categoryLoggers[category]) {
    return categoryLoggers[category];
  }

  const level = categoryLevels[category] || globalLevel;
  const logger = createSimpleLogger(category, level);
  categoryLoggers[category] = logger;
  return logger;
}

export function getCategoryLogLevel(category: string): LogLevel {
  return categoryLevels[category] || globalLevel;
}

export function shouldLogForCategory(messageLevel: LogLevel, category: string): boolean {
  return shouldLog(messageLevel, getCategoryLogLevel(category));
}

// Default logger instance
export const logger = createSimpleLogger();

export default logger;
