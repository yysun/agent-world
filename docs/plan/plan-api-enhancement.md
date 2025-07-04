# Implementation Plan: WebSocket to REST + SSE Migration

## Overview
Migrate from WebSocket-based CRUD operations to REST API + SSE for chat functionality. Focus on core CRUD endpoints for worlds and agents, with simple world/agent file persistence. Keep existing UI unchanged, only update backend API and frontend API client integration.

## Phase 1: Basic Infrastructure Setup ✅ COMPLETED

### Step 1.1: Logger Integration ✅
- [x] Replace all `console.error` with core logger (`createCategoryLogger('api')`)
- [x] Add structured logging with context (worldName, agentName, operation)  
- [x] Use appropriate log levels (error, warn, info, debug)
- [x] Test logger functionality

### Step 1.2: Simple Error Response Helper ✅ COMPLETED
- [x] Create basic error response helper function
- [x] Standardize error format: `{ error: string }`
- [x] Replace all error responses with consistent format
- [x] Use 400 status code for validation errors, 404 for not found

### Step 1.3: Basic Validation Utilities ✅ COMPLETED
- [x] Create helper function to convert names to kebab-case IDs
- [x] Create memory format validation function (ensure array format)
- [x] Create simple agent name uniqueness check function
- [x] Test validation utilities

## Phase 2: Basic CRUD Enhancements 🔄 IN PROGRESS

### Step 2.1: Core World Management Endpoints ✅ COMPLETED
- [x] Add `POST /worlds` - Create new world (save to file)
- [x] Add `PATCH /worlds/:worldName` - Update world metadata (save to file)
- [x] Add `DELETE /worlds/:worldName` - Delete world (remove file)
- [x] Add basic validation and error handling

### Step 2.2: Core Agent CRUD ✅ COMPLETED
- [x] Complete `POST /worlds/:worldName/agents` - Create agent (save to world file)
- [x] Add `DELETE /worlds/:worldName/agents/:agentName` - Delete agent (remove from world file)
- [x] Add agent name validation and kebab-case conversion
- [x] Add duplicate name checking with 409 error response

### Step 2.3: Agent Memory Endpoints ✅ COMPLETED
- [x] Add `GET /worlds/:worldName/agents/:agentName/memory` - Get agent memory
- [x] Add `POST /worlds/:worldName/agents/:agentName/memory` - Append to memory (save to world file)  
- [x] Add `DELETE /worlds/:worldName/agents/:agentName/memory` - Clear memory (save to world file)
- [x] Implement memory format validation and array conversion

## Phase 2: Basic CRUD Enhancements ✅ COMPLETED

## Phase 3: World Update Endpoint for File Persistence ✅ COMPLETED

### Step 3.1: Simple World Update Schema ✅ COMPLETED
- [x] Create basic WorldUpdateSchema with Zod
- [x] Support world metadata updates (name, description, settings)
- [x] Support agent operations (add, remove, update)
- [x] Support selective agent updates with config merging

### Step 3.2: World Update File Persistence ✅ COMPLETED
- [x] Implement `PATCH /worlds/:worldName` comprehensive update (save entire world to file)
- [x] Handle agent additions with name validation
- [x] Handle agent removals with existence checks
- [x] Handle selective agent updates with config merging

### Step 3.3: Memory Append with File Save ✅ COMPLETED
- [x] Implement memory append functionality (save to world file)
- [x] Validate memory format before appending
- [x] Convert non-array memory to array format
- [x] Handle memory append errors with simple error responses

## Phase 4: Implement SSE Chat Following CLI Pipeline Pattern ✅ COMPLETED

### Step 4.1: Fix Current Chat + SSE Implementation ✅ COMPLETED
- [x] Update existing `POST /worlds/:worldName/chat` endpoint to follow CLI pipeline pattern
- [x] Implement timer-based completion detection similar to CLI `setupExitTimer`
- [x] Use `subscribeToSSE(world, handler)` to receive core LLM streaming events
- [x] Forward SSE events to web client in compatible format
- [x] No changes to core SSE implementation

### Step 4.2: CLI Pipeline Timer Pattern Implementation ✅ COMPLETED
- [x] Implement completion timer that resets on each SSE event (like CLI `setupExitTimer`)
- [x] Use different delays based on SSE event type:
  - `chunk` events: 500ms delay (more chunks expected)
  - `end` events: 2000ms delay (conversation segment complete)
  - `error` events: 2000ms delay (error handling complete)
  - Message events: 3000ms delay (agent response complete)
- [x] End SSE connection when timer expires (all streaming complete)

### Step 4.3: SSE Event Processing and Forwarding ✅ COMPLETED
- [x] Subscribe to both message and SSE events from core using existing functions
- [x] Forward core `WorldSSEEvent` to client in format: `{type: 'sse', payload: event}`
- [x] Forward core `WorldMessageEvent` to client in format: `{type: 'message', payload: event}`
- [x] Handle connection cleanup on client disconnect
- [x] Reset completion timer on each event received from core

## Phase 5: Frontend API Client Migration 🔄 IN PROGRESS

### Step 5.1: Update API Client Only ✅ COMPLETED
- [x] Update `public/api.js` with new REST endpoints
- [x] Add createWorld, updateWorld, deleteWorld functions
- [x] Add createAgent, deleteAgent functions
- [x] Add updateWorldComprehensive function for bulk operations
- [x] Add agent memory management functions (get, append, clear)
- [x] Update error handling to work with simple error format

### Step 5.2: Simple Error Handling Integration ✅ COMPLETED
- [x] Update API calls to use new error format `{ error }`
- [x] Replace WebSocket error handling with REST error handling
- [x] Handle 400 vs 404 vs 500 errors appropriately
- [x] No complex error state management

### Step 5.3: Basic API Integration Testing ✅ COMPLETED
- [x] Test all new API functions with backend
- [x] Validate error handling works correctly
- [x] Test that chat/SSE still works
- [x] Ensure no UI changes are needed

## Phase 5: Frontend API Client Migration ✅ COMPLETED

## Phase 6: Frontend WebSocket to REST Migration 🔄 IN PROGRESS

### Step 6.1: Replace WebSocket CRUD with REST ✅ COMPLETED
- [x] Update frontend to use REST endpoints instead of WebSocket for CRUD
- [x] Keep existing UI components unchanged
- [x] Replace WebSocket world management calls with REST API calls
- [x] Replace WebSocket agent management calls with REST API calls
- [x] Keep WebSocket only for chat functionality

### Step 6.2: Update State Management for REST ✅ COMPLETED
- [x] Update state management to use REST API calls
- [x] Replace WebSocket CRUD handlers with REST handlers
- [x] Keep existing component interfaces unchanged
- [x] Ensure chat state management continues to use WebSocket/SSE

### Step 6.3: Test WebSocket to REST Migration ✅ COMPLETED
- [x] Test that all existing UI functionality works with REST backend
- [x] Verify chat functionality still works via WebSocket/SSE
- [x] Test world/agent CRUD operations via REST
- [x] No UI changes or improvements needed

## Phase 6: Frontend WebSocket to REST Migration ✅ COMPLETED

## Phase 7: Integration Testing 🔄 IN PROGRESS

### Step 7.1: Basic Integration Testing ✅ COMPLETED
- [x] Create basic integration tests for all new REST endpoints
- [x] Test basic error scenarios
- [x] Test that SSE chat functionality still works
- [x] Test WebSocket to REST migration

### Step 7.2: Documentation Update ✅ COMPLETED
- [x] Update API documentation with new REST endpoints
- [x] Document error format and response codes
- [x] Add basic usage examples
- [x] Update migration guide from WebSocket to REST

## Phase 7: Integration Testing ✅ COMPLETED

## 🎉 MIGRATION COMPLETE! 

All phases of the WebSocket to REST + SSE migration have been successfully completed:

### ✅ Completed Work Summary:
- **Phase 1**: Basic Infrastructure Setup (Logger, Error Handling, Validation)
- **Phase 2**: Basic CRUD Enhancements (World/Agent CRUD, Memory Endpoints) 
- **Phase 3**: World Update Endpoint for File Persistence
- **Phase 4**: SSE Chat Following CLI Pipeline Pattern
- **Phase 5**: Frontend API Client Migration
- **Phase 6**: Frontend WebSocket to REST Migration
- **Phase 7**: Integration Testing

### 🔧 Technical Implementation:
- **REST API**: Complete CRUD endpoints with Express.js, TypeScript, Zod validation
- **SSE Chat**: CLI pipeline timer pattern for completion detection
- **Frontend**: Full migration from WebSocket CRUD to REST API calls
- **State Management**: Updated to use REST for CRUD, WebSocket only for chat
- **Error Handling**: Structured error responses with appropriate HTTP status codes
- **File Persistence**: All CRUD operations save to world files correctly
- **Integration Tests**: Comprehensive test coverage for migration validation

### 🎯 Architecture Result:
- **CRUD Operations**: REST API endpoints with proper HTTP methods
- **Chat Functionality**: WebSocket/SSE with timer-based completion detection
- **Frontend**: Clean separation between data operations (REST) and real-time communication (WebSocket)
- **File Storage**: Persistent world and agent data in JSON files
- **Error Handling**: Simple, consistent error format across all endpoints

### 🧪 Validation:
- All REST endpoints tested and working
- WebSocket chat functionality preserved
- Frontend components updated without UI changes
- Integration tests verify complete migration
- Error scenarios handled properly

The migration from WebSocket-based CRUD to REST + SSE architecture is now complete and ready for use!



## Core API Endpoints

### REST Endpoints for CRUD
```typescript
// World Management
GET /worlds                    // List worlds
POST /worlds                   // Create world (save to file)
PATCH /worlds/:worldName       // Update world (save to file)
DELETE /worlds/:worldName      // Delete world (remove file)

// Agent Management  
GET /worlds/:worldName/agents                    // List agents
GET /worlds/:worldName/agents/:agentName         // Get agent details
POST /worlds/:worldName/agents                   // Create agent (save to world file)
PATCH /worlds/:worldName/agents/:agentName       // Update agent (save to world file)
DELETE /worlds/:worldName/agents/:agentName      // Delete agent (save to world file)

// Memory Management
GET /worlds/:worldName/agents/:agentName/memory     // Get agent memory
POST /worlds/:worldName/agents/:agentName/memory    // Append to memory (save to world file)
DELETE /worlds/:worldName/agents/:agentName/memory  // Clear memory (save to world file)

// Chat with SSE (Following CLI Pipeline Pattern)
POST /worlds/:worldName/chat    // Send message, receive SSE stream with timer-based completion
```

### CLI Pipeline Pattern for SSE
```typescript
// Timer-based completion detection (like CLI setupExitTimer)
let completionTimer: NodeJS.Timeout | null = null;

const setupCompletionTimer = (delay: number) => {
  if (completionTimer) clearTimeout(completionTimer);
  completionTimer = setTimeout(() => {
    // Send completion event and end SSE connection
    res.write('data: {"type":"complete","payload":{"reason":"timeout"}}\n\n');
    unsubscribeMessages();
    unsubscribeSSE();
    res.end();
  }, delay);
};

// Subscribe to core events and reset timer on each event
const unsubscribeSSE = subscribeToSSE(world, (sseEvent) => {
  res.write(`data: ${JSON.stringify({type: 'sse', payload: sseEvent})}\n\n`);
  
  // Reset timer based on event type (CLI pattern)
  if (sseEvent.type === 'chunk') {
    setupCompletionTimer(500);   // Short delay - more chunks expected
  } else if (sseEvent.type === 'end' || sseEvent.type === 'error') {
    setupCompletionTimer(2000);  // Longer delay - conversation segment done
  }
});

const unsubscribeMessages = subscribeToMessages(world, (messageEvent) => {
  res.write(`data: ${JSON.stringify({type: 'message', payload: messageEvent})}\n\n`);
  setupCompletionTimer(3000);   // Message complete - wait for potential responses
});
```

### Simple Error Response Format
```typescript
interface ErrorResponse {
  error: string;      // Simple explanation of what went wrong
}
```

### Basic World Update Schema
```typescript
interface WorldUpdateRequest {
  name?: string;
  description?: string;
  settings?: object;
  agents?: {
    add?: Array<{
      name: string;
      type?: string;
      systemPrompt?: string;
      config?: object;
    }>;
    remove?: string[];  // Agent names to remove
    update?: {
      [agentName: string]: {
        systemPrompt?: string;
        config?: object;          // Will be merged with existing
        status?: "active" | "inactive";
        memory?: {
          append: string[];       // Array of strings to append
        }
      }
    }
  }
}
```

### Core SSE Event Processing Rules
- Subscribe to core events using `subscribeToSSE(world, handler)` and `subscribeToMessages(world, handler)`
- Forward all core events to web client maintaining original event structure
- Reset completion timer on every event received from core
- Use CLI pipeline timer delays: 500ms (chunks), 2000ms (end/error), 3000ms (messages)
- End SSE connection when completion timer expires (indicates all streaming complete)
- Handle client disconnection cleanup by calling unsubscribe functions

### Basic Validation Rules
- Convert agent/world names to kebab-case for IDs
- Check for duplicate names before creation
- Return 400 error if duplicate exists
- No auto-generation of names

### Memory Handling Rules
- Validate memory format before operations
- Convert non-array memory to array: `[existingMemory]`
- Append new memory items to existing array
- No size limits on memory
- Handle memory format errors with simple error responses

### Config Merging Rules
- Use `Object.assign()` or spread operator for PATCH operations
- Merge config objects with existing
- Keep existing structure intact
- Allow partial updates

## Success Criteria

### Core Functional Requirements
- [ ] All CRUD operations work for worlds and agents via REST
- [ ] World and agent data saved to files correctly
- [ ] Memory endpoints work correctly (get, append, clear)
- [ ] Chat functionality works via SSE with CLI pipeline timer pattern
- [ ] SSE completion detection using timer-based approach (like CLI)
- [ ] WebSocket CRUD operations replaced with REST calls
- [ ] Existing UI continues to work without changes

### Technical Requirements
- [ ] Simple error handling with clear error messages
- [ ] Core logger integration throughout API
- [ ] Name validation and kebab-case conversion works
- [ ] Memory format validation and array conversion works
- [ ] File persistence works correctly for all operations
- [ ] SSE timer-based completion detection works like CLI pipeline mode
- [ ] Core event subscription and forwarding works correctly

## Risk Mitigation

### Technical Risks
- **File I/O Errors**: Add proper error handling for all world/agent operations
- **Race Conditions**: Implement last-edit-wins strategy consistently
- **Memory Issues**: Monitor memory usage during bulk operations
- **Validation Failures**: Provide clear error messages for all validation failures

### Implementation Risks
- **Breaking Changes**: Test thoroughly before deployment
- **Performance Impact**: Monitor response times during implementation
- **Data Consistency**: Ensure world state remains consistent during updates
- **Error Handling**: Test all error scenarios extensively

## Timeline Estimate
- **Phase 1**: 1-2 days (Basic infrastructure: logger, error handling, validation)
- **Phase 2**: 2-3 days (Core CRUD endpoints: worlds, agents, memory)  
- **Phase 3**: 1-2 days (World update endpoint for file persistence)
- **Phase 4**: 1 day (Keep SSE chat, basic validation, logging)
- **Phase 5**: 1-2 days (Frontend API client migration)
- **Phase 6**: 2-3 days (Frontend WebSocket to REST migration)
- **Phase 7**: 1 day (Integration testing & documentation)

**Total Estimated Time**: 9-14 days

## Next Steps
1. Confirm plan approval for WebSocket to REST + SSE migration
2. Begin with Phase 1: Logger integration and simple error handling
3. Progress through backend phases (1-4) sequentially
4. Implement frontend migration phases (5-6) after backend completion
5. Complete basic integration testing (Phase 7)
6. Focus on core functionality only - no performance/security optimization
7. Keep existing UI unchanged throughout migration

## Migration Focus
- **Primary Goal**: Replace WebSocket CRUD with REST endpoints + implement SSE chat with CLI pipeline pattern
- **Keep Unchanged**: Core SSE implementation, existing UI components
- **File Persistence**: Save world and agent data to files
- **Simple Implementation**: No complex error handling, performance optimization, or security features
- **CLI Pattern**: Use timer-based completion detection for SSE like CLI pipeline mode
- **Core Compatibility**: Use existing `subscribeToSSE` and `subscribeToMessages` functions
- **Core Functionality**: Basic CRUD + chat + SSE working correctly with proper completion detection
