/**
 * Centralized Logger Module - Browser-Safe Logging Across Core
 *
 * Features:
 * - Browser-safe logger with dynamic pino loading
 * - Pretty printing for development environment (Node.js)
 * - Structured logging with appropriate log levels
 * - Client-controlled configuration (no environment variables)
 * - Category-based logging for granular control (ws, cli, core, etc.)
 * - Fallback console logging for browser environments
 *
 * Usage:
 * - Replace all console.log/warn/error calls with structured logging
 * - Consistent log format across all core modules
 * - Proper log level management controlled by clients
 * - Use initializeLogger() to setup environment-specific logger
 * - Use setLogLevel() to configure global log level
 * - Use setCategoryLogLevel() to control specific category levels
 * - Use createCategoryLogger() to get category-specific logger
 *
 * Categories:
 * - ws: WebSocket server logging
 * - cli: CLI application logging
 * - core: Core module logging
 * - storage: Storage operations logging
 * - llm: LLM interactions logging
 * - events: Event system logging
 *
 * Implementation:
 * - Uses pino for Node.js environments
 * - Uses pino/browser for browser environments
 * - Fallback console logger for initialization
 * - Dynamic loading prevents Node.js dependencies in browser
 * - Category loggers are child loggers with category-specific levels
 * - Provides functions for both global and category-specific log control
 */

import { isNodeEnvironment } from './utils.js';
import type * as pino from 'pino';

// Browser-safe fallback logger
const fallbackLogger = {
  trace: (msg: any, ...args: any[]) => console.log('[TRACE]', msg, ...args),
  debug: (msg: any, ...args: any[]) => console.log('[DEBUG]', msg, ...args),
  info: (msg: any, ...args: any[]) => console.info('[INFO]', msg, ...args),
  warn: (msg: any, ...args: any[]) => console.warn('[WARN]', msg, ...args),
  error: (msg: any, ...args: any[]) => console.error('[ERROR]', msg, ...args),
  level: 'error',
  child: (opts: any) => ({ ...fallbackLogger, ...opts })
} as pino.Logger;

// Start with fallback logger
let logger: pino.Logger = fallbackLogger;

// Category log levels - defaults to same as main logger
const categoryLevels: Record<string, string> = {};

// Cache for category loggers
const categoryLoggers: Record<string, pino.Logger> = {};

// Dynamic logger initialization
export async function initializeLogger(): Promise<void> {
  if (isNodeEnvironment()) {
    // Node.js environment - use pino with pretty printing
    const pino = await import('pino');
    logger = pino.default({
      name: 'agent-world-core',
      level: 'error',
      transport: process.env.NODE_ENV !== 'production' ? {
        target: 'pino-pretty',
        options: { colorize: true }
      } : undefined
    });
  } else {
    // Browser environment - use pino/browser
    try {
      const pinoBrowser = await import('pino/browser');
      logger = (pinoBrowser as any).default ? (pinoBrowser as any).default({
        name: 'agent-world-core',
        level: 'error'
      }) : (pinoBrowser as any)({
        name: 'agent-world-core',
        level: 'error'
      });
    } catch (error) {
      // Fallback to our fallback logger if pino/browser fails
      console.warn('Failed to load pino/browser, using fallback logger:', error);
      logger = fallbackLogger;
    }
  }

  // Update existing category loggers
  Object.keys(categoryLoggers).forEach(category => {
    const categoryLogger = logger.child({ category });
    if (categoryLevels[category]) {
      categoryLogger.level = categoryLevels[category];
    }
    categoryLoggers[category] = categoryLogger;
  });
}

// Function to set global log level
export function setLogLevel(level: 'trace' | 'debug' | 'info' | 'warn' | 'error'): void {
  logger.level = level;

  // Update existing category loggers if they don't have specific level set
  Object.keys(categoryLoggers).forEach(category => {
    if (!categoryLevels[category]) {
      categoryLoggers[category].level = level;
    }
  });
}

// Function to set log level for specific category
export function setCategoryLogLevel(category: string, level: 'trace' | 'debug' | 'info' | 'warn' | 'error'): void {
  categoryLevels[category] = level;

  // Update existing logger if it exists
  if (categoryLoggers[category]) {
    categoryLoggers[category].level = level;
  }
}

// Function to create category-specific logger
export function createCategoryLogger(category: string): pino.Logger {
  if (categoryLoggers[category]) {
    return categoryLoggers[category];
  }

  const categoryLogger = logger.child({ category });

  // Set specific level if configured, otherwise inherit from main logger
  if (categoryLevels[category]) {
    categoryLogger.level = categoryLevels[category];
  } else {
    categoryLogger.level = logger.level;
  }

  categoryLoggers[category] = categoryLogger;
  return categoryLogger;
}

// Function to get current category log level
export function getCategoryLogLevel(category: string): string {
  return categoryLevels[category] || logger.level;
}

export default logger;
export { logger };
