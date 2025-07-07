# Browser-Safe Core Implementation

## Overview

Agent World's core has been designed to work seamlessly in both Node.js and browser environments through runtime environment detection and NoOp storage implementations. This ensures the same API works everywhere without throwing errors.

## Implementation Details

### Environment Detection

The core uses simple runtime detection to determine the environment:

```typescript
export function isNodeEnvironment(): boolean {
  return typeof window === 'undefined' && typeof global !== 'undefined';
}
```

This approach is more reliable than build-time constants and works across different bundling scenarios.

### Dynamic Logger Loading

The logger system dynamically loads the appropriate implementation:

```typescript
// Node.js environment
const pino = await import('pino');
logger = pino.default({ /* Node.js config */ });

// Browser environment  
const pinoBrowser = await import('pino/browser');
logger = pinoBrowser.default({ /* Browser config */ });
```

### NoOp Storage Operations

In browser environments, all storage operations become NoOp functions that:
- Don't throw errors
- Return appropriate default values
- Log debug information about the operation
- Maintain identical API signatures

## NoOp Return Values

### World Storage Operations

| Operation | Return Value | Description |
|-----------|--------------|-------------|
| `saveWorldToDisk` | `void` | Logs operation, no action taken |
| `loadWorldFromDisk` | `null` | Indicates world not found |
| `deleteWorldFromDisk` | `false` | Indicates deletion failed |
| `loadAllWorldsFromDisk` | `[]` | Empty array of worlds |
| `worldExistsOnDisk` | `false` | Indicates world doesn't exist |

### Agent Storage Operations

| Operation | Return Value | Description |
|-----------|--------------|-------------|
| `loadAllAgentsFromDisk` | `[]` | Empty array of agents |
| `saveAgentConfigToDisk` | `void` | Logs operation, no action taken |
| `saveAgentToDisk` | `void` | Logs operation, no action taken |
| `saveAgentMemoryToDisk` | `void` | Logs operation, no action taken |
| `loadAgentFromDisk` | `null` | Indicates agent not found |
| `loadAgentFromDiskWithRetry` | `null` | Indicates agent not found |
| `deleteAgentFromDisk` | `false` | Indicates deletion failed |
| `loadAllAgentsFromDiskBatch` | `{ successful: [], failed: [] }` | Empty batch result |
| `agentExistsOnDisk` | `false` | Indicates agent doesn't exist |
| `validateAgentIntegrity` | `true` | Assumes valid (no validation needed) |
| `repairAgentData` | `false` | Indicates repair not needed/failed |
| `archiveAgentMemory` | `void` | Logs operation, no action taken |

## Browser Usage

### ESM Import

```html
<script type="module">
  import { isNodeEnvironment, initializeLogger } from './core.js';
  
  console.log('Environment:', isNodeEnvironment() ? 'Node.js' : 'Browser');
  
  // Initialize logger for browser
  await initializeLogger();
</script>
```

### Core Functionality

```javascript
import { 
  createWorld, 
  createAgent, 
  broadcastMessage 
} from './core.js';

// These operations work in browser (NoOp storage)
const world = await createWorld('/tmp', {
  name: 'Browser World',
  description: 'A world that works in browsers'
});

const agent = await createAgent('/tmp', 'browser-world', {
  name: 'Browser Agent',
  type: 'text',
  provider: 'openai',
  model: 'gpt-3.5-turbo'
});

// Agent communication still works
await broadcastMessage('/tmp', 'browser-world', 'Hello from browser!');
```

## Debug Logging

All NoOp operations generate debug logs:

```javascript
// In browser console (with debug level enabled)
[DEBUG] NoOp: saveWorldToDisk called in browser { worldId: 'test-world' }
[DEBUG] NoOp: loadAgentFromDisk called in browser { worldId: 'test-world', agentId: 'agent-1' }
[DEBUG] NoOp: archiveAgentMemory called in browser { worldId: 'test-world', agentId: 'agent-1', memoryLength: 5 }
```

## Testing

### Integration Tests

Run the integration tests to verify browser-safe functionality:

```bash
# Node.js environment test
npx tsx integration-tests/browser-safe-core-test.ts

# Browser environment test  
# Open public/browser-test.html in a browser
```

### Manual Testing

1. **Environment Detection**: `isNodeEnvironment()` should return `false` in browsers
2. **Logger Initialization**: Should load pino/browser without errors
3. **Storage Operations**: Should not throw, return appropriate defaults
4. **Category Loggers**: Should work after initialization

## Migration Guide

### From Build-Time Constants

If you were using the old `__IS_BROWSER__` constant:

```typescript
// Old approach
if (typeof __IS_BROWSER__ === 'undefined' || !__IS_BROWSER__) {
  // Node.js code
} else {
  // Browser code
}

// New approach  
if (isNodeEnvironment()) {
  // Node.js code
} else {
  // Browser code
}
```

### Error Handling

NoOp operations don't throw errors, so you can safely call them:

```typescript
// Safe in both environments
try {
  const world = await createWorld('/tmp', { name: 'Test' });
  console.log('World created:', world);
} catch (error) {
  console.error('World creation failed:', error);
}

// In browser: world will be a runtime object, storage is NoOp
// In Node.js: world will be saved to disk and loaded
```

## Performance Considerations

- **Dynamic Imports**: Only loaded once during initialization
- **NoOp Functions**: Minimal overhead, just debug logging
- **Memory Usage**: Browser environments use memory-only storage
- **Bundle Size**: Browser builds exclude Node.js-specific modules

## Troubleshooting

### Common Issues

1. **Import Errors**: Ensure you're using ESM imports (`import` not `require`)
2. **Logger Not Working**: Call `initializeLogger()` before using logger
3. **Storage Errors**: Check debug logs to verify NoOp operations
4. **Category Loggers**: Initialize main logger before creating category loggers

### Debug Tips

```javascript
// Enable debug logging
import { setLogLevel } from './core.js';
setLogLevel('debug');

// Check environment
import { isNodeEnvironment } from './core.js';
console.log('Environment:', isNodeEnvironment());

// Verify NoOp operations
import { createWorld } from './core.js';
const world = await createWorld('/tmp', { name: 'Test' });
// Check browser console for debug messages
```

## Benefits

1. **Universal Compatibility**: Same code works in Node.js and browsers
2. **No Errors**: NoOp operations prevent runtime exceptions
3. **Consistent API**: Identical function signatures everywhere
4. **Easy Testing**: Test both environments with same code
5. **Gradual Migration**: Works with existing Node.js applications
6. **Bundle Optimization**: Browser builds exclude Node.js dependencies

This implementation ensures Agent World can be used in any JavaScript environment while maintaining full API compatibility and providing meaningful debug information.
