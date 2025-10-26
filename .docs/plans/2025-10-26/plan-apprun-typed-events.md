# Architecture Plan: AppRun Native Typed Events & Domain Modules

**Date:** 2025-10-26  
**Status:** Proposed  
**Priority:** HIGH  

---

## Executive Summary

AppRun **natively supports strongly-typed events** through:
1. **Update Tuple Pattern** - Array of `[eventName, handler]` tuples with discriminated unions
2. **Union Type Events** - String literal types like `type Events = 'send-message' | 'toggle-filter'`
3. **Generic Components** - `Component<State, Events>` with full type inference
4. **Typed app.run()** - `app.start<State, Events>()` enforces event name validation

**Key Benefit:** Zero custom wrappers needed - leverage AppRun's built-in TypeScript architecture.

---

## Current Architecture Issues

### 1. Untyped Event Handlers (World.update.ts)
```typescript
// ❌ Current: No type safety for event names or payloads
export const worldUpdateHandlers = {
  'update-input': (state, e: any) => ({ ...state, userInput: e.target.value }),
  'toggle-log-details': (state, messageId: string | number) => { ... },
  'show-delete-message-confirm': (state, messageId: string, backendMessageId: string, ...) => { ... }
};
```

**Problems:**
- Event name typos undetected until runtime
- Payload types are `any` or loose
- No IDE autocomplete for event names
- Payload structure mismatches go unnoticed

### 2. String Literal Event Dispatch
```typescript
// World.tsx - prone to typos
$onclick={['show-delete-message-confirm', message.id, message.messageId, ...]}
app.run('toggle-agent-filter', agent.id);
```

### 3. Monolithic Update File (865 lines)
- Mixed concerns: SSE, CRUD, UI state, chat history
- Hard to test individual domains
- Cognitive overload for modifications

---

## AppRun Native Typed Events Solution

### Step 1: Define Event Types with Union

```typescript
// web/src/types/events.ts

/**
 * World Component Event Types - Strongly Typed Event System
 * 
 * Uses AppRun's native discriminated union pattern for compile-time event validation.
 * Each event name maps to its specific payload type.
 */

// Input & Messaging Events
export type WorldEvents = 
  // Input events
  | { name: 'update-input', payload: { target: { value: string } } }
  | { name: 'key-press', payload: { key: string } }
  | { name: 'send-message', payload: void }
  
  // Message editing events
  | { name: 'start-edit-message', payload: { messageId: string; text: string } }
  | { name: 'save-edit-message', payload: { messageId: string } }
  | { name: 'cancel-edit-message', payload: void }
  | { name: 'update-edit-text', payload: { target: { value: string } } }
  
  // Message deletion events
  | { name: 'show-delete-message-confirm', payload: { 
      messageId: string; 
      backendMessageId: string; 
      messageText: string; 
      userEntered: boolean 
    } }
  | { name: 'hide-delete-message-confirm', payload: void }
  | { name: 'delete-message-confirmed', payload: void }
  
  // Message display events
  | { name: 'toggle-log-details', payload: { messageId: string | number } }
  | { name: 'ack-scroll', payload: void }
  
  // Agent events
  | { name: 'toggle-agent-filter', payload: { agentId: string } }
  | { name: 'open-agent-create', payload: void }
  | { name: 'open-agent-edit', payload: { agent: Agent } }
  | { name: 'open-agent-delete', payload: { agent: Agent } }
  | { name: 'close-agent-edit', payload: void }
  
  // Chat history events
  | { name: 'create-new-chat', payload: void }
  | { name: 'load-chat-from-history', payload: { chatId: string } }
  | { name: 'delete-chat-from-history', payload: { chatId: string } }
  | { name: 'chat-history-show-delete-confirm', payload: { chat: any } }
  | { name: 'chat-history-hide-modals', payload: void }
  
  // SSE streaming events
  | { name: 'handleStreamStart', payload: StreamStartData }
  | { name: 'handleStreamChunk', payload: StreamChunkData }
  | { name: 'handleStreamEnd', payload: StreamEndData }
  | { name: 'handleStreamError', payload: StreamErrorData }
  | { name: 'handleMessageEvent', payload: any }
  | { name: 'handleSystemEvent', payload: any }
  | { name: 'handleError', payload: any }
  | { name: 'handleLogEvent', payload: any }
  | { name: 'handleToolError', payload: any }
  | { name: 'handleToolStart', payload: any }
  | { name: 'handleToolResult', payload: any }
  | { name: 'handleMemoryOnlyMessage', payload: any }
  
  // World/Memory management
  | { name: 'clear-agent-messages', payload: { agent: Agent } }
  | { name: 'clear-world-messages', payload: void }
  | { name: 'delete-agent', payload: { agent: Agent } }
  | { name: 'export-world-markdown', payload: { worldName: string } }
  | { name: 'view-world-markdown', payload: { worldName: string } }
  
  // World edit events
  | { name: 'open-world-edit', payload: void }
  | { name: 'close-world-edit', payload: void }
  
  // Global coordination events
  | { name: 'agent-saved', payload: void }
  | { name: 'agent-deleted', payload: void }
  
  // Route events
  | { name: '/World', payload: { name: string; chatId?: string } }
  | { name: 'initWorld', payload: { name: string; chatId?: string } };

// Extract event names for use in string literals (backward compatibility)
export type WorldEventName = WorldEvents['name'];

// Helper type to extract payload type from event name
export type WorldEventPayload<T extends WorldEventName> = 
  Extract<WorldEvents, { name: T }>['payload'];
```

### Step 2: Convert Update Object to Typed Tuple

```typescript
// web/src/pages/World.update.ts

import type { Update } from 'apprun';
import type { WorldComponentState } from '../types';
import type { WorldEvents, WorldEventName, WorldEventPayload } from '../types/events';

/**
 * World Update Handlers - AppRun Native Typed Events
 * 
 * Uses Update<State, Events> tuple pattern for compile-time type safety.
 * AppRun enforces event name validation and payload type checking.
 */

// Convert from object to typed tuple array
export const worldUpdateHandlers: Update<WorldComponentState, WorldEventName> = [
  // Input & Messaging
  ['update-input', (state, payload: WorldEventPayload<'update-input'>) => ({
    ...state,
    userInput: payload.target.value
  })],
  
  ['key-press', (state, payload: WorldEventPayload<'key-press'>) => {
    if (payload.key === 'Enter' && (state.userInput || '').trim()) {
      // TypeScript knows this is valid because 'send-message' is in WorldEvents
      app.run('send-message');
    }
  }],
  
  ['send-message', async (state): Promise<WorldComponentState> => {
    const messageText = state.userInput?.trim();
    if (!messageText) return state;
    // ... existing logic
  }],
  
  // Message editing - now with typed payloads
  ['start-edit-message', (state, payload: WorldEventPayload<'start-edit-message'>) => ({
    ...state,
    editingMessageId: payload.messageId,
    editingText: payload.text
  })],
  
  ['save-edit-message', async (state, payload: WorldEventPayload<'save-edit-message'>): Promise<WorldComponentState> => {
    const editedText = state.editingText?.trim();
    if (!editedText) return state;
    // TypeScript knows payload.messageId is string
    const message = state.messages.find(msg => msg.id === payload.messageId);
    // ... existing logic
  }],
  
  // Message deletion - complex payload now fully typed
  ['show-delete-message-confirm', (state, payload: WorldEventPayload<'show-delete-message-confirm'>) => {
    const { messageId, backendMessageId, messageText, userEntered } = payload;
    // TypeScript validates all fields exist and have correct types
    const message = state.messages.find(msg => msg.id === messageId);
    // ... existing logic
  }],
  
  // Toggle events with simple payloads
  ['toggle-log-details', (state, payload: WorldEventPayload<'toggle-log-details'>) => {
    const messages = state.messages.map(msg => {
      if (String(msg.id) === String(payload.messageId)) {
        return { ...msg, isLogExpanded: !msg.isLogExpanded };
      }
      return msg;
    });
    return { ...state, messages, needScroll: false };
  }],
  
  // SSE handlers remain the same but now typed
  ['handleStreamStart', handleStreamStart],
  ['handleStreamChunk', handleStreamChunk],
  ['handleStreamEnd', handleStreamEnd],
  
  // ... rest of handlers converted to tuple format
];
```

### Step 3: Update Component with Generic Types

```typescript
// web/src/pages/World.tsx

import { app, Component } from 'apprun';
import type { WorldComponentState } from '../types';
import type { WorldEventName } from '../types/events';
import { worldUpdateHandlers } from './World.update';

export default class WorldComponent extends Component<WorldComponentState, WorldEventName> {
  //                                                  ^^^^^^^^^^^^^^^^^^^  ^^^^^^^^^^^^^^^^
  //                                                  State type           Event type
  
  override state = { /* ... */ };
  
  override view = (state: WorldComponentState) => {
    // TypeScript now validates event names in JSX
    return (
      <div>
        <button $onclick="send-message">Send</button>
        {/* ❌ TypeScript error: "invalid-event" not in WorldEventName */}
        {/* <button $onclick="invalid-event">X</button> */}
        
        {/* ✅ TypeScript validates payload structure */}
        <button 
          $onclick={['show-delete-message-confirm', {
            messageId: msg.id,
            backendMessageId: msg.messageId,
            messageText: msg.text,
            userEntered: msg.userEntered
          }]}
        >
          Delete
        </button>
      </div>
    );
  };
  
  // Update is now a typed tuple
  override update = worldUpdateHandlers;
}
```

### Step 4: Type-Safe Event Dispatch Everywhere

```typescript
// web/src/components/world-chat.tsx

import { app } from 'apprun';
import type { WorldEventPayload } from '../types/events';

export default function WorldChat(props: WorldChatProps) {
  return (
    <div>
      {/* ✅ TypeScript validates event name */}
      <button $onclick="send-message">Send</button>
      
      {/* ✅ TypeScript validates payload structure */}
      <button 
        $onclick={['start-edit-message', {
          messageId: message.id,
          text: message.text
        } satisfies WorldEventPayload<'start-edit-message'>]}
      >
        Edit
      </button>
      
      {/* ❌ TypeScript error: missing required field 'text' */}
      {/* <button $onclick={['start-edit-message', { messageId: 'x' }]}>Edit</button> */}
    </div>
  );
}
```

---

## Domain Module Splitting (Phase 2)

Once typed events are in place, split `World.update.ts` into domain-focused modules:

```
web/src/pages/world/
├── index.ts              # Re-export composed handlers
├── types/
│   └── events.ts         # WorldEvents union type
├── handlers/
│   ├── init.ts           # World initialization, routing
│   ├── input.ts          # User input, send message
│   ├── messages.ts       # Edit, delete, toggle operations
│   ├── chat-history.ts   # Chat CRUD, navigation
│   ├── memory.ts         # Agent memory management
│   └── sse.ts            # SSE streaming handlers
└── utils/
    └── message-helpers.ts # createMessageFromMemory, deduplicateMessages
```

### Example Module with Typed Events

```typescript
// web/src/pages/world/handlers/messages.ts

import type { Update } from 'apprun';
import type { WorldComponentState } from '../../../types';
import type { WorldEventName, WorldEventPayload } from '../types/events';

/**
 * Message Management Handlers
 * Handles: editing, deletion, toggle operations
 */

// Only export handlers related to messages
export const messageHandlers: Update<WorldComponentState, 
  | 'start-edit-message' 
  | 'save-edit-message' 
  | 'cancel-edit-message'
  | 'update-edit-text'
  | 'show-delete-message-confirm'
  | 'hide-delete-message-confirm'
  | 'delete-message-confirmed'
  | 'toggle-log-details'
> = [
  ['start-edit-message', (state, payload) => ({
    ...state,
    editingMessageId: payload.messageId,
    editingText: payload.text
  })],
  
  ['save-edit-message', async (state, payload) => {
    // ... existing logic with typed payload
  }],
  
  // ... rest of message handlers
];
```

```typescript
// web/src/pages/world/index.ts

import { initHandlers } from './handlers/init';
import { inputHandlers } from './handlers/input';
import { messageHandlers } from './handlers/messages';
import { chatHistoryHandlers } from './handlers/chat-history';
import { memoryHandlers } from './handlers/memory';
import { sseHandlers } from './handlers/sse';

/**
 * Composed World Update Handlers
 * Combines domain-specific handler modules into single update tuple
 */
export const worldUpdateHandlers = [
  ...initHandlers,
  ...inputHandlers,
  ...messageHandlers,
  ...chatHistoryHandlers,
  ...memoryHandlers,
  ...sseHandlers
];
```

---

## Implementation Plan

### ✅ Phase 1: Typed Events Foundation (2-3 days)

**Goal:** Establish AppRun native typed events without breaking existing functionality

**Tasks:**
1. ✅ Define `WorldEvents` union type in `web/src/types/events.ts`
2. ✅ Convert top 10 event handlers from object to tuple format
3. ✅ Add generic types to `WorldComponent`: `Component<State, EventName>`
4. ✅ Test type validation with intentional errors
5. ✅ Update documentation with typed event patterns

**Validation:**
- TypeScript catches event name typos at compile time
- Payload type mismatches cause build errors
- IDE provides autocomplete for event names

### ✅ Phase 2: Complete Event Conversion (3-5 days)

**Goal:** Convert all 40+ event handlers to typed tuples

**Tasks:**
1. ✅ Convert all `World.update.ts` handlers to tuple format
2. ✅ Update all `$onclick` in `World.tsx` to use typed payloads
3. ✅ Convert child components (`world-chat.tsx`, etc.) to typed events
4. ✅ Add `satisfies` checks for complex payloads
5. ✅ Run full test suite to catch runtime issues

**Validation:**
- No runtime errors in existing flows
- All event dispatches are type-checked
- Payload structure validated at call sites

### ✅ Phase 3: Domain Module Split (5-7 days)

**Goal:** Organize handlers into domain-focused modules

**Tasks:**
1. ✅ Create `web/src/pages/world/handlers/` directory structure
2. ✅ Extract `messages.ts` handlers (edit/delete logic) - **START HERE**
3. ✅ Extract `input.ts` handlers (send message)
4. ✅ Extract `chat-history.ts` handlers (CRUD operations)
5. ✅ Extract `sse.ts` handlers (streaming events)
6. ✅ Extract `memory.ts` handlers (agent memory)
7. ✅ Extract `init.ts` handlers (world bootstrap, routing)
8. ✅ Update imports in `World.tsx`

**Validation:**
- `World.update.ts` reduced from 865→150 lines (just re-exports)
- Each module <200 lines
- All tests pass
- No regression in functionality

### ✅ Phase 4: Testing & Documentation (3-5 days)

**Goal:** Comprehensive test coverage and updated documentation

**Tasks:**

#### 4.1 Unit Tests for Domain Modules
1. ✅ **messages.ts tests** - Edit, delete, toggle operations
   - Message edit validation (missing messageId, session mode check)
   - Delete confirmation flow with state updates
   - Toggle log details expansion
   - Payload structure validation
   
2. ✅ **input.ts tests** - User input and send message
   - Input validation (empty message rejection)
   - User message creation with temp ID
   - SSE integration triggering
   - Error handling for send failures
   
3. ✅ **chat-history.ts tests** - Chat CRUD operations
   - Create new chat with reuse logic
   - Load chat from history with route update
   - Delete chat with fallback to latest
   - Empty state handling
   
4. ✅ **sse.ts tests** - Streaming event handlers
   - handleStreamStart message initialization
   - handleStreamChunk accumulation
   - handleStreamEnd finalization
   - handleError recovery
   - Message deduplication logic
   
5. ✅ **memory.ts tests** - Agent memory management
   - Clear agent messages with agent ID validation
   - Clear world messages for all agents
   - Error handling for API failures
   
6. ✅ **init.ts tests** - World initialization
   - Route parameter parsing
   - World data loading with chat restoration
   - Error state handling
   - Message deduplication on load

#### 4.2 Integration Tests
1. ✅ Full edit flow: start-edit → update-text → save → SSE response
2. ✅ Full delete flow: show-confirm → delete-confirmed → reload
3. ✅ Chat session flow: create → send-message → SSE stream → save
4. ✅ Multi-agent message deduplication scenarios

#### 4.3 Documentation Updates
1. ✅ Update `docs/apprun-frontend/apprun-app.md`:
   - Add section on typed events architecture
   - Document Update tuple pattern with examples
   - Add discriminated union type explanation
   - Update component structure diagram with typed handlers
   - Add migration guide from object to tuple format
   
2. ✅ Update `.github/prompts/apprun.prompt.md`:
   - Add "Pattern D: Typed Event Handlers" section
   - Update Template Structure with Update<State, Events>
   - Add event type definition examples
   - Update Event Handling Rules table with typed patterns
   - Add TypeScript Interface Checklist for event types
   - Include payload validation examples with `satisfies`
   - Update Summary Checklist with typed event requirements
   
3. ✅ Create JSDoc examples for each event type in `types/events.ts`
4. ✅ Document testing patterns for typed handlers

---

## Benefits Summary

### Before (Current)
```typescript
// ❌ No type safety
$onclick={['show-delete-confirm', msg.id, msg.messageId, msg.text, true]}
//                                  ^^^^^^  ^^^^^^^^^^^^  ^^^^^^^^  ^^^^
//                                  What order? What types? Runtime errors only!

// ❌ Typo not caught
app.run('togle-agent-filter', agentId);
```

### After (AppRun Native Typed)
```typescript
// ✅ Compile-time validation
$onclick={['show-delete-message-confirm', {
  messageId: msg.id,           // ✅ TypeScript validates field exists
  backendMessageId: msg.messageId,
  messageText: msg.text,
  userEntered: msg.userEntered
} satisfies WorldEventPayload<'show-delete-message-confirm'>]}

// ✅ Typo caught at compile time
app.run('togle-agent-filter', agentId);
//      ^^^^^^^^^^^^^^^^^^ Error: not in WorldEventName
```

**Measurable Improvements:**
- ✅ **40+ event handlers** now type-safe
- ✅ **Zero custom wrappers** - native AppRun
- ✅ **IDE autocomplete** for all event names
- ✅ **Compile-time validation** for payloads
- ✅ **Refactoring confidence** - rename detection
- ✅ **Self-documenting** - event contracts in code

---

## Risk Assessment

### Low Risk
- ✅ AppRun 3.38.0 supports typed events natively
- ✅ No breaking changes to runtime behavior
- ✅ Gradual migration possible (object + tuple can coexist)
- ✅ TypeScript provides safety net during migration

### Mitigation Strategies
1. **Incremental Conversion**: Convert 10 handlers at a time, test thoroughly
2. **Keep Object Format Temporarily**: Migrate to tuples only after event types stabilize
3. **Automated Testing**: Run full test suite after each module split
4. **Documentation First**: Update AppRun guide before implementation

---

## Success Metrics

### Phase 1 (Typed Events)
- [ ] TypeScript catches 100% of event name typos
- [ ] IDE provides autocomplete for all event names
- [ ] Zero runtime errors from type mismatches

### Phase 3 (Domain Modules)
- [ ] `World.update.ts` reduced from 865→150 lines
- [ ] Each module <200 lines, single responsibility
- [ ] All modules independently testable

### Phase 4 (Testing & Documentation)
- [ ] Test coverage >80% for all domain modules
- [ ] Integration tests cover critical user flows
- [ ] `apprun-app.md` documents typed event architecture
- [ ] `apprun.prompt.md` includes typed event patterns for AI
- [ ] All future components use typed events from day 1
- [ ] Team velocity improves (less debugging, more features)

---

## Unit Testing Strategy for Domain Modules

### Testing Principles

1. **Pure Handler Testing**: Test handlers as pure functions (state in → state out)
2. **Mock API Calls**: Use Jest mocks for all `api.*` calls
3. **Async Generator Testing**: Use `for await` loops to collect yielded states
4. **Type Safety**: Leverage TypeScript to catch payload mismatches in tests

### Test File Structure

```
tests/web/
├── handlers/
│   ├── init.test.ts           # World initialization tests
│   ├── input.test.ts          # User input & send message tests
│   ├── messages.test.ts       # Edit/delete/toggle tests
│   ├── chat-history.test.ts   # Chat CRUD tests
│   ├── memory.test.ts         # Agent memory tests
│   └── sse.test.ts            # SSE streaming tests
└── integration/
    ├── edit-flow.test.ts      # Full edit workflow
    ├── delete-flow.test.ts    # Full delete workflow
    └── chat-session.test.ts   # Full chat session
```

---

## Detailed Test Specifications

### 1. messages.ts Test Suite

**File**: `tests/web/handlers/messages.test.ts`

```typescript
import { messageHandlers } from '@/pages/world/handlers/messages';
import type { WorldComponentState } from '@/types';
import * as api from '@/api';

jest.mock('@/api');

describe('Message Handlers', () => {
  let mockState: WorldComponentState;

  beforeEach(() => {
    mockState = {
      worldName: 'test-world',
      messages: [
        { id: 'msg1', messageId: 'backend-1', text: 'Hello', sender: 'human', type: 'user' }
      ],
      currentChat: { id: 'chat1', name: 'Test Chat' },
      world: { currentChatId: 'chat1' }, // Session mode ON
      editingMessageId: null,
      editingText: '',
      messageToDelete: null,
      loading: false,
      error: null
    };
  });

  describe('start-edit-message', () => {
    it('should set editing state with messageId and text', () => {
      const handler = messageHandlers.find(h => h[0] === 'start-edit-message')[1];
      const result = handler(mockState, { messageId: 'msg1', text: 'Hello' });

      expect(result.editingMessageId).toBe('msg1');
      expect(result.editingText).toBe('Hello');
    });
  });

  describe('save-edit-message', () => {
    it('should reject edit if message has no messageId', async () => {
      mockState.messages[0].messageId = undefined;
      mockState.editingText = 'Updated text';

      const handler = messageHandlers.find(h => h[0] === 'save-edit-message')[1];
      const result = await handler(mockState, { messageId: 'msg1' });

      expect(result.error).toContain('missing message ID');
    });

    it('should reject edit if session mode is OFF', async () => {
      mockState.world.currentChatId = null; // Session OFF
      mockState.editingText = 'Updated text';

      const handler = messageHandlers.find(h => h[0] === 'save-edit-message')[1];
      const result = await handler(mockState, { messageId: 'msg1' });

      expect(result.error).toContain('session mode is OFF');
    });

    it('should call DELETE then POST and update state', async () => {
      mockState.editingText = 'Updated text';
      (api.deleteMessage as jest.Mock).mockResolvedValue({ success: true });
      (api.sendChatMessage as jest.Mock).mockResolvedValue(() => {});

      const handler = messageHandlers.find(h => h[0] === 'save-edit-message')[1];
      const states = [];
      for await (const state of handler(mockState, { messageId: 'msg1' })) {
        states.push(state);
      }

      expect(api.deleteMessage).toHaveBeenCalledWith('test-world', 'backend-1', 'chat1');
      expect(api.sendChatMessage).toHaveBeenCalledWith('test-world', 'Updated text', 'human');
      expect(states[states.length - 1].isSending).toBe(false);
    });

    it('should handle DELETE failure and restore original state', async () => {
      mockState.editingText = 'Updated text';
      (api.deleteMessage as jest.Mock).mockRejectedValue(new Error('423 Locked'));

      const handler = messageHandlers.find(h => h[0] === 'save-edit-message')[1];
      const result = await handler(mockState, { messageId: 'msg1' });

      expect(result.error).toContain('world is currently processing');
      expect(result.messages).toHaveLength(1); // Original message restored
    });
  });

  describe('delete-message-confirmed', () => {
    it('should call DELETE API and reload world state', async () => {
      mockState.messageToDelete = { id: 'msg1', messageId: 'backend-1', chatId: 'chat1' };
      
      const mockWorld = {
        agents: [
          { id: 'a1', name: 'Agent1', memory: [
            { chatId: 'chat1', content: 'Remaining message', messageId: 'backend-2' }
          ]}
        ]
      };
      (api.deleteMessage as jest.Mock).mockResolvedValue({ success: true });
      (api.getWorld as jest.Mock).mockResolvedValue(mockWorld);

      const handler = messageHandlers.find(h => h[0] === 'delete-message-confirmed')[1];
      const result = await handler(mockState);

      expect(api.deleteMessage).toHaveBeenCalledWith('test-world', 'backend-1', 'chat1');
      expect(result.messageToDelete).toBeNull();
      expect(result.messages).toHaveLength(1); // One message remaining
    });
  });

  describe('toggle-log-details', () => {
    it('should toggle isLogExpanded for matching message', () => {
      mockState.messages[0].isLogExpanded = false;

      const handler = messageHandlers.find(h => h[0] === 'toggle-log-details')[1];
      const result = handler(mockState, { messageId: 'msg1' });

      expect(result.messages[0].isLogExpanded).toBe(true);
      expect(result.needScroll).toBe(false);
    });
  });
});
```

### 2. input.ts Test Suite

**File**: `tests/web/handlers/input.test.ts`

```typescript
describe('Input Handlers', () => {
  describe('send-message', () => {
    it('should reject empty messages', async () => {
      mockState.userInput = '   ';

      const handler = inputHandlers.find(h => h[0] === 'send-message')[1];
      const result = await handler(mockState);

      expect(result.userInput).toBe('   '); // Unchanged
      expect(result.isSending).toBeUndefined(); // No state change
    });

    it('should create temp user message and trigger SSE', async () => {
      mockState.userInput = 'Test message';
      (api.sendChatMessage as jest.Mock).mockResolvedValue(() => {});

      const handler = inputHandlers.find(h => h[0] === 'send-message')[1];
      const result = await handler(mockState);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].text).toBe('Test message');
      expect(result.messages[0].userEntered).toBe(true);
      expect(result.userInput).toBe('');
      expect(api.sendChatMessage).toHaveBeenCalled();
    });

    it('should handle send failure and set error state', async () => {
      mockState.userInput = 'Test message';
      (api.sendChatMessage as jest.Mock).mockRejectedValue(new Error('Network error'));

      const handler = inputHandlers.find(h => h[0] === 'send-message')[1];
      const result = await handler(mockState);

      expect(result.error).toContain('Network error');
      expect(result.isSending).toBe(false);
      expect(result.isWaiting).toBe(false);
    });
  });
});
```

### 3. chat-history.ts Test Suite

**File**: `tests/web/handlers/chat-history.test.ts`

```typescript
describe('Chat History Handlers', () => {
  describe('create-new-chat', () => {
    it('should call API and reload world', async () => {
      (api.newChat as jest.Mock).mockResolvedValue({ success: true, chatId: 'chat2' });

      const handler = chatHistoryHandlers.find(h => h[0] === 'create-new-chat')[1];
      const states = [];
      for await (const state of handler(mockState)) {
        states.push(state);
      }

      expect(states[0].loading).toBe(true);
      expect(api.newChat).toHaveBeenCalledWith('test-world');
    });

    it('should handle creation failure', async () => {
      (api.newChat as jest.Mock).mockResolvedValue({ success: false });

      const handler = chatHistoryHandlers.find(h => h[0] === 'create-new-chat')[1];
      const states = [];
      for await (const state of handler(mockState)) {
        states.push(state);
      }

      expect(states[states.length - 1].error).toContain('Failed to create new chat');
    });
  });

  describe('delete-chat-from-history', () => {
    it('should delete chat and navigate to world root', async () => {
      (api.deleteChat as jest.Mock).mockResolvedValue({ success: true });
      const mockRoute = jest.spyOn(app, 'route');

      const handler = chatHistoryHandlers.find(h => h[0] === 'delete-chat-from-history')[1];
      const states = [];
      for await (const state of handler(mockState, { chatId: 'chat1' })) {
        states.push(state);
      }

      expect(api.deleteChat).toHaveBeenCalledWith('test-world', 'chat1');
      expect(mockRoute).toHaveBeenCalledWith('/World/test-world');
    });
  });
});
```

### 4. sse.ts Test Suite

**File**: `tests/web/handlers/sse.test.ts`

```typescript
describe('SSE Handlers', () => {
  describe('handleStreamStart', () => {
    it('should create streaming placeholder message', () => {
      const handler = sseHandlers.find(h => h[0] === 'handleStreamStart')[1];
      const result = handler(mockState, { sender: 'agent1', messageId: 'stream-1' });

      expect(result.messages).toHaveLength(2); // Original + streaming
      expect(result.messages[1].isStreaming).toBe(true);
      expect(result.messages[1].sender).toBe('agent1');
      expect(result.needScroll).toBe(true);
    });
  });

  describe('handleMessageEvent', () => {
    it('should deduplicate user messages by messageId', async () => {
      mockState.messages = [
        { id: 'temp-1', messageId: 'backend-1', text: 'Hello', sender: 'human', seenByAgents: ['a1'] }
      ];

      const handler = sseHandlers.find(h => h[0] === 'handleMessageEvent')[1];
      const result = await handler(mockState, {
        sender: 'human',
        content: 'Hello',
        messageId: 'backend-1',
        type: 'user'
      });

      expect(result.messages).toHaveLength(1); // No duplicate
    });

    it('should update temp message with backend messageId', async () => {
      mockState.messages = [
        { id: 'temp-1', text: 'Hello', sender: 'human', userEntered: true }
      ];

      const handler = sseHandlers.find(h => h[0] === 'handleMessageEvent')[1];
      const result = await handler(mockState, {
        sender: 'human',
        content: 'Hello',
        messageId: 'backend-1',
        type: 'user'
      });

      expect(result.messages[0].messageId).toBe('backend-1');
      expect(result.messages[0].userEntered).toBe(false);
    });
  });

  describe('handleStreamEnd', () => {
    it('should remove streaming indicator and set waiting to false', () => {
      mockState.messages = [
        { id: 'msg1', sender: 'agent1', isStreaming: true }
      ];
      mockState.isWaiting = true;

      const handler = sseHandlers.find(h => h[0] === 'handleStreamEnd')[1];
      const result = handler(mockState, {});

      expect(result.isWaiting).toBe(false);
    });
  });
});
```

### 5. Integration Tests

**File**: `tests/web/integration/edit-flow.test.ts`

```typescript
describe('Message Edit Flow Integration', () => {
  it('should complete full edit workflow', async () => {
    const { worldUpdateHandlers } = await import('@/pages/world');
    let state = createMockState();

    // Step 1: Start edit
    const startHandler = worldUpdateHandlers.find(h => h[0] === 'start-edit-message')[1];
    state = startHandler(state, { messageId: 'msg1', text: 'Original' });
    expect(state.editingMessageId).toBe('msg1');

    // Step 2: Update text
    const updateHandler = worldUpdateHandlers.find(h => h[0] === 'update-edit-text')[1];
    state = updateHandler(state, { target: { value: 'Updated' } });
    expect(state.editingText).toBe('Updated');

    // Step 3: Save edit
    (api.deleteMessage as jest.Mock).mockResolvedValue({ success: true });
    (api.sendChatMessage as jest.Mock).mockResolvedValue(() => {});

    const saveHandler = worldUpdateHandlers.find(h => h[0] === 'save-edit-message')[1];
    const states = [];
    for await (const s of saveHandler(state, { messageId: 'msg1' })) {
      states.push(s);
    }

    expect(states[states.length - 1].editingMessageId).toBeNull();
    expect(api.deleteMessage).toHaveBeenCalled();
    expect(api.sendChatMessage).toHaveBeenCalledWith('test-world', 'Updated', 'human');
  });
});
```

---

## Test Coverage Goals

### Per-Module Coverage Targets

| Module | Target | Critical Paths |
|--------|--------|----------------|
| messages.ts | >85% | Edit validation, delete flow, payload checks |
| input.ts | >90% | Empty validation, SSE trigger, error handling |
| chat-history.ts | >80% | CRUD operations, route navigation |
| sse.ts | >75% | Stream lifecycle, deduplication, error recovery |
| memory.ts | >85% | Agent/world clear, API error handling |
| init.ts | >70% | Route parsing, data loading, error states |

### Integration Test Coverage

- ✅ Full edit workflow (start → update → save → SSE)
- ✅ Full delete workflow (show → confirm → delete → reload)
- ✅ Full chat session (create → send → stream → save)
- ✅ Multi-agent message deduplication
- ✅ Error recovery paths (API failures, validation errors)

---

## Conclusion

**Recommendation: PROCEED with AppRun Native Typed Events**

This approach:
- ✅ Uses AppRun's built-in capabilities (no custom wrappers)
- ✅ Provides compile-time safety for 40+ event handlers
- ✅ Enables confident refactoring with IDE support
- ✅ Sets foundation for domain module organization
- ✅ Low risk with high architectural ROI

**Next Steps:**
1. Get approval for Phase 1 implementation
2. Create `web/src/types/events.ts` with `WorldEvents` union
3. Convert top 10 handlers to tuple format
4. Validate type safety with intentional errors
5. Proceed to full conversion and module split

---

**Questions for Review:**
1. Should we keep object format during transition, or direct tuple migration?
2. Any specific events that need special handling?
3. Timeline constraints for completion?
