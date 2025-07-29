/**
 * Simple Logger Module - Zero-Dependency Cross-Platform Logging
 *
 * Features:
 * - Pure console-based logging (Node.js/browser compatible)
 * - Category-specific loggers with independent levels
 * - Configuration-driven setup with level filtering
 * - Zero external dependencies
 * - Environment variable support for per-category log levels (e.g., LOG_EVENTS=debug)
 *
 * Categories: ws, cli, core, storage, llm, events, api, server
 * Usage: initializeLogger(config) → createCategoryLogger(category)
 *
 * Environment Variable Support:
 *   - Set per-category log level with LOG_{CATEGORY} (e.g., LOG_EVENTS=debug)
 *   - Category name is case-insensitive, dashes and underscores are normalized (LOG_API, LOG_SERVER, LOG_my_custom)
 *   - Any LOG_{CATEGORY} variable is supported dynamically (no fixed list)
 *   - These override global LOG_LEVEL and config.categoryLevels
 *   - LOG_LEVEL sets the global default if no category override is present
 *
 * Implementation: Console methods with structured output formatting
 */

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  trace: 10, debug: 20, info: 30, warn: 40, error: 50
};

function shouldLog(messageLevel: LogLevel, currentLevel: LogLevel): boolean {
  return LOG_LEVELS[messageLevel] >= LOG_LEVELS[currentLevel];
}

// Logger interface
export interface Logger {
  trace: (msg: any, ...args: any[]) => void;
  debug: (msg: any, ...args: any[]) => void;
  info: (msg: any, ...args: any[]) => void;
  warn: (msg: any, ...args: any[]) => void;
  error: (msg: any, ...args: any[]) => void;
  level: LogLevel;
}

// Simple logger implementation
function createSimpleLogger(category?: string, level: LogLevel = 'error'): Logger {
  const prefix = category ? `[${category.toUpperCase()}]` : '[LOG]';

  return {
    trace: (msg: any, ...args: any[]) => {
      if (shouldLog('trace', level)) {
        console.log(`${prefix}[TRACE]`, msg, ...args);
      }
    },
    debug: (msg: any, ...args: any[]) => {
      if (shouldLog('debug', level)) {
        console.log(`${prefix}[DEBUG]`, msg, ...args);
      }
    },
    info: (msg: any, ...args: any[]) => {
      if (shouldLog('info', level)) {
        console.info(`${prefix}[INFO]`, msg, ...args);
      }
    },
    warn: (msg: any, ...args: any[]) => {
      if (shouldLog('warn', level)) {
        console.warn(`${prefix}[WARN]`, msg, ...args);
      }
    },
    error: (msg: any, ...args: any[]) => {
      if (shouldLog('error', level)) {
        console.error(`${prefix}[ERROR]`, msg, ...args);
      }
    },
    level
  };
}

// Global state
let globalLevel: LogLevel = 'error';
const categoryLevels: Record<string, LogLevel> = {};
const categoryLoggers: Record<string, Logger> = {};

export interface LoggerConfig {
  globalLevel?: LogLevel;
  categoryLevels?: Record<string, LogLevel>;
}

// Simple synchronous logger initialization
export function initializeLogger(config: LoggerConfig = {}): void {
  // Set global level from config or environment
  const envGlobalLevel = (typeof process !== 'undefined' && process.env && process.env.LOG_LEVEL) ? process.env.LOG_LEVEL.toLowerCase() : undefined;
  globalLevel = (envGlobalLevel && LOG_LEVELS[envGlobalLevel as LogLevel]) ? envGlobalLevel as LogLevel : (config.globalLevel || 'error');

  // Start with config-provided category levels
  if (config.categoryLevels) {
    Object.assign(categoryLevels, config.categoryLevels);
  }

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
