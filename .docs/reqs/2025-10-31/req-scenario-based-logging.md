# REQ: Scenario-Based Logging with Best Practices

**Date**: 2025-10-31  
**Status**: Approved  
**Priority**: High

## Executive Summary

The current logging system has a solid technical foundation (Pino-based, hierarchical categories, environment variable configuration) but suffers from **inconsistent usage patterns** and **lack of scenario-oriented design**. This document provides requirements and architectural guidance to transform logging from low-value noise into actionable operational intelligence.

---

## Problem Statement

Current logging implementation is inconsistent and produces useless logs:

### Current Issues

1. **Inconsistent Logger Usage**
   - Some files use `logger` (default instance)
   - Some use `createCategoryLogger()` with various category names
   - sqlite-schema.ts uses old-style `logger.info('sqlite-schema', msg)` format
   - world-storage.ts imports `logger` but doesn't use proper categories

2. **Missing Scenario Context**
   - Logs don't reflect operational scenarios (storage migration, MCP operations, chat sessions)
   - Can't easily filter logs by scenario/feature area
   - No clear way to debug specific workflows

3. **Inadequate Log Levels**
   - Most logs are at `debug` level (invisible by default)
   - Important operational events (migrations, schema changes) lost in noise
   - No clear guidance on when to use each level

4. **Poor Discoverability**
   - Can't enable logging for "storage migration" without knowing internal category names
   - No documentation of available logging categories
   - No clear mapping between user scenarios and log categories

## Requirements

### 1. Scenario-Based Category Hierarchy

Define logging categories that match user scenarios and operational contexts:

```
storage                        # All storage operations
├── storage.migration          # Schema migrations, data migrations
├── storage.sqlite             # SQLite-specific operations
│   ├── storage.sqlite.query   # Query execution details
│   └── storage.sqlite.tx      # Transaction boundaries
├── storage.memory             # Memory storage operations
└── storage.factory            # Storage initialization/factory

llm                           # All LLM operations
├── llm.openai                # OpenAI provider
├── llm.anthropic             # Anthropic provider
├── llm.google                # Google provider
└── llm.request               # Request/response details

mcp                           # MCP server operations
├── mcp.registry              # Server registration/lifecycle
├── mcp.tools                 # Tool discovery/caching
├── mcp.execution             # Tool execution
└── mcp.connection            # Transport/connection management

chat                          # Chat session management
├── chat.session              # Session creation/deletion
├── chat.message              # Message handling
└── chat.history              # History operations

world                         # World lifecycle
├── world.create              # World creation
├── world.update              # World updates
└── world.delete              # World deletion

agent                         # Agent operations
├── agent.create              # Agent creation
├── agent.message             # Agent messaging
└── agent.memory              # Memory management

api                           # HTTP API layer
├── api.request               # Request logging
├── api.response              # Response logging
└── api.error                 # Error handling

server                        # Server lifecycle
cli                           # CLI commands
events                        # Event system
```

### 2. Log Level Guidelines

**error** (Always visible)
- Database corruption, schema initialization failures
- MCP server connection failures that prevent functionality
- API errors that return 5xx status codes
- Unhandled exceptions, critical system failures

**warn** (Visible by default in production)
- Deprecated API usage
- Performance degradation warnings
- Failed operations that have fallbacks (e.g., cache miss)
- Configuration issues that don't prevent operation

**info** (Scenario tracking - what users want to see)
- Schema migrations: "Migrating from version X to Y"
- MCP server lifecycle: "Starting MCP server: X", "Server ready: X"
- Chat session operations: "Created chat session", "Deleted chat"
- Storage initialization: "Storage path: /path, type: sqlite"
- Major operational milestones

**debug** (Developer troubleshooting)
- Function entry/exit with parameters
- Query execution details
- Tool call sequences and parameters
- State transitions

**trace** (Extreme detail for deep debugging)
- Raw request/response payloads
- Internal data structure dumps
- Loop iterations with data

### 3. Consistent API Usage

**Standard Pattern:**
```typescript
import { createCategoryLogger } from './logger.js';

const logger = createCategoryLogger('storage.migration');

// Use structured logging with context
logger.info('Starting schema migration', {
  fromVersion: 3,
  toVersion: 4,
  database: dbPath
});

// Error logging with error object
try {
  await migrateSchema();
} catch (error) {
  logger.error('Schema migration failed', {
    error: error instanceof Error ? error.message : error,
    fromVersion: 3,
    toVersion: 4
  });
  throw error;
}
```

**Anti-Patterns to Eliminate:**
```typescript
// ❌ BAD: Old-style category as first argument
logger.info('sqlite-schema', 'Starting migration');

// ❌ BAD: Using default logger without category
import { logger } from './logger.js';
logger.debug('Something happened');

// ❌ BAD: Inconsistent category naming
const logger = createCategoryLogger('core.storage.memory'); // Too verbose
const logger = createCategoryLogger('mem-storage');        // Not hierarchical
```

### 4. Documentation Requirements

**In-code documentation:**
- Each file should document its logger category at the top
- Comment explaining what scenarios the category covers

**User documentation:**
- List all logging categories with descriptions
- Examples of enabling logging for common scenarios:
  - Storage migration: `LOG_STORAGE_MIGRATION=info`
  - MCP operations: `LOG_MCP=debug`
  - Chat sessions: `LOG_CHAT=info`

### 5. User Experience Goals

**Scenario: Debug storage migration**
```bash
# User sets this in .env or environment
LOG_STORAGE_MIGRATION=info

# Sees clear migration progress
[INFO] STORAGE.MIGRATION: Starting schema migration from version 3 to version 4
[INFO] STORAGE.MIGRATION: Adding chat_id column to agent_memory table
[INFO] STORAGE.MIGRATION: Creating index idx_agent_memory_chat_id
[INFO] STORAGE.MIGRATION: Migration completed: version 3 → 4
```

**Scenario: Debug MCP server issues**
```bash
LOG_MCP=debug

[DEBUG] MCP.REGISTRY: Starting MCP server: filesystem
[DEBUG] MCP.CONNECTION: Creating stdio transport
[DEBUG] MCP.CONNECTION: Connection established
[DEBUG] MCP.TOOLS: Fetching tools from server: filesystem
[DEBUG] MCP.TOOLS: Cached 5 tools for filesystem
```

**Scenario: Track chat operations**
```bash
LOG_CHAT=info

[INFO] CHAT.SESSION: Created chat session (id: chat-123)
[INFO] CHAT.MESSAGE: Added user message to chat-123
[INFO] CHAT.MESSAGE: Added agent response to chat-123
[INFO] CHAT.SESSION: Deleted chat session (id: chat-123)
```

## Non-Requirements

- No change to the existing hierarchical logger architecture
- No change to environment variable syntax (LOG_{CATEGORY}=level)
- No new logging frameworks or dependencies
- No breaking changes to existing logger API

## Success Criteria

1. All files use `createCategoryLogger()` with scenario-based categories
2. No files use old-style `logger.info('category', msg)` pattern
3. Storage migration logs visible with `LOG_STORAGE_MIGRATION=info`
4. MCP operations logs visible with `LOG_MCP=debug`
5. Documentation lists all logging categories with examples
6. Unit tests updated to use new category structure

## Migration Impact

**Files requiring changes:**
- `core/storage/sqlite-schema.ts` - Update to use createCategoryLogger('storage.migration')
- `core/storage/world-storage.ts` - Use proper category logger
- `core/storage/sqlite-storage.ts` - Verify category usage
- All files currently using generic `logger` import
- Documentation: Add logging-categories.md guide

**Estimated effort:** 2-4 hours

---

## Current Architecture Analysis

### ✅ Strengths

1. **Solid Technical Foundation**
   - Pino-based high-performance logging
   - Hierarchical category system with dot notation
   - Environment variable configuration (LOG_{CATEGORY}=level)
   - Automatic category normalization
   - Proper level filtering

2. **Well-Designed API**
   - `createCategoryLogger(category, bindings?)` - Clean API
   - Child logger support for request context
   - Structured logging with context objects
   - Auto-initialization on import

3. **Good Test Coverage**
   - Hierarchical inheritance tests
   - Normalization tests
   - Cache behavior tests

### ❌ Weaknesses

1. **Inconsistent Usage Patterns**
   ```typescript
   // File A: Uses category logger (GOOD)
   const logger = createCategoryLogger('core.managers');
   
   // File B: Uses default logger (BAD)
   import { logger } from './logger.js';
   
   // File C: Uses old deprecated API (BAD)
   logger.info('sqlite-schema', 'message');
   ```

2. **Poor Category Design**
   - Categories reflect code structure (`core.storage.memory`) not scenarios
   - No clear mapping from user scenarios to log categories
   - Missing operational categories (migrations, lifecycle events)

3. **Wrong Log Levels**
   - Everything at `debug` level (invisible by default)
   - Important operational events (migrations, server startup) buried
   - No clear guidance on level selection

4. **Lack of Documentation**
   - No user-facing documentation of available categories
   - No examples of common debugging scenarios
   - No guidance for developers on choosing categories

---

## Best Practice Guidelines

### 1. Category Naming: Scenario-First Design

**Principle**: Categories should reflect **what the user wants to debug**, not the internal code structure.

#### ✅ Good Category Design

```typescript
// Scenario: User wants to see storage migration progress
const logger = createCategoryLogger('storage.migration');
logger.info('Starting schema migration', { fromVersion: 3, toVersion: 4 });

// Scenario: User wants to debug MCP server issues
const logger = createCategoryLogger('mcp.connection');
logger.debug('Attempting connection', { serverName, transport: 'stdio' });

// Scenario: User wants to track chat operations
const logger = createCategoryLogger('chat.session');
logger.info('Created chat', { chatId, worldId });
```

#### ❌ Bad Category Design

```typescript
// Internal implementation detail - user doesn't care
const logger = createCategoryLogger('core.storage.sqlite-schema');

// Too generic - can't filter specific scenarios
const logger = createCategoryLogger('core');

// Not hierarchical - can't enable parent category
const logger = createCategoryLogger('sqlite_migrations');
```

#### Category Hierarchy Rules

1. **Top-level = User scenario domain**: `storage`, `mcp`, `chat`, `llm`, `api`
2. **Second-level = Specific scenario**: `storage.migration`, `mcp.connection`
3. **Third-level = Fine-grained detail**: `mcp.connection.stdio`
4. **Maximum 3 levels** for usability

### 2. Log Level Selection: Operational Value

**Principle**: Log level should reflect **operational importance**, not developer convenience.

#### Level Decision Matrix

| Level | Purpose | Example Use Cases | Visibility |
|-------|---------|-------------------|------------|
| **error** | System failure requiring immediate attention | Database corruption, unhandled exceptions, service unavailable | Always visible (default: error) |
| **warn** | Degraded operation or potential issues | Deprecated API usage, fallback triggered, performance degradation | Visible in production |
| **info** | Operational milestones and state changes | Schema migrations, server startup, session creation, major workflow steps | **Target for scenario tracking** |
| **debug** | Developer troubleshooting information | Function entry/exit, query details, state transitions | Hidden by default |
| **trace** | Extreme detail for deep investigation | Raw payloads, data dumps, loop iterations | Rarely used |

#### ✅ Good Log Level Usage

```typescript
const logger = createCategoryLogger('storage.migration');

// info: Operational milestone - user wants to see migration progress
logger.info('Starting schema migration', { fromVersion: 3, toVersion: 4 });
logger.info('Adding column chat_id to agent_memory');
logger.info('Migration completed', { finalVersion: 4, duration: '125ms' });

// debug: Implementation details - developer troubleshooting
logger.debug('Executing SQL', { sql: 'ALTER TABLE...' });
logger.debug('Column already exists, skipping', { table: 'agent_memory', column: 'chat_id' });

// error: Migration failed - critical problem
logger.error('Migration failed', {
  error: error.message,
  fromVersion: 3,
  toVersion: 4,
  stage: 'add_column'
});
```

#### ❌ Bad Log Level Usage

```typescript
// BAD: Important milestone at debug level - invisible by default
logger.debug('Starting schema migration from version 3 to 4');

// BAD: Verbose implementation detail at info level - too noisy
logger.info('Checking if column exists', { table: 'agent_memory', column: 'chat_id' });

// BAD: Expected condition logged as error - cry-wolf syndrome
logger.error('Column already exists', { column: 'chat_id' });
```

### 3. Structured Logging: Context Over Messages

**Principle**: Log messages should be **searchable constants**, context should be in **structured data**.

#### ✅ Good Structured Logging

```typescript
// Constant message + structured context
logger.info('Schema migration started', {
  fromVersion: 3,
  toVersion: 4,
  database: dbPath,
  timestamp: Date.now()
});

// Error with full context
try {
  await migrateSchema();
} catch (error) {
  logger.error('Schema migration failed', {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    fromVersion: 3,
    toVersion: 4,
    stage: currentStage
  });
  throw error;
}

// Duration tracking
const start = Date.now();
await performOperation();
logger.info('Operation completed', {
  operation: 'schema_migration',
  duration: Date.now() - start,
  status: 'success'
});
```

#### ❌ Bad Logging Patterns

```typescript
// BAD: Variable message - can't aggregate in log analysis
logger.info(`Starting migration from ${fromVersion} to ${toVersion}`);

// BAD: Losing error context
logger.error(`Migration failed: ${error.message}`);

// BAD: Unstructured free-text (deprecated old API)
logger.info('sqlite-schema', 'Starting migration from version 3 to version 4');
```

### 4. Per-File Logger Pattern

**Standard pattern for every file:**

```typescript
/**
 * File: core/storage/sqlite-schema.ts
 * 
 * Logger Category: storage.migration
 * Purpose: Schema initialization and version migrations
 * 
 * Enable with: LOG_STORAGE_MIGRATION=info
 */

import { createCategoryLogger } from '../logger.js';

// Create category logger at module scope
const logger = createCategoryLogger('storage.migration');

// Use throughout the file
export async function migrateSchema(db: Database): Promise<void> {
  const version = await getSchemaVersion(db);
  
  logger.info('Starting schema migration', {
    currentVersion: version,
    targetVersion: CURRENT_SCHEMA_VERSION
  });
  
  try {
    await performMigration(db, version);
    logger.info('Migration completed', {
      fromVersion: version,
      toVersion: CURRENT_SCHEMA_VERSION
    });
  } catch (error) {
    logger.error('Migration failed', {
      error: error instanceof Error ? error.message : String(error),
      fromVersion: version,
      targetVersion: CURRENT_SCHEMA_VERSION
    });
    throw error;
  }
}
```

### 5. Request-Scoped Logging with Child Loggers

For API requests, use child loggers to attach request context:

```typescript
import { createCategoryLogger } from './logger.js';

const logger = createCategoryLogger('api.handler');

app.use((req, res, next) => {
  // Create request-scoped logger with request ID
  req.logger = logger.child({
    requestId: req.headers['x-request-id'] || nanoid(),
    method: req.method,
    path: req.path
  });
  next();
});

// In route handlers, use req.logger
app.post('/worlds', async (req, res) => {
  req.logger.info('Creating world', { worldName: req.body.name });
  
  try {
    const world = await createWorld(req.body);
    req.logger.info('World created', { worldId: world.id });
    res.json(world);
  } catch (error) {
    req.logger.error('World creation failed', {
      error: error.message,
      worldName: req.body.name
    });
    res.status(500).json({ error: error.message });
  }
});
```

---

## Recommended Implementation

### Priority 1: Fix Inconsistent Usage (High Impact)

**Files needing updates:**

1. **`core/storage/sqlite-schema.ts`**
   ```typescript
   // Current: Uses old deprecated API
   logger.info('sqlite-schema', 'Starting migration');
   
   // Change to:
   const logger = createCategoryLogger('storage.migration');
   logger.info('Starting schema migration', { fromVersion, toVersion });
   ```

2. **`core/storage/world-storage.ts`**
   ```typescript
   // Current: Uses default logger
   import { logger } from '../logger.js';
   logger.debug('Error loading chat');
   
   // Change to:
   const logger = createCategoryLogger('storage.query');
   logger.error('Failed to load chat', { worldId, chatId, error: error.message });
   ```

3. **`core/mcp-server-registry.ts`**
   ```typescript
   // Current: Mixed usage
   logger.debug('MCP server connection attempt', ...);
   logger.info('Starting MCP server', ...);
   
   // Verify/enhance:
   const logger = createCategoryLogger('mcp.lifecycle');  // For server start/stop
   const connLogger = createCategoryLogger('mcp.connection');  // For connections
   const toolLogger = createCategoryLogger('mcp.tools');  // For tool operations
   ```

### Priority 2: Promote Important Logs to Info Level

**Operational events that should be visible by default:**

```typescript
// Storage migrations (currently debug, should be info)
logger.info('Starting schema migration', { fromVersion, toVersion });
logger.info('Adding column to table', { table, column });
logger.info('Migration completed', { finalVersion, duration });

// MCP server lifecycle (currently debug, should be info)
logger.info('Starting MCP server', { serverName, transport });
logger.info('MCP server ready', { serverName, toolCount });
logger.info('MCP server stopped', { serverName, reason });

// Chat session operations (missing or at debug, should be info)
logger.info('Chat session created', { chatId, worldId });
logger.info('Chat session deleted', { chatId, messageCount });
```

### Priority 3: Add Documentation

Create **`docs/logging-guide.md`**:

```markdown
# Logging Guide

## Available Categories

| Category | Description | Enable With | Use Case |
|----------|-------------|-------------|----------|
| `storage.migration` | Schema migrations | `LOG_STORAGE_MIGRATION=info` | Track database migrations |
| `mcp.lifecycle` | MCP server start/stop | `LOG_MCP_LIFECYCLE=info` | Debug MCP server issues |
| `chat.session` | Chat operations | `LOG_CHAT_SESSION=info` | Track chat activity |
| `llm.request` | LLM API calls | `LOG_LLM_REQUEST=debug` | Debug LLM integration |

## Common Scenarios

### Debug Storage Migration
\`\`\`bash
LOG_STORAGE_MIGRATION=info npm run server
\`\`\`

### Debug MCP Server Issues
\`\`\`bash
LOG_MCP=debug npm run server
\`\`\`

### Track All Chat Operations
\`\`\`bash
LOG_CHAT=info npm run server
\`\`\`
```

---

## Alternative Approaches Considered

### Option A: Flat Category Structure (Rejected)

```typescript
// Single-level categories
const logger = createCategoryLogger('storage-migration');
const logger = createCategoryLogger('mcp-connection');
const logger = createCategoryLogger('chat-session');
```

**Pros**: Simple, no hierarchy complexity  
**Cons**: 
- Can't enable all MCP logs with `LOG_MCP=debug`
- Loses hierarchical inheritance
- Breaks existing architecture

**Decision**: Rejected - loses key feature of hierarchical control

### Option B: Separate Config File (Rejected)

Create `logging-config.json`:
```json
{
  "scenarios": {
    "storage-migration": "storage.migration",
    "mcp-debug": "mcp"
  }
}
```

**Pros**: User-friendly scenario names  
**Cons**:
- Additional complexity
- Configuration file management
- Environment variables already work well

**Decision**: Rejected - environment variables are sufficient and more flexible

### Option C: Keep Current Structure (Rejected)

Do nothing, document existing categories.

**Pros**: No code changes  
**Cons**:
- Doesn't fix inconsistent usage
- Doesn't address poor category design
- Logs remain low-value

**Decision**: Rejected - problems are real and fixable

---

## Implementation Plan

### Phase 1: Fix Inconsistent Usage (Week 1)

1. Update all files to use `createCategoryLogger()` consistently
2. Eliminate all uses of default `logger` import
3. Remove deprecated `logger.info('category', msg)` pattern
4. Update unit tests

### Phase 2: Optimize Categories (Week 1)

1. Rename categories to scenario-based names:
   - `core.storage.sqlite-schema` → `storage.migration`
   - `core.managers` → `world.lifecycle`, `agent.lifecycle`, `chat.session`
2. Update all logger instantiations
3. Update environment variable documentation

### Phase 3: Adjust Log Levels (Week 1)

1. Promote operational milestones from `debug` to `info`:
   - Storage migrations
   - MCP server lifecycle
   - Chat session operations
2. Verify log output at default level (`error`)
3. Test scenario-based debugging

### Phase 4: Documentation (Week 2)

1. Create `docs/logging-guide.md` with all categories
2. Add examples for common debugging scenarios
3. Update `.env.example` with category examples
4. Add in-code documentation for each category

### Phase 5: Testing (Week 2)

1. Add integration tests for scenario-based logging
2. Verify log level filtering works correctly
3. Test hierarchical category inheritance
4. Validate environment variable configuration

---

## Security & Performance Considerations

### Security

- ✅ **Never log sensitive data**: API keys, passwords, tokens
- ✅ **Sanitize user input** in logs
- ✅ **Be careful with PII**: User emails, names (use IDs instead)

```typescript
// ❌ BAD: Logging sensitive data
logger.debug('API request', { apiKey: config.openaiApiKey });

// ✅ GOOD: Log safely
logger.debug('API request', { provider: 'openai', hasApiKey: !!config.openaiApiKey });
```

### Performance

- ✅ **Level filtering is efficient**: Pino skips log creation if level is filtered
- ✅ **Structured context is cheap**: Object creation only happens if log will be written
- ⚠️ **Avoid expensive operations**: Don't call functions in log arguments if level might filter

```typescript
// ❌ BAD: Function always executed even if debug is disabled
logger.debug('State dump', { state: JSON.stringify(largeObject) });

// ✅ GOOD: Only stringify if debug is enabled
if (logger.level === 'debug' || logger.level === 'trace') {
  logger.debug('State dump', { state: JSON.stringify(largeObject) });
}
```

---

## Success Metrics & Approval

### Success Metrics

1. ✅ **Zero** uses of default `logger` import (except logger.ts itself)
2. ✅ **Zero** uses of deprecated `logger.info('category', msg)` pattern
3. ✅ All operational milestones visible at `info` level
4. ✅ Can debug storage migration with `LOG_STORAGE_MIGRATION=info`
5. ✅ Can debug MCP operations with `LOG_MCP=debug`
6. ✅ Documentation includes all categories with examples
7. ✅ Unit tests pass with updated categories

### Architecture Decision

**Status**: ✅ **Approved**

**Recommended Approach**: Scenario-based categories + consistent usage + proper log levels

**Key Principles**:
1. Categories reflect user scenarios, not code structure
2. Log levels reflect operational importance
3. Structured logging with constant messages
4. Environment variable configuration for flexibility
5. Comprehensive documentation for discoverability

**Next Steps**: Create implementation plan (AP document)

---

## References

- **Pino Documentation**: https://getpino.io/
- **12-Factor App Logs**: https://12factor.net/logs
- **Structured Logging Best Practices**: https://www.sentinelone.com/blog/getting-started-quickly-with-structured-logging/
- **Current Implementation**: `core/logger.ts`
