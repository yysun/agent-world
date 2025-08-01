# World-Chat Architecture Implementation Plan

## Requirements Analysis

### Core Requirements
1. **One-to-Many Relationship**: World ↔ Chats (one world can have multiple chats)
2. **Current Chat State**: World should track `currentChatId` for active chat session
3. **Auto-Restore**: When loading world, automatically restore latest chat and set as current
4. **Chat Loading**: `world.loadChat(chatId)` to switch between chats within a world
5. **New Chat Creation**: `world.newChat()` to create fresh chat session and set as current
6. **Auto-Save Integration**: World state should be persisted to chat storage automatically
7. **API Endpoint**: `POST /worlds/:worldName/new-chat` that returns world with updated currentChatId

## Architecture Overview

### Enhanced World-Chat Relationship
```typescript
interface World {
  // ... existing properties
  currentChatId: string | null;  // NEW: Track active chat
  
  // NEW: Chat management methods
  loadChat(chatId: string): Promise<void>;     // Switch to existing chat
  newChat(): Promise<string>;                  // Create new chat, returns chatId
  getCurrentChat(): Promise<WorldChat | null>; // Get current active chat
  saveCurrentState(): Promise<void>;           // Auto-save world state to current chat
}

// One-to-Many Relationship
World (1) ←→ (Many) Chats
  ↓
currentChatId points to active chat
```

### Data Flow Architecture
```
Frontend → API → Core World Methods → Storage Layer
    ↓         ↓         ↓                 ↓
UI State  Endpoints  Business Logic  Persistence
    ↑         ↑         ↑                 ↑
    ←─────────←─────────←─────────────────←
         Auto-restore & State Sync
```

## Implementation Plan

### Phase 1: Core Type & Interface Updates

#### 1.1 Update World Interface (`core/types.ts`)
```typescript
export interface World {
  // ... existing properties
  currentChatId: string | null;  // NEW: Track active chat
  
  // NEW: Chat management methods
  loadChat(chatId: string): Promise<void>;
  newChat(): Promise<string>;
  getCurrentChat(): Promise<WorldChat | null>;
  saveCurrentState(): Promise<void>;
}
```

#### 1.2 Update WorldData Interface (`core/world-storage.ts`)
```typescript
export interface WorldData {
  // ... existing properties
  currentChatId?: string | null;  // NEW: Persist current chat reference
}
```

### Phase 2: Core Implementation (`core/managers.ts`)

#### 2.1 Enhanced `getWorld()` Function
```typescript
export async function getWorld(rootPath: string, worldId: string): Promise<World | null> {
  // 1. Load world data
  // 2. Auto-restore latest chat if no currentChatId
  // 3. Set currentChatId to latest chat
  // 4. Restore agent memory from current chat snapshot
  // 5. Return world with chat state restored
}
```

#### 2.2 Implement World Chat Methods
```typescript
// Add to worldDataToWorld function
world.loadChat = async (chatId: string): Promise<void> => {
  // 1. Validate chatId exists
  // 2. Save current state to previous chat (if any)
  // 3. Load new chat snapshot
  // 4. Restore agent memory from new chat
  // 5. Update world.currentChatId
};

world.newChat = async (): Promise<string> => {
  // 1. Save current state to previous chat (if any)
  // 2. Generate new chatId
  // 3. Create new chat record
  // 4. Reset agent memories to fresh state
  // 5. Update world.currentChatId
  // 6. Auto-save initial state
  // 7. Return new chatId
};

world.getCurrentChat = async (): Promise<WorldChat | null> => {
  // 1. Return current chat if currentChatId exists
  // 2. Return null if no current chat
};

world.saveCurrentState = async (): Promise<void> => {
  // 1. Capture current agent memories
  // 2. Create world snapshot
  // 3. Update chat record with snapshot
  // 4. Update chat metadata (messageCount, updatedAt)
};
```

#### 2.3 Auto-Save Integration
```typescript
// Enhance publishMessageWithAutoSave
export async function publishMessageWithAutoSave(
  world: World, 
  content: string, 
  sender: string
): Promise<{ messageId: string; chatId?: string; autoSaved?: boolean }> {
  // 1. Publish message using core events
  // 2. Auto-save world state to current chat
  // 3. Update chat metadata
  // 4. Return result with chatId
}
```

### Phase 3: API Endpoint Implementation (`server/api.ts`)

#### 3.1 New Chat Creation Endpoint
```typescript
// POST /worlds/:worldName/new-chat
router.post('/worlds/:worldName/new-chat', async (req: Request, res: Response): Promise<void> => {
  try {
    const worldName = req.params.worldName;
    
    // 1. Get world instance
    const world = await getWorld(ROOT_PATH, worldName);
    if (!world) {
      sendError(res, 404, 'World not found', 'WORLD_NOT_FOUND');
      return;
    }
    
    // 2. Create new chat via world method
    const newChatId = await world.newChat();
    
    // 3. Return updated world with new currentChatId
    res.json({
      world: {
        id: world.id,
        name: world.name,
        description: world.description,
        currentChatId: world.currentChatId,
        // ... other world properties
        agents: Array.from(world.agents.values())
      },
      chatId: newChatId,
      success: true
    });
    
  } catch (error) {
    logger.error('Error creating new chat', { error: error.message, worldName });
    sendError(res, 500, 'Failed to create new chat', 'NEW_CHAT_ERROR');
  }
});
```

#### 3.2 Chat Loading Endpoint
```typescript
// POST /worlds/:worldName/load-chat/:chatId
router.post('/worlds/:worldName/load-chat/:chatId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { worldName, chatId } = req.params;
    
    // 1. Get world instance
    const world = await getWorld(ROOT_PATH, worldName);
    if (!world) {
      sendError(res, 404, 'World not found', 'WORLD_NOT_FOUND');
      return;
    }
    
    // 2. Load chat via world method
    await world.loadChat(chatId);
    
    // 3. Return updated world with loaded chat
    res.json({
      world: {
        // ... complete world object
        currentChatId: world.currentChatId
      },
      chatId: world.currentChatId,
      success: true
    });
    
  } catch (error) {
    logger.error('Error loading chat', { error: error.message, worldName, chatId });
    sendError(res, 500, 'Failed to load chat', 'LOAD_CHAT_ERROR');
  }
});
```

### Phase 4: Frontend Integration

#### 4.1 Update API Client (`web/src/api.ts`)
```typescript
// Create new chat
export async function createNewChat(worldName: string): Promise<{
  world: World;
  chatId: string;
  success: boolean;
}> {
  const response = await apiRequest(`/worlds/${encodeURIComponent(worldName)}/new-chat`, {
    method: 'POST'
  });
  return await response.json();
}

// Load existing chat
export async function loadChatById(worldName: string, chatId: string): Promise<{
  world: World;
  chatId: string;
  success: boolean;
}> {
  const response = await apiRequest(`/worlds/${encodeURIComponent(worldName)}/load-chat/${encodeURIComponent(chatId)}`, {
    method: 'POST'
  });
  return await response.json();
}
```

#### 4.2 Update Frontend Handlers (`web/src/pages/World.update.ts`)
```typescript
// Replace current create-new-chat handler
'create-new-chat': async function* (state: WorldComponentState): AsyncGenerator<WorldComponentState> {
  try {
    yield { ...state, loading: true };
    
    // Call new API endpoint
    const result = await api.createNewChat(state.worldName);
    
    if (result.success) {
      yield {
        ...state,
        loading: false,
        world: result.world,          // Updated world with currentChatId
        currentChat: {
          id: result.chatId,
          name: 'New Chat',
          isSaved: true,              // Already saved by server
          messageCount: 0,
          lastUpdated: new Date()
        },
        messages: [],                 // Fresh message state
        selectedAgent: null,
        activeAgent: null,
        userInput: ''
      };
      
      // Update URL with new chatId
      app.run('navigate-to-chat', state.worldName, result.chatId);
    }
    
  } catch (error: any) {
    yield {
      ...state,
      loading: false,
      error: error.message || 'Failed to create new chat'
    };
  }
},

// Add new load-chat handler
'load-chat-from-id': async function* (state: WorldComponentState, chatId: string): AsyncGenerator<WorldComponentState> {
  try {
    yield { ...state, loading: true };
    
    // Call load chat API endpoint
    const result = await api.loadChatById(state.worldName, chatId);
    
    if (result.success) {
      // Get chat details for UI
      const chatData = await api.getChat(state.worldName, chatId);
      
      yield {
        ...state,
        loading: false,
        world: result.world,          // Updated world with new currentChatId
        currentChat: {
          id: chatData.id,
          name: chatData.name,
          isSaved: true,
          messageCount: chatData.messageCount,
          lastUpdated: new Date(chatData.updatedAt)
        },
        messages: chatData.snapshot?.messages || []
      };
    }
    
  } catch (error: any) {
    yield {
      ...state,
      loading: false,
      error: error.message || 'Failed to load chat'
    };
  }
}
```

### Phase 5: Auto-Save Enhancement

#### 5.1 Enhanced Message Publishing
```typescript
// Update message sending to use world.saveCurrentState()
'send-message': async function* (state: WorldComponentState, content: string): AsyncGenerator<WorldComponentState> {
  // ... existing message sending logic
  
  // After message is sent and agents respond:
  if (state.world && state.world.currentChatId) {
    try {
      await state.world.saveCurrentState();
      logger.debug('Auto-saved world state to current chat', { 
        worldId: state.world.id, 
        chatId: state.world.currentChatId 
      });
    } catch (error) {
      logger.warn('Auto-save failed', { error: error.message });
    }
  }
}
```

#### 5.2 Periodic Auto-Save
```typescript
// Optional: Add periodic auto-save for long conversations
setInterval(async () => {
  if (currentWorld && currentWorld.currentChatId) {
    try {
      await currentWorld.saveCurrentState();
    } catch (error) {
      // Silent fail for background saves
    }
  }
}, 30000); // Every 30 seconds
```

## Implementation Benefits

### 1. Consistent State Management
- Server becomes single source of truth for world-chat relationships
- Eliminates frontend state synchronization issues
- Proper persistence of world state across chat sessions

### 2. Simplified Architecture
- Clear separation: Core handles business logic, Frontend handles UI
- Reduced complexity in frontend handlers
- Centralized chat management in world objects

### 3. Enhanced User Experience
- Seamless chat switching within worlds
- Automatic state restoration
- Consistent auto-save behavior

### 4. Scalability Preparation
- Foundation for multi-user scenarios
- Proper data modeling for future features
- Clean API design for extensibility

## Migration Strategy

### Phase 1: Core Implementation (Week 1)
- [ ] Update type definitions
- [ ] Implement world chat methods
- [ ] Enhance getWorld() with auto-restore
- [ ] Add auto-save integration

### Phase 2: API Development (Week 1)
- [ ] Add new chat creation endpoint
- [ ] Add chat loading endpoint
- [ ] Update existing endpoints as needed
- [ ] Add proper error handling

### Phase 3: Frontend Integration (Week 2)
- [ ] Update API client functions
- [ ] Replace frontend handlers
- [ ] Add new URL management
- [ ] Test complete flow

### Phase 4: Testing & Optimization (Week 2)
- [ ] End-to-end testing
- [ ] Performance optimization
- [ ] Error scenario handling
- [ ] Documentation updates

## Risk Mitigation

### 1. Breaking Changes
- **Risk**: Existing code dependencies on current architecture
- **Mitigation**: Maintain backward compatibility during transition
- **Strategy**: Phase rollout with feature flags

### 2. Data Consistency
- **Risk**: Race conditions in chat state management
- **Mitigation**: Atomic operations and proper locking
- **Strategy**: Server-side validation and error handling

### 3. Performance Impact
- **Risk**: Additional database operations for state management
- **Mitigation**: Optimize database queries and caching
- **Strategy**: Performance monitoring and bottleneck identification

### 4. User Experience
- **Risk**: Increased loading times for chat operations
- **Mitigation**: Proper loading states and error feedback
- **Strategy**: Progressive enhancement and graceful degradation

## Success Metrics

1. **Functionality**: All existing chat features work with new architecture
2. **Performance**: Chat operations complete within 500ms
3. **Reliability**: 99%+ success rate for chat creation/loading
4. **User Experience**: Smooth transitions between chats
5. **Code Quality**: Reduced complexity in frontend handlers

This plan creates a robust, scalable architecture for world-chat management while maintaining existing functionality and preparing for future enhancements.
