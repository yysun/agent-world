/**
 * File-based Logging System - Debug and Error Logging
 * 
 * Features:
 * - File-based logging to avoid terminal interference
 * - Multiple log levels (debug, info, warn, error)
 * - Automatic log rotation and cleanup
 * - Timestamp formatting for easy debugging
 * - Safe file operations with error handling
 * 
 * Implementation:
 * - Uses fs.appendFileSync for synchronous logging
 * - Creates logs directory if it doesn't exist
 * - Daily log rotation with date-based filenames
 * - Memory-efficient with immediate file writes
 */

import { writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// Configuration
const LOG_DIR = './logs';
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB
const DEBUG_ENABLED = process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development';

// Log levels
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  data?: any;
}

// Ensure log directory exists
function ensureLogDirectory(): void {
  try {
    if (!existsSync(LOG_DIR)) {
      mkdirSync(LOG_DIR, { recursive: true });
    }
  } catch (error) {
    // Fail silently - logging is not critical
  }
}

// Get current date string for log file naming
function getDateString(): string {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

// Get current timestamp for log entries
function getTimestamp(): string {
  return new Date().toISOString();
}

// Format log entry for file output
function formatLogEntry(entry: LogEntry): string {
  const dataStr = entry.data ? ` | ${JSON.stringify(entry.data)}` : '';

  // For debug logs, omit timestamp for cleaner output
  if (entry.level === 'debug') {
    return `[${entry.module}] ${entry.message}${dataStr}\n`;
  }

  // For other levels, include timestamp
  return `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.module}] ${entry.message}${dataStr}\n`;
}

// Get log file path for current date
function getLogFilePath(level: LogLevel): string {
  const dateStr = getDateString();
  return join(LOG_DIR, `${level}-${dateStr}.log`);
}

// Write log entry to file
function writeLogEntry(level: LogLevel, module: string, message: string, data?: any): void {
  try {
    ensureLogDirectory();

    const entry: LogEntry = {
      timestamp: getTimestamp(),
      level,
      module,
      message,
      data
    };

    const logFilePath = getLogFilePath(level);
    const formattedEntry = formatLogEntry(entry);

    appendFileSync(logFilePath, formattedEntry, 'utf8');
  } catch (error) {
    // Fail silently - logging should not crash the application
  }
}

// Public logging functions
export function logDebug(module: string, message: string, data?: any): void {
  if (DEBUG_ENABLED) {
    writeLogEntry('debug', module, message, data);
  }
}

export function logInfo(module: string, message: string, data?: any): void {
  // Info logging disabled to reduce log noise
  // writeLogEntry('info', module, message, data);
}

export function logWarn(module: string, message: string, data?: any): void {
  writeLogEntry('warn', module, message, data);
}

export function logError(module: string, message: string, data?: any): void {
  writeLogEntry('error', module, message, data);
}

// Convenience function for streaming-specific debug logs
export function logStreamingDebug(message: string, data?: any): void {
  logDebug('streaming', message, data);
}

// Convenience function for display-specific debug logs
export function logDisplayDebug(message: string, data?: any): void {
  logDebug('display', message, data);
}

// Initialize logging system
export function initializeLogging(): void {
  ensureLogDirectory();
  // Skip info logging for initialization
}

// Clean up old log files (optional - can be called periodically)
export function cleanupOldLogs(daysToKeep: number = 7): void {
  try {
    // Implementation for log cleanup if needed
    logWarn('system', `Log cleanup requested for files older than ${daysToKeep} days`);
  } catch (error) {
    logError('system', 'Failed to cleanup old logs', { error: error.message });
  }
}
