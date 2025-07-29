# Architecture Requirements

This document defines the finalized architecture and import conventions for the agent-world system.

## Overview

The agent-world system follows a strict separation of concerns with clearly defined responsibilities and import patterns. The architecture enforces dependency injection and clean module boundaries to ensure maintainability, testability, and proper separation of responsibilities.

## Core Modules and Responsibilities

### 1. managers.ts (Main Orchestrator)
**Primary Role**: Unified orchestration of world, agent, and message management

**Responsibilities**:
- Complete world lifecycle management (create, read, update, delete)
- Complete agent lifecycle management with configuration and memory
- High-level message broadcasting and routing
- EventEmitter integration for runtime world instances
- Dependency injection coordination

**Import Requirements**:
- ✅ **MUST** statically import: `events.ts`, `llm-manager.ts`, `storage-factory.ts`
- ✅ **MUST** use storageFactory to obtain storage implementation
- ✅ **MUST** pass storage implementation to all modules that need it via dependency injection
- ❌ **MUST NOT** dynamically import core modules (events, llm-manager, storage-factory)

### 2. storage-factory.ts (Storage Abstraction)
**Primary Role**: Storage backend abstraction and environment detection

**Responsibilities**:
- Environment detection (Node.js vs browser)
- Storage backend selection and instantiation
- Providing unified storage interface
- Caching storage instances for performance

**Import Requirements**:
- ✅ **MUST** use dynamic imports (`import()`) for storage implementations
- ✅ **MUST** support: `world-storage.ts`, `agent-storage.ts`, `sqlite-storage.ts`
- ✅ **MUST** handle environment-specific loading
- ✅ **MUST** provide NoOp implementations for unsupported environments

### 3. events.ts (Event System)
**Primary Role**: World and agent event management

**Responsibilities**:
- Direct World.eventEmitter event publishing and subscription
- Agent subscription and message processing logic
- World-specific event isolation
- Message broadcasting with sender attribution

**Import Requirements**:
- ✅ **MUST** accept storage implementation via dependency injection (world.storage)
- ✅ **MUST** accept LLM-related parameters only
- ❌ **MUST NOT** directly import storage modules
- ❌ **MUST NOT** handle storage instantiation
- ✅ **MUST** use provided storage interface for agent data updates

### 4. llm-manager.ts (LLM Integration)
**Primary Role**: LLM streaming and text generation

**Responsibilities**:
- Browser-safe LLM integration using AI SDK
- Streaming responses with SSE events
- Support for multiple LLM providers
- LLM call queuing and timeout management
- Agent activity tracking (LLM-related metrics only)

**Import Requirements**:
- ❌ **MUST NOT** handle storage operations
- ❌ **MUST NOT** directly import storage modules
- ❌ **MUST NOT** handle agent state persistence
- ✅ **MUST** focus solely on LLM operations
- ✅ **MUST** update LLM-related agent metrics (callCount, lastActive, lastLLMCall)

## Dependency Flow

```
managers.ts (orchestrator)
    ↓ static imports
    ├── events.ts
    ├── llm-manager.ts  
    └── storage-factory.ts
            ↓ dynamic imports
            ├── world-storage.ts
            ├── agent-storage.ts
            └── sqlite-storage.ts

managers.ts → obtains storage from storage-factory → passes to events.ts via world.storage
```

## Import Patterns

### Static Imports (managers.ts)
```typescript
import * as events from './events.js';
import * as llmManager from './llm-manager.js';
import * as storageFactory from './storage-factory.js';
```

### Dynamic Imports (storage-factory.ts)
```typescript
// For storage implementations only
const worldStorage = await import('./world-storage.js');
const agentStorage = await import('./agent-storage.js');
const sqliteStorage = await import('./sqlite-storage.js');
```

### Dependency Injection (events.ts)
```typescript
// Accepts storage via world.storage interface
await world.storage.saveAgent(worldId, agent);
```

## Data Flow Requirements

### Storage Operations
1. **managers.ts** obtains storage instance from **storage-factory.ts**
2. **managers.ts** creates world objects with storage interface attached
3. **events.ts** uses `world.storage` for all agent data persistence
4. **llm-manager.ts** does NOT handle any storage operations

### Agent State Management
1. **llm-manager.ts** updates LLM-related metrics (callCount, lastActive, lastLLMCall)
2. **events.ts** saves complete agent state using `world.storage.saveAgent()`
3. **managers.ts** coordinates agent lifecycle but delegates storage to injected implementation

### Event Processing
1. **events.ts** processes agent messages and manages memory
2. **events.ts** calls **llm-manager.ts** for LLM operations
3. **events.ts** saves agent state after all operations
4. **managers.ts** provides the event infrastructure via world.eventEmitter

## Environment Support

### Node.js Environment
- Full storage support via file-based or SQLite backends
- Dynamic loading of storage implementations
- Complete feature set

### Browser Environment  
- NoOp storage implementations
- Configuration injection for LLM providers
- Event-driven architecture maintained

## Validation Rules

### ✅ Required Patterns
1. Static imports in managers.ts for core modules
2. Dynamic imports in storage-factory.ts for storage implementations
3. Dependency injection of storage via world.storage
4. Storage responsibility centralized in events.ts
5. LLM-only responsibility in llm-manager.ts

### ❌ Prohibited Patterns
1. Dynamic imports of core modules in managers.ts
2. Direct storage imports in events.ts or llm-manager.ts
3. Storage logic in llm-manager.ts
4. Agent instance passing to events.ts (use storage interface)
5. Environment detection outside storage-factory.ts

## Migration and Compatibility

### From Previous Architecture
- Remove storage logic from llm-manager.ts
- Convert dynamic imports to static imports in managers.ts
- Ensure events.ts uses world.storage interface
- Maintain existing API surface for backward compatibility

### Testing Requirements
- All modules must be unit testable with mocked dependencies
- Storage implementations must be swappable without code changes
- Event isolation must be maintained across world instances

## Performance Considerations

### Static Import Benefits
- Eliminates dynamic import overhead for core modules
- Enables better bundling and tree-shaking
- Improves startup performance

### Dynamic Import Benefits (Storage)
- Environment-aware loading reduces bundle size
- Supports runtime storage backend switching
- Enables graceful degradation in unsupported environments

## Security Considerations

- Storage operations isolated to dedicated modules
- No credentials in LLM manager (configuration injection)
- Environment detection prevents unsafe operations
- Storage access controlled via unified interface

---

**Last Updated**: 2025-01-XX  
**Version**: 1.0  
**Status**: Implemented and Tested