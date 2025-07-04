/**
 * Centralized Logger Module - Standardized Logging Across Core
 *
 * Features:
 * - Centralized pino logger configuration for consistent logging
 * - Pretty printing for development environment
 * - Structured logging with appropriate log levels
 * - Environment-aware configuration
 *
 * Usage:
 * - Replace all console.log/warn/error calls with structured logging
 * - Consistent log format across all core modules
 * - Proper log level management
 *
 * Implementation:
 * - Uses pino for structured logging
 * - Configures pretty printing in development
 * - Exports singleton logger instance
 */

import pino from 'pino';

// Create centralized logger instance
const logger = pino({
  name: 'agent-world-core',
  level: process.env.LOG_LEVEL || 'debug',
  transport: process.env.NODE_ENV !== 'production' ? {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  } : undefined
});

export default logger;
export { logger };
