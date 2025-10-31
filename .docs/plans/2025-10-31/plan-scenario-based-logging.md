# AP: Scenario-Based Logging Implementation Plan

**Date**: 2025-10-31  
**Reference**: [REQ: Scenario-Based Logging](../../reqs/2025-10-31/req-scenario-based-logging.md)  
**Status**: ✅ COMPLETED - 2025-10-31  
**Implementation**: [Done Document](../../done/2025-10-31/scenario-based-logging-implementation.md)  
**Estimated Effort**: 2-4 hours  
**Actual Effort**: ~3 hours

## Implementation Summary

Successfully completed migration from code-structure-based logging to scenario-based logging:

✅ **Phase 1**: Fix Inconsistent Usage (All steps completed)
- Updated sqlite-schema.ts, world-storage.ts, memory-storage.ts, storage-factory.ts

✅ **Phase 2**: Optimize MCP and LLM Categories
- Added separate logger instances for MCP operations
- Updated all LLM provider logger categories

✅ **Phase 3**: Optimize Core Module Categories
- Updated events.ts with scenario-based categories
- Updated subscription.ts and activity-tracker.ts

✅ **Phase 4**: Update Pre-Made Loggers
- Comprehensive update to logger.ts with 40+ scenario-based categories

✅ **Phase 5**: Documentation
- Created comprehensive logging-guide.md (400+ lines)
- Updated .env.example with extensive examples
- Added comprehensive logging table to README.md
- Updated logging-guide.md with summary table

✅ **Phase 6**: Testing & Validation
- All tests passing: 669/688 (19 skipped)
- Updated test expectations for new categories

**Test Results**: ✅ All tests passing
**Breaking Changes**: None
**Documentation**: Complete with comprehensive reference tables in both README and logging guide

See [Implementation Document](../../done/2025-10-31/scenario-based-logging-implementation.md) for full details.

---

# AP: Scenario-Based Logging Implementation Plan (ORIGINAL)

## Overview

This plan details the step-by-step implementation to migrate from inconsistent, code-structure-based logging to scenario-based logging that provides actionable operational intelligence.

**Key Changes:**
- ✅ Fix inconsistent logger usage across all files
- ✅ Rename categories to scenario-based names
- ✅ Promote operational milestones from `debug` to `info` level
- ✅ Add comprehensive documentation
- ✅ Update tests

---

## Implementation Phases

### Phase 1: Fix Inconsistent Usage (High Priority)
**Estimated Time**: 30-45 minutes  
**Risk**: Low - Mechanical changes, existing tests will catch issues

#### Step 1.1: Update `core/storage/sqlite-schema.ts`
- [ ] Replace deprecated `logger.info('sqlite-schema', msg)` pattern
- [ ] Create category logger: `createCategoryLogger('storage.migration')`
- [ ] Update all log calls to use structured logging
- [ ] Change migration logs from `debug` to `info` level

**Before:**
```typescript
const { logger } = await import('../logger.js');
logger.info('sqlite-schema', `Starting migration from version ${currentVersion}`);
```

**After:**
```typescript
import { createCategoryLogger } from '../logger.js';
const logger = createCategoryLogger('storage.migration');
logger.info('Starting schema migration', {
  fromVersion: currentVersion,
  toVersion: CURRENT_SCHEMA_VERSION
});
```

**Files to modify:**
- `core/storage/sqlite-schema.ts` - All functions using logger

**Acceptance:**
- ✅ Zero uses of `logger.info('sqlite-schema', ...)`
- ✅ All migration logs use structured format
- ✅ Setting `LOG_STORAGE_MIGRATION=info` shows migration progress

---

#### Step 1.2: Update `core/storage/world-storage.ts`
- [ ] Replace default `logger` import with `createCategoryLogger('storage.query')`
- [ ] Update error logs to `error` level with proper context
- [ ] Add structured context to all log calls

**Before:**
```typescript
import { logger } from '../logger.js';
logger.debug('Error loading chat data:', error);
```

**After:**
```typescript
import { createCategoryLogger } from '../logger.js';
const logger = createCategoryLogger('storage.query');
logger.error('Failed to load chat data', {
  error: error instanceof Error ? error.message : String(error),
  worldId,
  chatId
});
```

**Files to modify:**
- `core/storage/world-storage.ts` - Replace 3 logger usage instances

**Acceptance:**
- ✅ No default `logger` import
- ✅ All error logs include context
- ✅ Error messages are constant strings

---

#### Step 1.3: Verify `core/storage/memory-storage.ts`
- [ ] Already uses `createCategoryLogger('core.storage.memory')`
- [ ] Rename to `storage.memory` (shorter, scenario-based)
- [ ] Verify log levels are appropriate

**Before:**
```typescript
const loggerStorage = createCategoryLogger('core.storage.memory');
```

**After:**
```typescript
const logger = createCategoryLogger('storage.memory');
```

**Files to modify:**
- `core/storage/memory-storage.ts` - Rename logger and category

**Acceptance:**
- ✅ Category is `storage.memory`
- ✅ Variable named `logger` consistently

---

#### Step 1.4: Verify `core/storage/storage-factory.ts`
- [ ] Already uses `createCategoryLogger('core.storage.factory')`
- [ ] Rename to `storage.factory`
- [ ] Check if initialization log should be `info` level

**Before:**
```typescript
const loggerFactory = createCategoryLogger('core.storage.factory');
logger.info('storage-factory', `🟢 Storage path: ${config.rootPath}`);
```

**After:**
```typescript
const logger = createCategoryLogger('storage.init');
logger.info('Storage initialized', {
  path: config.rootPath,
  type: config.type
});
```

**Files to modify:**
- `core/storage/storage-factory.ts`

**Acceptance:**
- ✅ Category is `storage.init`
- ✅ Initialization logs at `info` level

---

### Phase 2: Optimize MCP Categories (Medium Priority)
**Estimated Time**: 30-45 minutes  
**Risk**: Medium - MCP logging is verbose, need to balance detail vs noise

#### Step 2.1: Split `core/mcp-server-registry.ts` Categories
- [ ] Current: Single logger `llm.mcp` for everything
- [ ] Create separate loggers for different scenarios:
  - `mcp.lifecycle` - Server start/stop/ready
  - `mcp.connection` - Connection establishment
  - `mcp.tools` - Tool discovery/caching
  - `mcp.execution` - Tool execution

**Before:**
```typescript
const logger = createCategoryLogger('llm.mcp');
logger.debug('MCP server connection attempt', ...);
logger.info('Starting MCP server', ...);
logger.debug('Fetching and caching tools', ...);
```

**After:**
```typescript
const lifecycleLogger = createCategoryLogger('mcp.lifecycle');
const connectionLogger = createCategoryLogger('mcp.connection');
const toolsLogger = createCategoryLogger('mcp.tools');
const executionLogger = createCategoryLogger('mcp.execution');

// Server lifecycle - promote to info
lifecycleLogger.info('Starting MCP server', { serverName, transport });
lifecycleLogger.info('MCP server ready', { serverName, toolCount });

// Connection details - keep at debug
connectionLogger.debug('Connection attempt', { serverName, transport });
connectionLogger.debug('Connection established', { serverName });

// Tool operations - keep at debug
toolsLogger.debug('Fetching tools', { serverName });
toolsLogger.debug('Tools cached', { serverName, count });

// Tool execution - keep at debug
executionLogger.debug('Executing tool', { toolName, serverName });
```

**Files to modify:**
- `core/mcp-server-registry.ts` - Split logger usage by scenario

**Acceptance:**
- ✅ Server lifecycle events at `info` level
- ✅ Can filter by scenario: `LOG_MCP_LIFECYCLE=info`, `LOG_MCP_TOOLS=debug`
- ✅ Structured logging throughout

---

#### Step 2.2: Update LLM Provider Loggers
- [ ] Verify existing categories are good:
  - `llm.adapter.openai` → Keep as `llm.openai`
  - `llm.adapter.anthropic` → Keep as `llm.anthropic`
  - `llm.adapter.google` → Keep as `llm.google`
  - `llm.mcp` → Change to `mcp.execution` (MCP tool calls from LLM)

**Files to modify:**
- `core/openai-direct.ts`
- `core/anthropic-direct.ts`
- `core/google-direct.ts`

**Acceptance:**
- ✅ LLM providers use `llm.{provider}` pattern
- ✅ MCP tool execution uses `mcp.execution`

---

### Phase 3: Optimize Core Module Categories (Low Priority)
**Estimated Time**: 30 minutes  
**Risk**: Low - These are less frequently used

#### Step 3.1: Update `core/managers.ts`
- [ ] Current: `core.managers` - too generic
- [ ] Split by functionality:
  - World operations → `world.lifecycle`
  - Agent operations → `agent.lifecycle`
  - Chat operations → `chat.session`

**Before:**
```typescript
const logger = createCategoryLogger('core.managers');
logger.error('Failed to initialize storage', ...);
```

**After:**
```typescript
const storageLogger = createCategoryLogger('storage.init');
const worldLogger = createCategoryLogger('world.lifecycle');
const agentLogger = createCategoryLogger('agent.lifecycle');
const chatLogger = createCategoryLogger('chat.session');

// Use appropriate logger based on context
storageLogger.error('Storage initialization failed', { error: error.message });
worldLogger.info('World created', { worldId, name });
chatLogger.info('Chat session created', { chatId, worldId });
```

**Files to modify:**
- `core/managers.ts` - Split logger by operation type

**Acceptance:**
- ✅ Separate loggers for world, agent, chat operations
- ✅ Operational events (create, delete) at `info` level

---

#### Step 3.2: Update `core/events.ts`
- [ ] Already has good categories: `core.events.{publish,agent,response,memory,automention,turnlimit,chattitle}`
- [ ] Rename to remove `core.` prefix: `events.{publish,agent,response,memory,automention,turnlimit,chattitle}`
- [ ] Verify log levels are appropriate

**Files to modify:**
- `core/events.ts` - Rename categories

**Acceptance:**
- ✅ Categories use `events.*` pattern
- ✅ Important events at appropriate levels

---

#### Step 3.3: Update Other Core Files
- [ ] `core/subscription.ts`: `core.subscription` → `world.subscription`
- [ ] `core/activity-tracker.ts`: `core.activity` → `world.activity`
- [ ] `core/export.ts`: Add logger if missing → `world.export`
- [ ] `core/llm-manager.ts`: Verify category usage

**Files to modify:**
- `core/subscription.ts`
- `core/activity-tracker.ts`
- `core/export.ts`
- `core/llm-manager.ts`

**Acceptance:**
- ✅ All categories follow scenario-based naming
- ✅ No `core.*` categories except `core.events` legacy if needed

---

### Phase 4: Update Pre-Made Loggers (Low Priority)
**Estimated Time**: 10 minutes  
**Risk**: Very Low - Just updating exports

#### Step 4.1: Update `core/logger.ts` Pre-Made Loggers

**Before:**
```typescript
export const loggers = {
  core: createCategoryLogger('core'),
  'core.db': createCategoryLogger('core.db'),
  api: createCategoryLogger('api'),
  llm: createCategoryLogger('llm'),
  events: createCategoryLogger('events'),
  ws: createCategoryLogger('ws'),
  storage: createCategoryLogger('storage'),
  server: createCategoryLogger('server'),
  cli: createCategoryLogger('cli'),
};
```

**After:**
```typescript
export const loggers = {
  // Storage operations
  storage: createCategoryLogger('storage'),
  'storage.migration': createCategoryLogger('storage.migration'),
  'storage.query': createCategoryLogger('storage.query'),
  
  // MCP operations
  mcp: createCategoryLogger('mcp'),
  'mcp.lifecycle': createCategoryLogger('mcp.lifecycle'),
  'mcp.tools': createCategoryLogger('mcp.tools'),
  
  // LLM operations
  llm: createCategoryLogger('llm'),
  'llm.openai': createCategoryLogger('llm.openai'),
  'llm.anthropic': createCategoryLogger('llm.anthropic'),
  'llm.google': createCategoryLogger('llm.google'),
  
  // Chat operations
  chat: createCategoryLogger('chat'),
  'chat.session': createCategoryLogger('chat.session'),
  
  // World/Agent operations
  world: createCategoryLogger('world'),
  agent: createCategoryLogger('agent'),
  
  // Infrastructure
  api: createCategoryLogger('api'),
  events: createCategoryLogger('events'),
  server: createCategoryLogger('server'),
  cli: createCategoryLogger('cli'),
};
```

**Files to modify:**
- `core/logger.ts` - Update pre-made loggers export

**Acceptance:**
- ✅ Pre-made loggers reflect common scenarios
- ✅ Tests still pass

---

### Phase 5: Documentation (High Priority)
**Estimated Time**: 45 minutes  
**Risk**: Low - Pure documentation

#### Step 5.1: Create `docs/logging-guide.md`
- [ ] Create comprehensive logging guide
- [ ] Document all available categories
- [ ] Provide scenario-based examples
- [ ] Add troubleshooting tips

**Content Outline:**
1. Introduction - Why scenario-based logging
2. Quick Start - Common debugging scenarios
3. Available Categories - Complete reference table
4. Log Levels - When to use each
5. Best Practices - Code examples
6. Environment Variables - Configuration guide
7. Troubleshooting - Common issues

**File to create:**
- `docs/logging-guide.md`

**Acceptance:**
- ✅ Complete category reference table
- ✅ Examples for top 5 debugging scenarios
- ✅ Clear environment variable documentation

---

#### Step 5.2: Update `.env.example`
- [ ] Add logging configuration examples
- [ ] Document common debugging scenarios

**Add to file:**
```bash
# Logging Configuration
# Set LOG_LEVEL for global default (error, warn, info, debug, trace)
LOG_LEVEL=error

# Scenario-Based Logging Examples:
# Enable storage migration tracking
# LOG_STORAGE_MIGRATION=info

# Debug MCP server operations
# LOG_MCP=debug
# LOG_MCP_LIFECYCLE=info

# Track chat session operations
# LOG_CHAT_SESSION=info

# Debug LLM provider issues
# LOG_LLM_OPENAI=debug
# LOG_LLM=debug

# Enable all logs for troubleshooting
# LOG_LEVEL=debug
```

**Files to modify:**
- `.env.example`

**Acceptance:**
- ✅ Common scenarios documented
- ✅ Examples are copy-paste ready

---

#### Step 5.3: Add In-Code Documentation Headers

Add standard header to each file with logger:

```typescript
/**
 * File: core/storage/sqlite-schema.ts
 * 
 * Logger Category: storage.migration
 * Purpose: Schema initialization and version migrations
 * 
 * Enable with: LOG_STORAGE_MIGRATION=info npm run server
 * 
 * What you'll see:
 * - Schema version checks
 * - Migration start/completion
 * - Column additions and modifications
 * - Index creation
 */
```

**Files to modify:**
- All files using `createCategoryLogger()` (approximately 15-20 files)

**Acceptance:**
- ✅ Every file documents its logging category
- ✅ Clear explanation of what logs to expect

---

### Phase 6: Testing & Validation (Critical)
**Estimated Time**: 30 minutes  
**Risk**: Medium - Need to ensure no regressions

#### Step 6.1: Update Existing Tests
- [x] Update test expectations for new category names
- [x] Verify hierarchical inheritance still works
- [x] Test environment variable configuration

**Files to modify:**
- `tests/core/logger-hierarchical.test.ts`
- `tests/core/logger-normalization.test.ts`
- Any integration tests using logger

**Test Checklist:**
- [x] All existing logger tests pass
- [x] New category names work correctly
- [x] Environment variable overrides work
- [x] Hierarchical inheritance works (e.g., `LOG_MCP=debug` enables all MCP logs)

---

#### Step 6.2: Manual Testing - Scenario Validation

**Test 1: Storage Migration Logging**
```bash
# Terminal 1: Set environment variable
export LOG_STORAGE_MIGRATION=info

# Terminal 2: Run server (will trigger migration on startup)
npm run server

# Expected: See migration progress logs
[INFO] STORAGE.MIGRATION: Starting schema migration {fromVersion: 3, toVersion: 4}
[INFO] STORAGE.MIGRATION: Adding column chat_id to agent_memory
[INFO] STORAGE.MIGRATION: Migration completed {finalVersion: 4, duration: "125ms"}
```

**Test 2: MCP Server Logging**
```bash
# Set MCP lifecycle logging
export LOG_MCP_LIFECYCLE=info

# Start server with MCP configuration
npm run server

# Expected: See MCP server lifecycle
[INFO] MCP.LIFECYCLE: Starting MCP server {serverName: "filesystem", transport: "stdio"}
[INFO] MCP.LIFECYCLE: MCP server ready {serverName: "filesystem", toolCount: 5}
```

**Test 3: Chat Session Logging**
```bash
# Set chat session logging
export LOG_CHAT_SESSION=info

# Create and use a chat
npm run server
# Use API or web interface to create/delete chats

# Expected: See chat operations
[INFO] CHAT.SESSION: Chat session created {chatId: "chat-abc", worldId: "my-world"}
[INFO] CHAT.SESSION: Chat session deleted {chatId: "chat-abc", messageCount: 15}
```

**Test 4: Hierarchical Category Control**
```bash
# Enable all MCP logs with parent category
export LOG_MCP=debug

# Start server
npm run server

# Expected: See all MCP logs (lifecycle, connection, tools, execution)
[INFO] MCP.LIFECYCLE: Starting MCP server...
[DEBUG] MCP.CONNECTION: Connection attempt...
[DEBUG] MCP.TOOLS: Fetching tools...
[DEBUG] MCP.EXECUTION: Executing tool...
```

**Acceptance Criteria:**
- [x] ✅ `LOG_STORAGE_MIGRATION=info` shows migration progress
- [x] ✅ `LOG_MCP_LIFECYCLE=info` shows MCP lifecycle events
- [x] ✅ `LOG_CHAT_SESSION=info` shows chat operations
- [x] ✅ `LOG_MCP=debug` enables all MCP subcategories
- [x] ✅ No logs at `info` level by default (keeps output clean)
- [x] ✅ All logs use structured format with context objects

---

## Implementation Checklist

### Phase 1: Fix Inconsistent Usage ✅
- [x] Step 1.1: Update `core/storage/sqlite-schema.ts`
- [x] Step 1.2: Update `core/storage/world-storage.ts`
- [x] Step 1.3: Verify `core/storage/memory-storage.ts`
- [x] Step 1.4: Verify `core/storage/storage-factory.ts`

### Phase 2: Optimize MCP Categories ✅
- [x] Step 2.1: Split `core/mcp-server-registry.ts` categories
- [x] Step 2.2: Update LLM provider loggers

### Phase 3: Optimize Core Module Categories ✅
- [x] Step 3.1: Update `core/managers.ts`
- [x] Step 3.2: Update `core/events.ts`
- [x] Step 3.3: Update other core files

### Phase 4: Update Pre-Made Loggers ✅
- [x] Step 4.1: Update `core/logger.ts` exports

### Phase 5: Documentation ✅
- [x] Step 5.1: Create `docs/logging-guide.md`
- [x] Step 5.2: Update `.env.example`
- [x] Step 5.3: Add in-code documentation headers

### Phase 6: Testing & Validation ✅
- [x] Step 6.1: Update existing tests
- [x] Step 6.2: Manual scenario validation

---

## Success Metrics

After implementation, verify:

1. **✅ Zero Inconsistent Usage**
   - No files use default `logger` import (except `logger.ts` itself)
   - No files use deprecated `logger.info('category', msg)` pattern

2. **✅ Scenario-Based Categories**
   - All categories reflect user scenarios, not code structure
   - Categories follow 2-3 level hierarchy
   - Top-level categories: `storage`, `mcp`, `chat`, `llm`, `world`, `agent`, `api`, `server`, `cli`, `events`

3. **✅ Appropriate Log Levels**
   - Operational milestones at `info` level
   - Implementation details at `debug` level
   - Errors with full context at `error` level

4. **✅ Structured Logging**
   - All logs use constant message strings
   - Context in structured objects
   - Error objects properly handled

5. **✅ Documentation Complete**
   - `docs/logging-guide.md` exists with complete reference
   - `.env.example` includes logging examples
   - Each file documents its logging category
   - Common debugging scenarios documented

6. **✅ Tests Pass**
   - All existing tests pass
   - New category names validated
   - Hierarchical control verified

7. **✅ User Scenarios Work**
   - Can debug storage migration with `LOG_STORAGE_MIGRATION=info`
   - Can debug MCP operations with `LOG_MCP=debug`
   - Can track chat operations with `LOG_CHAT_SESSION=info`
   - Can enable all subcategories with parent category

---

## Rollback Plan

If issues arise:

1. **Quick Rollback**: Git revert all changes
   ```bash
   git log --oneline | head -5  # Find commit before changes
   git revert <commit-hash>
   ```

2. **Partial Rollback**: Revert specific files
   ```bash
   git checkout HEAD~1 -- core/storage/sqlite-schema.ts
   ```

3. **Emergency Fix**: Set global debug level
   ```bash
   export LOG_LEVEL=error  # Silence all logs
   ```

---

## Post-Implementation Tasks

After successful implementation:

1. **Monitor Production**
   - Check log volume in production
   - Verify no performance degradation
   - Collect feedback on log usefulness

2. **Create Examples**
   - Add logging examples to README
   - Create video/blog post on debugging with logs

3. **Team Training**
   - Document new logging patterns for team
   - Update contribution guidelines
   - Add to onboarding documentation

4. **Continuous Improvement**
   - Collect scenarios that need better logging
   - Iterate on category structure based on usage
   - Add more scenario-specific categories as needed

---

## Notes & Reminders

- **Keep It Simple**: Don't over-engineer categories, 2-3 levels max
- **Performance**: Log level filtering is cheap, structured context is cheap
- **Security**: Never log API keys, tokens, passwords, or PII
- **Consistency**: Use same patterns across all files
- **Documentation**: Update docs as categories evolve

---

## Ready to Implement? ✅

This plan is ready for implementation. Follow phases in order, complete each checklist item, and verify acceptance criteria before moving to next phase.

**Estimated Total Time**: 2-4 hours  
**Risk Level**: Low to Medium  
**Impact**: High - Better debugging, operational visibility, easier troubleshooting
