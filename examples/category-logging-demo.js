#!/usr/bin/env node

/**
 * Category Logging Demo
 * 
 * This script demonstrates how to use the new category-based logging system
 * in Agent World. You can control log levels for different categories independently.
 * 
 * Usage:
 *   node examples/category-logging-demo.js
 * 
 * Environment Variables:
 *   LOG_LEVEL=debug - Set global log level
 *   WS_LOG_LEVEL=error - Set WebSocket specific log level  
 *   CLI_LOG_LEVEL=info - Set CLI specific log level
 */

import {
  setLogLevel,
  setCategoryLogLevel,
  createCategoryLogger,
  getCategoryLogLevel
} from '../core/index.js';

// Set global log level
setLogLevel('info');

// Create category loggers
const wsLogger = createCategoryLogger('ws');
const cliLogger = createCategoryLogger('cli');
const coreLogger = createCategoryLogger('core');
const storageLogger = createCategoryLogger('storage');

// Configure category-specific log levels if provided
if (process.env.WS_LOG_LEVEL) {
  setCategoryLogLevel('ws', process.env.WS_LOG_LEVEL);
}
if (process.env.CLI_LOG_LEVEL) {
  setCategoryLogLevel('cli', process.env.CLI_LOG_LEVEL);
}

console.log('=== Category Logging Demo ===\n');

console.log('Current log levels:');
console.log(`Global: ${getCategoryLogLevel('default')}`);
console.log(`WS: ${getCategoryLogLevel('ws')}`);
console.log(`CLI: ${getCategoryLogLevel('cli')}`);
console.log(`Core: ${getCategoryLogLevel('core')}`);
console.log(`Storage: ${getCategoryLogLevel('storage')}\n`);

console.log('Testing different log levels for each category:\n');

// Test WebSocket logging
wsLogger.debug('This is a WebSocket debug message');
wsLogger.info('WebSocket connection established');
wsLogger.warn('WebSocket connection timeout warning');
wsLogger.error('WebSocket connection failed');

// Test CLI logging  
cliLogger.debug('This is a CLI debug message');
cliLogger.info('CLI command executed successfully');
cliLogger.warn('CLI command deprecated warning');
cliLogger.error('CLI command execution failed');

// Test Core logging
coreLogger.debug('This is a Core debug message');
coreLogger.info('Core module initialized');
coreLogger.warn('Core module configuration warning');
coreLogger.error('Core module critical error');

// Test Storage logging
storageLogger.debug('This is a Storage debug message');
storageLogger.info('Storage operation completed');
storageLogger.warn('Storage performance warning');
storageLogger.error('Storage operation failed');

console.log('\n=== Demo Complete ===');
console.log('Try running with different log levels:');
console.log('  LOG_LEVEL=debug node examples/category-logging-demo.js');
console.log('  WS_LOG_LEVEL=error CLI_LOG_LEVEL=debug node examples/category-logging-demo.js');
