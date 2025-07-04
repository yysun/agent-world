# WebSocket Debug Logging Standardization - Implementation Summary

## What Was Changed

### 1. Enhanced Core Logger (`core/logger.ts`)

**Before:**
- Simple global logger with basic `setLogLevel()` function
- No category support
- All modules shared the same log level

**After:**
- Added category-based logging support
- New functions:
  - `setCategoryLogLevel(category, level)` - Set log level for specific category
  - `createCategoryLogger(category)` - Create category-specific logger
  - `getCategoryLogLevel(category)` - Get current category log level
- Category loggers are cached and inherit from global level by default
- Each category can have independent log levels

### 2. WebSocket Server (`server/ws.ts`)

**Before:**
```typescript
import { logger } from '../core';
logger.debug('WebSocket message');
```

**After:**
```typescript
import { createCategoryLogger } from '../core';
const logger = createCategoryLogger('ws');
logger.debug('WebSocket message'); // Now tagged with category: 'ws'
```

**Benefits:**
- All WebSocket logs are now categorized as 'ws'
- Can enable/disable WebSocket debug logs independently
- Easier to filter WebSocket-specific logs in production

### 3. CLI Application (`cli/index.ts`)

**Before:**
```typescript
import { logger, setLogLevel } from '../core';
logger.level = 'error'; // Direct property access
```

**After:**
```typescript
import { createCategoryLogger, setCategoryLogLevel } from '../core';
const logger = createCategoryLogger('cli');
setCategoryLogLevel('cli', 'error'); // Proper category management
```

### 4. Core Modules Updated

- `core/events.ts` - Now uses 'events' category
- `core/subscription.ts` - Now uses 'core' category
- `core/index.ts` - Exports new category logging functions

## Usage Examples

### Environment Variable Control

```bash
# Global log level
LOG_LEVEL=info npm start

# Category-specific control
WS_LOG_LEVEL=debug CLI_LOG_LEVEL=error npm start

# Debug only WebSocket issues
LOG_LEVEL=error WS_LOG_LEVEL=debug npm start
```

### Programmatic Control

```typescript
import { 
  setLogLevel, 
  setCategoryLogLevel, 
  createCategoryLogger 
} from './core';

// Set global level
setLogLevel('info');

// Override for specific categories
setCategoryLogLevel('ws', 'debug');
setCategoryLogLevel('cli', 'error');

// Create category loggers
const wsLogger = createCategoryLogger('ws');
const cliLogger = createCategoryLogger('cli');
```

## Available Categories

1. **`ws`** - WebSocket server operations
   - Connection/disconnection events
   - Message processing
   - Subscription management
   - Error handling

2. **`cli`** - CLI application
   - Command processing
   - User interaction
   - World operations

3. **`core`** - Core module operations
   - World subscription lifecycle
   - Internal state management

4. **`events`** - Event system
   - Agent message processing
   - World event handling
   - Memory operations

5. **`storage`** - Storage operations (ready for future use)
6. **`llm`** - LLM interactions (ready for future use)

## Log Output Format

Logs now include category information:

```json
{
  "level": 30,
  "time": 1720104315123,
  "pid": 12345,
  "hostname": "localhost",
  "category": "ws",
  "msg": "WebSocket client connected",
  "clientAddress": "127.0.0.1"
}
```

## Benefits Achieved

### 1. Granular Debug Control
```bash
# Debug only WebSocket issues
WS_LOG_LEVEL=debug npm start

# Debug only CLI operations  
CLI_LOG_LEVEL=debug npm run cli
```

### 2. Production Debugging
```bash
# Show only errors globally, but warnings for core operations
LOG_LEVEL=error CORE_LOG_LEVEL=warn npm start
```

### 3. Development Workflow
```bash
# Working on WebSocket features - see all WS debug info
WS_LOG_LEVEL=debug npm start
```

### 4. Log Filtering
```bash
# Show only WebSocket logs
npm start 2>&1 | grep '"category":"ws"'

# Show only error-level logs across all categories
npm start 2>&1 | grep '"level":50'
```

## Testing

Created `examples/category-logging-demo.js` to demonstrate:
- Category-specific log levels
- Log output formatting
- Environment variable control
- Runtime category configuration

## Migration Path

### Existing Code (Backward Compatible)
```typescript
import { logger } from './core';
logger.debug('message'); // Still works
```

### New Recommended Pattern
```typescript
import { createCategoryLogger } from './core';
const logger = createCategoryLogger('your-category');
logger.debug('message'); // Now categorized
```

## Future Enhancements

1. **Web UI Control**: Add category log level controls to web interface
2. **Persistent Settings**: Save category log levels to configuration
3. **Dynamic Control**: Runtime category level adjustment via API
4. **Log Streaming**: Category-filtered log streaming to clients

## Files Modified

- `core/logger.ts` - Added category support
- `core/index.ts` - Export new functions
- `server/ws.ts` - Use 'ws' category logger
- `cli/index.ts` - Use 'cli' category logger  
- `core/events.ts` - Use 'events' category logger
- `core/subscription.ts` - Use 'core' category logger

## Files Created

- `docs/category-logging.md` - Comprehensive documentation
- `examples/category-logging-demo.js` - Working demonstration
- `docs/ws-logging-standardization.md` - This summary document

The WebSocket debug logging is now fully standardized and controllable independently from other system components.
