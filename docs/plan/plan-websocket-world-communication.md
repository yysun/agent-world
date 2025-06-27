# WebSocket World Communication Implementation Plan

## Overview
Implement WebSocket support for private client-server communication with world-specific event buses, user folder structure, and multi-world support.

## Implementation Steps

### Phase 1: Foundation Setup

#### Step 1.1: Install WebSocket Dependencies
- [ ] Install `ws` library: `npm install ws @types/ws`
- [ ] Install `uuid` library for client ID generation: `npm install uuid @types/uuid`
- [ ] Update package.json dependencies

#### Step 1.2: Create WebSocket Type Definitions
- [ ] Create `src/websocket-types.ts` with all WebSocket message interfaces
- [ ] Add connection management types
- [ ] Add user session types
- [ ] Export types from main types file

#### Step 1.3: Update World Loading Logic
- [ ] Modify world loading to distinguish between template and user worlds based on file path
- [ ] Add template protection in world functions (prevent modification of `data/worlds/` content)
- [ ] Update world validation to check folder location

### Phase 2: User Folder Structure

#### Step 2.1: Create User Manager Module
- [ ] Create `src/user-manager.ts` module with functions:
  - `createUserSession(userId: string, templateName: string, worldName: string): Promise<UserSession>`
  - `getUserSession(userId: string, worldName: string): Promise<UserSession | null>`
  - `deleteUserSession(userId: string): Promise<void>`
  - `listUserWorlds(userId: string): Promise<string[]>`
  - `saveUserWorld(userId: string, worldName: string, world: WorldState): Promise<void>`
  - `cloneWorldForUser(userId: string, templateName: string, worldName: string): Promise<WorldState>`

#### Step 2.2: Create User Directory Management Functions
- [ ] Create `src/user-storage.ts` module with functions:
  - `createUserDirectory(userId: string): Promise<string>`
  - `getUserWorldPath(userId: string, worldName: string): string`
  - `deleteUserDirectory(userId: string): Promise<void>`
  - `userWorldExists(userId: string, worldName: string): Promise<boolean>`

#### Step 2.3: Implement World Cloning System
- [ ] Create `src/world-cloning.ts` module with functions:
  - `cloneWorldFromTemplate(templateName: string, userId: string, worldName: string): Promise<WorldState>`
  - `loadUserWorld(userId: string, worldName: string): Promise<WorldState>`
  - `saveUserWorld(userId: string, worldName: string, world: WorldState): Promise<void>`
  - `isValidTemplate(templateName: string): Promise<boolean>`

#### Step 2.4: Keep Existing World API Unchanged
- [ ] Ensure user-manager handles all user-specific logic internally
- [ ] Use existing world functions without modification
- [ ] User-manager should call existing `loadWorld()`, `createWorld()`, etc. functions
- [ ] No changes needed to `src/world-persistence.ts`, `src/world.ts`, or other core world modules

### Phase 3: WebSocket Server Implementation

#### Step 3.1: Create WebSocket Connection Manager
- [ ] Create `server/websocket-manager.ts` module with:
  - `interface ClientConnection` type definition
  - `connections: Map<string, ClientConnection>` registry
  - Connection lifecycle management functions
  - Client ID generation and validation

#### Step 3.2: Implement WebSocket Message Handlers
- [ ] Create `server/websocket-handlers.ts` module with handlers:
  - `handleWorldSelect(clientId: string, payload: WorldSelectPayload): Promise<void>`
  - `handleChatSend(clientId: string, payload: ChatSendPayload): Promise<void>`
  - `handleAgentUpdate(clientId: string, payload: AgentUpdatePayload): Promise<void>`
  - `handleWorldReload(clientId: string, payload: WorldReloadPayload): Promise<void>`
  - `handleEventSubscribe(clientId: string, payload: EventSubscribePayload): Promise<void>`
- [ ] Integrate handlers with user-manager functions
- [ ] Add proper error handling and validation

#### Step 3.3: Implement Event Mapping System
- [ ] Create `server/websocket-events.ts` module with:
  - Event bus to WebSocket message mapping functions
  - WebSocket message to server action mapping
  - Event filtering and routing logic
  - Real-time event streaming

#### Step 3.4: Create WebSocket Server
- [ ] Create `server/websocket-server.ts` module with:
  - WebSocket server initialization
  - Connection handling and cleanup
  - Message parsing and routing
  - Error handling and logging

### Phase 4: Server Integration

#### Step 4.1: Integrate WebSocket with Express Server
- [ ] Update `server/index.ts` to include WebSocket server
- [ ] Import WebSocket modules from `server/` directory
- [ ] Add WebSocket endpoint alongside REST API
- [ ] Ensure proper server lifecycle management
- [ ] Add WebSocket health checks

#### Step 4.2: Update Event Bus Integration
- [ ] Modify event bus to support world-specific subscriptions
- [ ] Add WebSocket clients to event routing
- [ ] Implement event filtering per client connection
- [ ] Ensure proper event cleanup on disconnect

#### Step 4.3: Add Connection State Management
- [ ] Implement connection registry with world mapping
- [ ] Add connection heartbeat/ping mechanism
- [ ] Handle connection timeouts and recovery
- [ ] Add connection statistics and monitoring

### Phase 5: Testing and Validation

#### Step 5.1: Create Unit Tests
- [ ] Test user manager functionality
- [ ] Test world cloning functionality
- [ ] Test WebSocket message handlers
- [ ] Test event mapping and routing
- [ ] Test connection management

#### Step 5.2: Create Integration Tests
- [ ] Test complete WebSocket flow
- [ ] Test multi-user scenarios
- [ ] Test anonymous user cleanup
- [ ] Test world persistence and loading

#### Step 5.3: Performance Testing
- [ ] Test concurrent connections
- [ ] Test message throughput
- [ ] Test memory usage with anonymous users
- [ ] Test world loading performance

### Phase 6: Documentation and Cleanup

#### Step 6.1: Update Documentation
- [ ] Document user manager API
- [ ] Document WebSocket API endpoints
- [ ] Create server integration guide
- [ ] Document user folder structure
- [ ] Add troubleshooting guide

#### Step 6.2: Code Cleanup and Optimization
- [ ] Remove any unused code
- [ ] Optimize WebSocket message handling
- [ ] Add comprehensive error handling
- [ ] Finalize logging and monitoring

## Technical Implementation Details

### User Manager Implementation
```typescript
// User session management - handles all user-specific logic
interface UserSession {
  userId: string;
  worldName: string;
  templateName: string;
  world: WorldState;
  isPersistent: boolean;
  createdAt: Date;
  lastAccessed: Date;
}

// User manager functions - uses existing world API internally
async function createUserSession(userId: string, templateName: string, worldName: string): Promise<UserSession> {
  // 1. Use existing loadWorld() to load template
  // 2. Copy to user directory using user-storage functions
  // 3. Use existing createWorld() with user directory path
  // 4. Return UserSession with world instance
}

async function getUserSession(userId: string, worldName: string): Promise<UserSession | null>;
async function saveUserWorld(userId: string, worldName: string, world: WorldState): Promise<void>;
```

### Server Module Organization
```
server/
├── index.ts                    # Main Express server
├── websocket-server.ts         # WebSocket server setup
├── websocket-manager.ts        # Connection management
├── websocket-handlers.ts       # Message handlers
└── websocket-events.ts         # Event mapping

src/
├── user-manager.ts             # User session management (core logic)
├── user-storage.ts             # User directory operations
├── world-cloning.ts            # World cloning utilities
└── ... (existing world API unchanged)
```

### Connection Flow Implementation
```typescript
// Connection registry
interface ClientConnection {
  clientId: string;
  world: WorldState;
  subscriptions: Array<() => void>;
  userId: string;
  worldName: string;
  templateName: string;
  isPersistent: boolean;
  connectedAt: Date;
}

const connections = new Map<string, ClientConnection>();
```

### World Cloning Implementation
```typescript
async function cloneWorldFromTemplate(
  templateName: string, 
  userId: string, 
  worldName: string
): Promise<WorldState> {
  // 1. Load template from data/worlds/{templateName}/
  // 2. Create user directory data/users/{userId}/worlds/{worldName}/
  // 3. Copy template files to user directory
  // 4. Return world instance (no config modification needed)
}
```

### Event Mapping Implementation
```typescript
function mapEventToWebSocket(event: Event, clientId: string): WebSocketMessage | null {
  switch (event.type) {
    case EventType.SSE:
      return createChatResponseMessage(event);
    case EventType.MESSAGE:
      return createEventStreamMessage(event);
    case EventType.WORLD:
      return createSystemMessage(event);
    default:
      return null;
  }
}
```

## Dependencies and Prerequisites

### Required Packages
- `ws` - WebSocket server implementation
- `@types/ws` - TypeScript definitions for ws
- `uuid` - UUID generation for client IDs
- `@types/uuid` - TypeScript definitions for uuid

### Existing Code Dependencies
- Event bus system (`src/event-bus.ts`) - **unchanged**
- World management (`src/world.ts`) - **unchanged**
- Agent management (`src/agent.ts`) - **unchanged**
- Storage system (`src/storage.ts`) - **unchanged**
- Type definitions (`src/types.ts`) - **unchanged**
- User manager (new - `src/user-manager.ts`) - **uses existing world API**

## Success Criteria

### Functional Requirements
- [ ] WebSocket connections establish successfully
- [ ] World selection and cloning works correctly
- [ ] Real-time messaging functions properly
- [ ] Agent updates sync in real-time
- [ ] Anonymous user cleanup works
- [ ] Multi-world support functions

### Non-Functional Requirements
- [ ] Handles 10+ concurrent connections
- [ ] Message latency < 100ms
- [ ] Memory usage stable with anonymous users
- [ ] No memory leaks on disconnect
- [ ] Clean error handling and recovery

## Risk Mitigation

### Potential Issues
1. **Memory Leaks**: Implement proper cleanup on disconnect
2. **Event Flooding**: Add message rate limiting if needed
3. **World Conflicts**: Use last-edit-wins strategy
4. **Connection Drops**: Implement reconnection logic on client
5. **Storage Errors**: Add comprehensive error handling for file operations

### Rollback Plan
- Keep REST API functional during implementation
- Implement feature flags for WebSocket functionality
- Maintain backward compatibility
- Create database migration scripts if needed

## Estimated Timeline
- **Phase 1-2**: 3-4 days (Foundation, user management, and folder structure)
- **Phase 3-4**: 3-4 days (WebSocket server implementation and integration)
- **Phase 5-6**: 3-4 days (Testing, documentation, and cleanup)

**Total Estimated Time**: 9-12 days (Server-side only)
