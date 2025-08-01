# Implementation Plan: Simplified Core-Centric Chat Management

## Overview
Simplify the chat session management by moving all complexity to the core module and eliminating unnecessary frontend logic, session storage utilities, and redundant API endpoints.

## Current Problems
- Over-complicated frontend session storage management
- Unnecessary API endpoints for auto-save and restoration
- Duplicate state management between core and frontend
- Complex frontend triggers for auto-save
- Manual URL management and session storage cleanup

## Simplified Architecture

### Core Principles
1. **Core Handles Everything**: All chat logic in core business layer
2. **Auto-Restore by Default**: `getWorld()` automatically restores last chat
3. **Auto-Save on Every Message**: `publishMessage()` automatically saves state
4. **Fresh World Option**: `getWorldFresh()` for new chat sessions
5. **Simple Frontend**: Frontend just displays state, no complex logic

## Implementation Plan

### Phase 1: Core Enhancement ✅
**Objective**: Enhance core functions to handle all chat management automatically

#### 1.1 Enhance getWorld() Function
**File**: `core/managers.ts`
- [x] Auto-restore last chat in `getWorld()` function
- [x] Load agent memory from last chat snapshot
- [x] Return complete world with restored conversation state
- [x] Handle case when no previous chat exists

#### 1.2 Add getWorldFresh() Function  
**File**: `core/managers.ts`
- [x] Create `getWorldFresh()` function for new chat sessions
- [x] Load world config and agent configs without memory
- [x] Initialize agents with empty memory for fresh start
- [x] Export function for API use

#### 1.3 Enhance publishMessage() Auto-Save
**File**: `core/events.ts`
- [x] Add auto-save logic to existing `publishMessage()` function
- [x] Create or update "current chat" automatically
- [x] Save complete world state after each message
- [x] Handle both user and agent messages

### Phase 2: API Simplification ✅
**Objective**: Remove unnecessary endpoints and add simplified ones

#### 2.1 Remove Redundant Endpoints
**File**: `server/api.ts`
- [x] Remove `GET /worlds/:worldName/chats/last`
- [x] Remove `POST /worlds/:worldName/chats/auto-restore`
- [x] Remove `POST /worlds/:worldName/chats/auto-save`
- [x] Clean up unused imports and validation schemas

#### 2.2 Add Fresh World Endpoint
**File**: `server/api.ts`
- [x] Add `GET /worlds/:worldName/fresh` endpoint
- [x] Use `getWorldFresh()` core function
- [x] Return world with empty agent memory

### Phase 3: Frontend Simplification ✅
**Objective**: Remove complex frontend logic and session storage

#### 3.1 Remove Session Storage
**Files**: Remove `web/src/utils/chatSessionStorage.ts`
- [x] Delete entire session storage utility file
- [x] Remove all session storage references
- [x] Remove auto-save triggers from message handlers

#### 3.2 Simplify World Route Handler
**File**: `web/src/pages/World.update.ts`
- [x] Simplify `/World` route handler
- [x] Use `api.getWorld()` for normal loading (auto-restores last chat)
- [x] Use `api.getWorldFresh()` for new chat sessions
- [x] Remove complex auto-save and session storage logic

#### 3.3 Remove Complex Handlers
**File**: `web/src/pages/World.update.ts`
- [x] Remove `auto-save-chat` handler
- [x] Remove session storage updates from message handlers
- [x] Simplify navigation handlers
- [x] Remove auto-save imports and triggers

### Phase 4: API Client Cleanup ✅
**Objective**: Clean up frontend API client

#### 4.1 Remove Auto-Save Functions
**File**: `web/src/api.ts`
- [x] Remove `getLastActiveChat()` function
- [x] Remove `autoRestoreLastChat()` function  
- [x] Remove `triggerChatAutoSave()` function

#### 4.2 Add Fresh World Function
**File**: `web/src/api.ts`
- [x] Add `getWorldFresh()` function
- [x] Call new fresh world endpoint

## Implementation Details

### Core Function Signatures
```typescript
// Enhanced auto-restore world loading
export async function getWorld(rootPath: string, worldId: string): Promise<World | null>

// Fresh world for new chat sessions  
export async function getWorldFresh(rootPath: string, worldId: string): Promise<World | null>

// Enhanced auto-save message publishing
export function publishMessage(world: World, content: string, sender: string): void
```

### Simplified API Endpoints
```typescript
GET /worlds/:worldName        // Auto-restores last chat
GET /worlds/:worldName/fresh  // Fresh world with no memory
// Removed: /chats/last, /chats/auto-restore, /chats/auto-save
```

### Simplified Frontend
```typescript
'/World': async function* (state, worldName, chatId) {
  if (chatId === 'new') {
    const world = await api.getWorldFresh(worldName);
  } else {
    const world = await api.getWorld(worldName); // Auto-restores
  }
}
```

## Benefits

### ✅ Simplified Architecture
- **Single Responsibility**: Core handles all chat logic
- **No Duplication**: Eliminate duplicate state management
- **Automatic**: No manual triggers or complex frontend logic

### ✅ Better Performance  
- **Fewer API Calls**: Auto-save happens in core, no API round-trips
- **No Session Storage**: Eliminate browser storage management
- **Simpler State**: Less frontend state to manage

### ✅ Enhanced Reliability
- **Core Persistence**: All persistence handled in reliable core layer
- **No Lost Data**: Auto-save happens on every message automatically
- **Consistent State**: Single source of truth in core

### ✅ Maintainability
- **Less Code**: Remove hundreds of lines of complex frontend logic
- **Clear Separation**: Core = business logic, Frontend = display
- **Easier Testing**: Test business logic in core, not UI interactions

## Migration Strategy

### Backward Compatibility
- Existing world loading continues to work
- Chat history UI components remain functional  
- No breaking changes to existing functionality

### Gradual Cleanup
1. **Phase 1-2**: Add new core functions, keep old ones
2. **Phase 3-4**: Switch frontend to use new functions
3. **Phase 5**: Remove old functions and endpoints (future)

## Success Metrics

### Code Reduction
- **Remove**: ~300 lines of session storage utilities
- **Remove**: ~150 lines of auto-save frontend logic
- **Remove**: ~100 lines of redundant API endpoints
- **Add**: ~100 lines of enhanced core logic
- **Net**: ~450 lines removed, much simpler architecture

### Performance Improvement
- **Fewer API calls**: Auto-save happens in-process
- **No browser storage**: Eliminate session storage overhead
- **Faster loading**: Direct core restoration vs multi-step frontend logic

### Reliability Enhancement
- **Single source of truth**: Core handles all persistence
- **No client-side state issues**: Eliminate session storage edge cases
- **Automatic persistence**: No missed auto-save opportunities

This plan transforms the over-complicated chat management into a clean, core-centric architecture where the business logic lives where it belongs and the frontend focuses on what it does best - displaying the current state.
