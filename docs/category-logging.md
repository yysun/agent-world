# Category-Based Logging System

## Overview

Agent World now supports category-based logging, allowing you to control log levels for different parts of the system independently. This is especially useful for debugging specific components without being overwhelmed by logs from other parts.

## Categories

The following categories are available:

- `ws` - WebSocket server logging
- `cli` - CLI application logging  
- `core` - Core module logging
- `storage` - Storage operations logging
- `llm` - LLM interactions logging
- `events` - Event system logging

## Usage

### Basic Setup

```typescript
import { 
  setLogLevel, 
  setCategoryLogLevel, 
  createCategoryLogger 
} from './core';

// Set global log level (affects all categories without specific levels)
setLogLevel('info');

// Set specific category log levels
setCategoryLogLevel('ws', 'debug');     // Debug WebSocket operations
setCategoryLogLevel('cli', 'error');    // Only show CLI errors
setCategoryLogLevel('core', 'warn');    // Show core warnings and errors

// Create category-specific loggers
const wsLogger = createCategoryLogger('ws');
const cliLogger = createCategoryLogger('cli');
```

### In Your Code

```typescript
// Instead of using the global logger
import { logger } from './core';
logger.debug('Some message');

// Use category-specific logger
import { createCategoryLogger } from './core';
const logger = createCategoryLogger('ws');
logger.debug('WebSocket message', { data: message });
```

### Environment Variables

You can control logging through environment variables:

```bash
# Global log level
LOG_LEVEL=debug

# Category-specific levels (if implemented in your app)
WS_LOG_LEVEL=error
CLI_LOG_LEVEL=info
CORE_LOG_LEVEL=warn
```

## Examples

### WebSocket Server (ws.ts)

```typescript
import { createCategoryLogger, setLogLevel } from '../core';

// Create WebSocket category logger
const logger = createCategoryLogger('ws');

// Configure global level from environment
const logLevel = process.env.LOG_LEVEL || 'error';
setLogLevel(logLevel);

// All WebSocket logs will be tagged with category: 'ws'
logger.debug('Client connected', { clientAddress });
logger.info('World subscription successful', { worldName });
logger.error('WebSocket connection error', { error });
```

### CLI Application (cli/index.ts)

```typescript
import { 
  createCategoryLogger, 
  setLogLevel, 
  setCategoryLogLevel 
} from '../core';

// Create CLI category logger
const logger = createCategoryLogger('cli');

// Configure logging
setLogLevel('error');  // Global default
setCategoryLogLevel('cli', 'info');  // CLI-specific level

logger.debug('Processing command', { command });
logger.info('Command executed successfully');
```

### Core Modules

```typescript
import { createCategoryLogger } from './logger';

// In events.ts
const logger = createCategoryLogger('events');

// In agent-storage.ts  
const logger = createCategoryLogger('storage');

// In llm-manager.ts
const logger = createCategoryLogger('llm');
```

## Benefits

1. **Granular Control**: Debug specific components without noise from others
2. **Production Tuning**: Show only critical errors in production while debugging specific issues
3. **Development Workflow**: Enable debug logging for the component you're working on
4. **Performance**: Reduce log volume by controlling what gets logged where

## Common Use Cases

### Debug WebSocket Issues Only

```bash
LOG_LEVEL=error WS_LOG_LEVEL=debug npm start
```

This will show only error-level logs globally, but debug-level logs for WebSocket operations.

### Debug CLI Commands

```bash
CLI_LOG_LEVEL=debug npm run cli
```

### Production with Selective Debugging

```bash
LOG_LEVEL=error CORE_LOG_LEVEL=warn npm start
```

Show only errors globally, but warnings for core operations.

## Migration Guide

### Before (Global Logger)

```typescript
import { logger } from '../core';

logger.debug('WebSocket message received');
logger.error('Failed to process command');
```

### After (Category Logger)

```typescript
import { createCategoryLogger } from '../core';

const logger = createCategoryLogger('ws');

logger.debug('WebSocket message received');
logger.error('Failed to process command');
```

The log output will now include the category information, making it easier to filter and understand the source of each log message.

## API Reference

### `setLogLevel(level)`
Sets the global log level for all categories that don't have specific levels set.

### `setCategoryLogLevel(category, level)`
Sets the log level for a specific category.

### `createCategoryLogger(category)`
Creates a logger instance for the specified category. Returns a cached instance if already created.

### `getCategoryLogLevel(category)`
Returns the current log level for a category (either specific or inherited from global).

## Log Output Format

With category logging, your logs will include category information:

```
[2025-07-04 10:30:15.123] DEBUG (agent-world-core/12345 on hostname): WebSocket client connected
    category: "ws"
    clientAddress: "127.0.0.1"
```

This makes it easy to filter logs by category using tools like `grep`:

```bash
# Show only WebSocket logs
npm start 2>&1 | grep '"category":"ws"'

# Show only CLI logs  
npm run cli 2>&1 | grep '"category":"cli"'
```
