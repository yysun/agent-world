/*
 * Logger Utility - Centralized Logging with Pino
 * 
 * Features:
 * - Environment-based logging configuration
 * - Silent logging during unit tests
 * - Structured logging with contextual data
 * - Pretty printing in development
 * - Appropriate log levels for different scenarios
 * 
 * Logic:
 * - Uses pino for high-performance logging
 * - Configures different transports for dev/prod/test
 * - Silent mode during NODE_ENV=test or Jest execution
 * - Pretty formatting in development
 * - Structured JSON in production
 * 
 * Changes:
 * - Initial implementation of centralized pino logging
 */

import pino from 'pino';

// Determine environment
const isDevelopment = process.env.NODE_ENV === 'development';
const isTest = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
const isProduction = process.env.NODE_ENV === 'production';

// Base logger configuration
const baseConfig: pino.LoggerOptions = {
  name: 'dapr-world-backend',
  level: isTest ? 'silent' : isDevelopment ? 'debug' : 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
};

// Create logger with appropriate transport
const logger = pino(
  baseConfig,
  isTest
    ? undefined // No transport for tests (silent)
    : isDevelopment
      ? pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
          singleLine: false,
          hideObject: false,
          messageFormat: '{levelLabel} [{name}] {msg}',
          customLevels: 'debug:10,info:20,warn:30,error:40',
          customColors: 'debug:gray,info:cyan,warn:yellow,error:red',
        }
      })
      : process.stdout // JSON output for production
);

// Create child loggers for different modules
export const createLogger = (module: string) => {
  return logger.child({ module });
};

// Pre-configured loggers for common modules
export const agentLogger = createLogger('agent');
export const worldLogger = createLogger('world');
export const apiLogger = createLogger('api');
export const utilsLogger = createLogger('utils');
export const cliLogger = createLogger('cli');

// Default export
export default logger;

// Helper function to check if logging is enabled
export const isLoggingEnabled = () => !isTest;

// Log levels for structured logging
export const LogLevel = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error'
} as const;

export type LogLevel = typeof LogLevel[keyof typeof LogLevel];
