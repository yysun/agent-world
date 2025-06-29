# Requirements: Remove Environment Variables & World-Only Access

## Overview
Refactor the agent-world system to eliminate environment variable dependencies and enforce world-mediated access to all agent operations, creating a clean npm package with minimal public API surface.

## Core Requirements

### 1. Environment Variable Elimination
- **Remove `AGENT_WORLD_ID`**: Replace with explicit `worldId` parameters
- **Remove `AGENT_WORLD_DATA_PATH`**: Replace with explicit `rootPath` parameters
- **No global state**: All context passed explicitly through function parameters

### 2. World-Mediated Access Pattern
- **Single access point**: All agent operations must go through World objects
- **No direct imports**: Prevent direct access to agent-manager and agent-storage
- **Consistent state**: Runtime agent map always synchronized with operations
- **EventEmitter integration**: CLI/server subscribe to world events
- **Agent configuration management**: World interface provides `saveAgentConfig()` to save agent metadata without memory

### 3. Public API Surface
```typescript
// Public exports only
export {
  createWorld,
  getWorld, 
  updateWorld,
  deleteWorld,
  listWorlds,
  getWorldConfig,
  type World,
  type CreateWorldParams,
  type UpdateWorldParams,
  type WorldInfo
} from './world-manager.js';

export {
  type Agent,
  type AgentMessage,
  type CreateAgentParams,
  type UpdateAgentParams
} from './types.js';
```

### 4. Breaking Changes Acceptance
- **Major version bump**: Breaking changes are acceptable
- **Migration required**: Existing code must be updated
- **No backward compatibility**: Clean break for better architecture

## Technical Implementation

### Phase 1: Test Suite Creation
- Create comprehensive test suite using world-only patterns
- Establish testing patterns for new architecture
- No migration of existing tests initially

### Phase 2: Core Module Updates

#### Agent Manager Changes
- Add `worldId: string` parameter to all functions
- Remove `getWorldId()` function and environment variable usage
- Move to internal-only access (no public exports)

#### Agent Storage Changes  
- Add `worldId: string` parameter to all functions
- Remove any environment variable dependencies
- Move to internal-only access (no public exports)

#### World Manager Changes
- Add `rootPath: string` parameter to world functions
- Remove `getRootDirectory()` environment variable usage
- Pass `world.id` to all agent-manager calls
- Remove environment variable manipulation in world methods
- Add `saveAgentConfig(agentId: string)` method to World interface for saving agent metadata without memory

### Phase 3: Package Structure
```
/core
  index.ts           - Public API exports (world-manager functions and types)
  world-manager.ts   - Public world management functions
  types.ts           - Public type definitions
  agent-manager.ts   - Internal agent operations (not exported)
  agent-storage.ts   - Internal storage operations (not exported)
  agent-events.ts    - Internal event handling (not exported)
  utils.ts           - Internal utilities (not exported)
  world-storage.ts   - Internal world storage (not exported)
index.ts             - Main package exports (renamed from lib.ts)
package.json         - Updated with bin commands for CLI and server
```

### Phase 4: Package Distribution
```
npm scripts:
- npm start           - Start CLI interface (default)
- npm run server      - Start web server only
- npm run cli         - Start CLI interface (alias)
- npm run dev         - Development mode with watching

bin commands:
- agent-world         - CLI interface
- agent-world-server  - Web server
```

### Phase 4: Migration Support
- CLI holds world objects and subscribes to EventEmitter
- Server holds world objects and subscribes to EventEmitter
- All external code uses world-mediated access only

## Implementation Approach

### Phased Rollout
1. **Phase 1**: Create new test patterns
2. **Phase 2**: Update core modules  
3. **Phase 3**: Package restructuring
4. **Phase 4**: CLI/server migration (separate effort)

### No Runtime Validation
- Rely on TypeScript for compile-time safety
- Use module structure for access control
- Focus on performance over runtime checks

### Parameter Passing Strategy
- `worldId` passed explicitly to agent operations
- `rootPath` passed explicitly to world operations  
- No hidden dependencies or global state
- Clear, traceable data flow

## Success Criteria

### Functional
- ✅ No environment variables used in core operations
- ✅ All agent operations go through world objects
- ✅ Clean, minimal public API surface
- ✅ EventEmitter integration for CLI/server
- ✅ Comprehensive test coverage with new patterns

### Technical
- ✅ TypeScript compile-time safety maintained
- ✅ No circular dependencies
- ✅ Performance maintained (no runtime validation overhead)
- ✅ Clear separation between public and internal APIs
- ✅ Package exports properly configured

### Architectural
- ✅ Single source of truth for agent operations (World objects)
- ✅ Clean parameter passing without global state
- ✅ Testable, predictable code paths
- ✅ Ready for npm package distribution
- ✅ Foundation for future EventBus integration

## Out of Scope
- Migration of existing tests (will be separate effort)
- CLI command implementation changes (separate effort)  
- Server endpoint implementation changes (separate effort)
- Backward compatibility support
- Runtime validation or access control checks
