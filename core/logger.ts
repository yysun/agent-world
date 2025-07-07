/**
 * Simple Logger Module - Zero-Dependency Cross-Platform Logging
 *
 * Features:
 * - Pure console-based logging (Node.js/browser compatible)
 * - Category-specific loggers with independent levels
 * - Configuration-driven setup with level filtering
 * - Zero external dependencies
 *
 * Categories: ws, cli, core, storage, llm, events, api, server
 * Usage: initializeLogger(config) → createCategoryLogger(category)
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
  globalLevel = config.globalLevel || 'error';

  if (config.categoryLevels) {
    Object.assign(categoryLevels, config.categoryLevels);
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
