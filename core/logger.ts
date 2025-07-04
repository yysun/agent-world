/**
 * Centralized Logger Module - Standardized Logging Across Core
 *
 * Features:
 * - Centralized pino logger configuration for consistent logging
 * - Pretty printing for development environment
 * - Structured logging with appropriate log levels
 * - Client-controlled configuration (no environment variables)
 * - Category-based logging for granular control (ws, cli, core, etc.)
 *
 * Usage:
 * - Replace all console.log/warn/error calls with structured logging
 * - Consistent log format across all core modules
 * - Proper log level management controlled by clients
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
 * - Uses pino for structured logging
 * - Configures pretty printing in development
 * - Exports singleton logger instance
 * - Category loggers are child loggers with category-specific levels
 * - Provides functions for both global and category-specific log control
 */

import pino from 'pino';

// Create centralized logger instance with error as default
// No environment variable reading - controlled by clients
const logger = pino({
  name: 'agent-world-core',
  level: 'error', // Default to error level, clients can override
  transport: process.env.NODE_ENV !== 'production' ? {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  } : undefined
});

// Category log levels - defaults to same as main logger
const categoryLevels: Record<string, string> = {};

// Cache for category loggers
const categoryLoggers: Record<string, pino.Logger> = {};

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
