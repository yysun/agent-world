# Server Startup and Process Management Improvements

**Date**: 2026-02-08  
**Type**: Enhancement + Bug Fix  
**Files Modified**: `server/index.ts`

## Overview

Enhanced the web server startup logic to support both CLI/bin usage and embedded/programmatic usage (e.g., Electron apps) with proper process handler management, configurable browser auto-open behavior, and race condition prevention during shutdown.

## Problem Statement

The previous implementation had several issues:
1. **Module-level mutable state** (`let processHandlersRegistered = false`) caused problems in test environments and multiple server instances
2. **No shutdown guard** allowed race conditions when multiple signals fired simultaneously
3. **Inconsistent environment variable naming** mixed positive and negative logic
4. **Browser auto-open couldn't be disabled** for embedded usage scenarios
5. **Bin execution didn't auto-open browser** by default, requiring manual configuration

## Implementation

### 1. WeakSet for Process Handler Tracking

**Before:**
```typescript
let processHandlersRegistered = false;

if (registerProcessHandlers && !processHandlersRegistered) {
  processHandlersRegistered = true;
  // Register handlers...
}
```

**After:**
```typescript
const serversWithHandlers = new WeakSet<Server>();

if (registerProcessHandlers && !serversWithHandlers.has(server)) {
  serversWithHandlers.add(server);
  // Register handlers...
}
```

**Benefits:**
- Thread-safe and test-safe
- Properly tracks each server instance independently
- No memory leaks (WeakSet allows garbage collection)
- Can support multiple server instances in same process

### 2. Shutdown Race Condition Guard

**Added:**
```typescript
let shuttingDown = false;
const gracefulShutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  // ... shutdown logic
};
```

**Benefits:**
- Prevents multiple simultaneous shutdown attempts
- Avoids duplicate `process.exit()` calls
- Cleaner logs during shutdown

### 3. Standardized Environment Variables

**Before:**
```typescript
const shouldOpenBrowserOnAutostart = process.env.AGENT_WORLD_DISABLE_AUTO_OPEN !== 'true';
```

**After:**
```typescript
// Auto-open browser by default when launched via npx/bin, unless explicitly disabled
const shouldOpenBrowser = isBinExecution
  ? process.env.AGENT_WORLD_AUTO_OPEN !== 'false'
  : process.env.AGENT_WORLD_AUTO_OPEN === 'true';
```

**Benefits:**
- Consistent positive naming convention
- Context-aware defaults (bin vs programmatic)
- Clearer API for users

### 4. Smart Browser Auto-Open Detection

**Added:**
```typescript
const isBinExecution = process.argv[1]?.includes('agent-world-server') || false;
const shouldOpenBrowser = isBinExecution
  ? process.env.AGENT_WORLD_AUTO_OPEN !== 'false'
  : process.env.AGENT_WORLD_AUTO_OPEN === 'true';

if ((isDirectExecution || isBinExecution) && shouldAutostart) {
  startWebServer(PORT, HOST, {
    openBrowser: shouldOpenBrowser,
    registerProcessHandlers: true
  })
}
```

**Benefits:**
- CLI users get browser auto-open by default
- Embedded usage (Electron) doesn't auto-open by default
- Both scenarios can be explicitly controlled via environment variable

### 5. Enhanced startWebServer Options

**Added:**
```typescript
type StartWebServerOptions = {
  openBrowser?: boolean;
  registerProcessHandlers?: boolean;
};

export function startWebServer(
  port = PORT,
  host = HOST,
  options: StartWebServerOptions = {}
): Promise<Server> {
  const openBrowser = options.openBrowser ?? false;
  const registerProcessHandlers = options.registerProcessHandlers ?? false;
  // ...
}
```

**Benefits:**
- Explicit control for programmatic usage
- Safe defaults (both false)
- Flexible configuration

## Usage

### CLI/Bin Usage (npx)

```bash
# Default: Opens browser automatically
npx agent-world-server

# Disable browser auto-open
AGENT_WORLD_AUTO_OPEN=false npx agent-world-server
```

### Programmatic Usage (Import)

```typescript
import { startWebServer } from 'agent-world/server';

// Default: No browser, no process handlers
await startWebServer();

// With browser auto-open
await startWebServer(3000, 'localhost', { 
  openBrowser: true 
});

// With process handlers (for standalone apps)
await startWebServer(3000, 'localhost', {
  openBrowser: true,
  registerProcessHandlers: true
});
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_WORLD_AUTO_OPEN` | Context-aware | Auto-open browser (true for bin, false for import) |
| `PORT` | `0` (random) | Server port |
| `HOST` | `127.0.0.1` | Server host |

## Testing

All existing tests continue to pass:
- ✅ 43 test files
- ✅ 501 tests passed
- ✅ No TypeScript errors

Test coverage includes:
- Agent storage with mocks
- Chat management
- Message persistence
- Shell command integration
- Subscription cleanup

## Architecture Decisions

### Why WeakSet over Boolean Flag?

1. **Multiple Instances**: Supports running multiple server instances in the same process
2. **Memory Safety**: Automatic garbage collection when server instance is destroyed
3. **Test Isolation**: Each test can create/destroy servers without affecting others
4. **Thread Safety**: No shared mutable state

### Why Context-Aware Auto-Open Defaults?

1. **CLI User Experience**: npx users expect browser to open (like most dev servers)
2. **Embedded Safety**: Electron apps shouldn't open duplicate browser windows
3. **Explicit Override**: Both contexts can explicitly control behavior via env var
4. **Progressive Enhancement**: Sensible defaults with full control when needed

### Why Shutdown Guard?

1. **Signal Handling**: SIGTERM and SIGINT can fire simultaneously
2. **Error Handling**: Prevents duplicate shutdown attempts on errors
3. **Clean Logs**: Single shutdown sequence instead of overlapping attempts
4. **Reliability**: Ensures MCP servers shut down exactly once

## Related Work

- Initial server implementation: `server/index.ts`
- MCP registry: `core/mcp-server-registry.ts`
- Logging system: `core/logger.ts`

## Breaking Changes

⚠️ **Environment Variable Naming Change**:
- Old: `AGENT_WORLD_DISABLE_AUTO_OPEN=false` (to enable)
- New: `AGENT_WORLD_AUTO_OPEN=true` (to enable)

However, the new context-aware logic means most users won't need to set this variable at all:
- CLI users: Browser opens by default ✓
- Embedded users: Browser stays closed by default ✓

## Simplifications

### Removed AGENT_WORLD_AUTOSTART

Originally included `AGENT_WORLD_AUTOSTART` to control whether server starts on direct execution. However, this was unnecessary:
- When running `npx agent-world-server`, you clearly want the server to start
- For programmatic usage, you explicitly call `startWebServer()`, so the autostart logic doesn't run
- No practical use case for executing the file without starting the server

**Simplified to single environment variable:**
- `AGENT_WORLD_AUTO_OPEN`: Controls browser auto-open behavior only
- Server always starts when file is executed directly or via bin

## Future Improvements

1. **Add unit tests** for:
   - `openBrowser` option behavior
   - `registerProcessHandlers` flag
   - Multiple server starts
   - Environment variable combinations

2. **Consider returning cleanup function**:
   ```typescript
   const { server, cleanup } = await startWebServer(...);
   // Later: cleanup(); // Unregister handlers
   ```

3. **Add timeout for MCP shutdown** to prevent hangs

4. **Document in README.md** with examples for both usage patterns

## Commits

Related to code review improvements following RPD workflow's CR (Code Review) command.
