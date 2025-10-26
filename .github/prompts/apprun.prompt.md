# AppRun Development Guide for AI Coding Assistants

## Quick Decision Tree: What Component Should I Create?

**START HERE:** Ask yourself these questions in order:

1. **Does it manage its own state and handle user interactions?**
   - YES → Use **Stateful Class Component** (Pattern A)
   - NO → Go to question 2

2. **Is it a popup/modal/overlay that appears on demand?**
   - YES → Use **Popup Component** (Pattern B)
   - NO → Go to question 3

3. **Does it only display data passed from parent?**
   - YES → Use **Functional Component** (Pattern C)
   - NO → You might need a combination - start with Pattern A

---

## Pattern A: Stateful Class Component (Self-Contained)

**Use for:** Forms, interactive widgets, components with internal logic

### Template Structure
```typescript
// 1. IMPORTS
import { app, Component } from 'apprun';
import type { YourDataType } from '../types';
import api from '../api';

// 2. INTERFACES (Always define these first)
interface ComponentProps {
  requiredProp: string;
  optionalProp?: string;
  parentComponent?: any;
}

export interface ComponentState {
  // Always include these three
  loading: boolean;
  error: string | null;
  successMessage?: string | null;

  // Your specific state
  formData: Partial<YourDataType>;
  mode: 'create' | 'edit' | 'delete';
}

// 3. HELPER FUNCTIONS (Export for testing)
const getStateFromProps = (props: ComponentProps): ComponentState => ({
  loading: false,
  error: null,
  formData: props.data || {},
  mode: props.mode || 'create'
});

// 4. ACTION FUNCTIONS (Export for $onclick references)
export const saveData = async function* (state: ComponentState): AsyncGenerator<ComponentState> {
  // Validation first
  if (!state.formData.name?.trim()) {
    yield { ...state, error: 'Name is required' };
    return;
  }

  // Multiple yields = multiple re-renders in one handler
  yield { ...state, loading: true, error: null };

  try {
    if (state.mode === 'create') {
      await api.create(state.formData);
    } else {
      await api.update(state.formData.id, state.formData);
    }

    // Yield again for success state
    yield { ...state, loading: false, successMessage: 'Saved successfully!' };

    // Notify parent after 2 seconds
    setTimeout(() => {
      state.parentComponent?.run('data-saved');
    }, 2000);

  } catch (error: any) {
    yield { ...state, loading: false, error: error.message || 'Save failed' };
  }
};

export const deleteData = async function* (state: ComponentState): AsyncGenerator<ComponentState> {
  yield { ...state, loading: true, error: null };
  try {
    await api.delete(state.formData.id);
    yield { ...state, loading: false, successMessage: 'Deleted successfully!' };
    setTimeout(() => state.parentComponent?.run('data-deleted'), 2000);
  } catch (error: any) {
    yield { ...state, loading: false, error: error.message || 'Delete failed' };
  }
};

export const closeComponent = (): void => {
  app.run('close-component');
};

// 5. COMPONENT CLASS
export default class YourComponent extends Component<ComponentState> {
  declare props: Readonly<ComponentProps>;
  
  // State Initialization Rules:
  // 1. Use mounted() for components embedded in JSX (REQUIRED)
  // 2. Use mounted() for sync initialization from props
  // 3. Use state = async only for top-level routed pages with async data loading
  
  // Option 1: mounted() - For JSX embedded components and sync initialization
  mounted = (props: ComponentProps): ComponentState => getStateFromProps(props);
  
  // Option 2: state = async - Only for top-level routed pages
  // NEVER use for components embedded in JSX (causes lifecycle issues)
  // state = async (props: ComponentProps): Promise<ComponentState> => {
  //   const data = await api.fetchData();
  //   return { ...getStateFromProps(props), data };
  // };

  view = (state: ComponentState) => {
    // GUARD CLAUSES FIRST (early returns)
    if (state.successMessage) {
      return (
        <div className="success-view">
          <p>{state.successMessage}</p>
          <div>Closing...</div>
        </div>
      );
    }

    if (state.error) {
      return (
        <div className="error-view">
          <p>Error: {state.error}</p>
          <button $onclick="retry">Retry</button>
        </div>
      );
    }

    if (state.loading) {
      return <div className="loading-view">Loading...</div>;
    }

    // MAIN CONTENT
    return (
      <div className="component-container">
        <form className="component-form">
          <div className="form-group">
            <label>Name *</label>
            <input
              type="text"
              value={state.formData.name || ''}
              $bind="formData.name"
              disabled={state.loading}
            />
          </div>

          <div className="form-actions">
            <button type="button" $onclick={[closeComponent]}>Cancel</button>
            <button
              type="button"
              $onclick={[saveData]}
              disabled={state.loading || !state.formData.name?.trim()}
            >
              {state.loading ? 'Saving...' : state.mode === 'create' ? 'Create' : 'Update'}
            </button>
          </div>
        </form>
      </div>
    );
  };
}
```

---

## Pattern B: Popup Component (Modal)

**Use for:** Any overlay that appears on demand

**CRITICAL:** Modals are embedded in JSX, so they MUST use `mounted()` for state initialization.

```typescript
export default class ModalComponent extends Component<ModalState> {
  declare props: Readonly<ModalProps>;
  // MUST use mounted() because this component is embedded in parent JSX
  mounted = (props: ModalProps): ModalState => getStateFromProps(props);

  view = (state: ModalState) => {
    // Success message auto-closes
    if (state.successMessage) {
      return (
        <div className="modal-backdrop">
          <div className="modal-content" onclick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Success!</h2>
              <button className="modal-close-btn" $onclick={closeModal}>×</button>
            </div>
            <div className="modal-body">
              <p>{state.successMessage}</p>
              <div>Closing...</div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="modal-backdrop">
        <div className="modal-content" onclick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>{state.title}</h2>
            <button className="modal-close-btn" $onclick={closeModal}>×</button>
          </div>

          <div className="modal-body">
            {state.error && <div className="error-message">{state.error}</div>}

            <form>
              <input $bind="formData.name" />
              {/* Form fields */}
            </form>
          </div>

          <div className="modal-footer">
            <button className="btn-secondary" $onclick={closeModal}>Cancel</button>
            <button className="btn-primary" $onclick={[saveData]} disabled={state.loading}>
              {state.loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    );
  };
}
```

## Pattern C: Functional Component (Display Only)

**Use for:** Components that only render data from props

```typescript
export interface ComponentProps {
  data: DataType[];
  selectedItem?: DataType | null;
  loading?: boolean;
  onItemClick?: (item: DataType) => void;
}

export default function DisplayComponent(props: ComponentProps) {
  // Destructure with defaults
  const {
    data = [],
    selectedItem = null,
    loading = false,
    onItemClick
  } = props;

  // Guard clauses
  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (data.length === 0) {
    return <div className="empty-state">No data available</div>;
  }

  // Main render
  return (
    <div className="display-component">
      {data.map((item, index) => {
        const isSelected = selectedItem?.id === item.id;

        return (
          <div
            key={item.id || index}
            className={`item ${isSelected ? 'selected' : ''}`}
            onclick={() => onItemClick?.(item)}
          >
            <div className="item-name">{item.name}</div>
            <div className="item-description">{item.description}</div>
          </div>
        );
      })}
    </div>
  );
}
```

---

## Pattern D: Typed Event System (For Large Components)

**Use for:** Components with 10+ events requiring compile-time type safety

AppRun 3.38.0+ supports **native typed events** through discriminated unions and generic components, providing:
- ✅ Compile-time event name validation (typos caught by TypeScript)
- ✅ Type-safe payload structures (autocomplete in IDE)
- ✅ Refactoring safety (rename detection across codebase)
- ✅ Self-documenting event contracts

### Event Types Definition Rules

**Rule 1: Define Discriminated Union**
Create a union type where each event has a `name` and `payload`:

```typescript
// types/events.ts
export type ComponentEvents =
  | { name: 'event-name'; payload: PayloadType }
  | { name: 'another-event'; payload: AnotherPayloadType };
```

**Rule 2: Single-Property Payloads → Direct Values**
When an event only needs one value, use the value directly (not wrapped in an object):

```typescript
// ✅ CORRECT: Direct value for single property
| { name: 'delete-item'; payload: string }
| { name: 'toggle-filter'; payload: string }
| { name: 'select-agent'; payload: string }
| { name: 'set-mode'; payload: 'create' | 'edit' | 'delete' }

// Handler receives the value directly
'delete-item': (state, itemId: string) => { ... }

// Call site passes the value directly
$onclick={['delete-item', item.id]}
```

```typescript
// ❌ WRONG: Don't wrap single values in objects
| { name: 'delete-item'; payload: { id: string } }

// This creates unnecessary nesting:
'delete-item': (state, payload: { id: string }) => { ... }
$onclick={['delete-item', { id: item.id }]}
```

**Rule 3: Multi-Property Payloads → Objects**
When an event needs multiple values, use an object:

```typescript
// ✅ CORRECT: Object for multiple properties
| { name: 'start-edit'; payload: { messageId: string; text: string } }
| { name: 'show-confirm'; payload: { id: string; name: string; isWarning: boolean } }
| { name: 'update-position'; payload: { x: number; y: number } }

// Handler receives object with multiple properties
'start-edit': (state, payload: { messageId: string; text: string }) => { ... }

// Call site passes object
$onclick={['start-edit', { messageId: msg.id, text: msg.text }]}
```

**Rule 4: No-Payload Events → void**
For events that don't need data:

```typescript
// ✅ CORRECT: Use void for events without data
| { name: 'send-message'; payload: void }
| { name: 'cancel-edit'; payload: void }
| { name: 'close-modal'; payload: void }

// Handler doesn't receive payload parameter
'send-message': (state): State => { ... }

// Call site uses string (no array needed)
$onclick="send-message"
```

**Rule 5: Route Events → any**
For route events with variadic parameters:

```typescript
// ✅ CORRECT: any for routes (flexible parameters)
| { name: '/World'; payload: any }
| { name: 'initWorld'; payload: any }

// Handler can receive multiple parameters
'initWorld': async function* (state, worldName: string, chatId?: string) { ... }
'/World': async function* (state, worldName: string, chatId?: string) { ... }
```

**Rule 6: Input Events → Nested Objects**
For DOM input events, match the event structure:

```typescript
// ✅ CORRECT: Match DOM event structure
| { name: 'update-input'; payload: { target: { value: string } } }
| { name: 'key-press'; payload: { key: string } }

// Handler extracts from nested structure
'update-input': (state, payload: { target: { value: string } }): State => ({
  ...state,
  userInput: payload.target.value
})

// Call site with $bind handles this automatically
<input $bind="userInput" />
```

**Rule 7: Export Helper Types**
Always export these helper types:

```typescript
// Extract event names for Component generic
export type ComponentEventName = ComponentEvents['name'];

// Extract payload type from event name
export type ComponentEventPayload<T extends ComponentEventName> = 
  Extract<ComponentEvents, { name: T }>['payload'];
```

### Template Structure

```typescript
// 1. EVENT TYPES FILE
// types/events.ts
import type { Agent, Message } from './index';

/**
 * World Component Events - Discriminated Union
 * Each event maps to its specific payload type
 */
export type WorldEvents =
  // No payload events
  | { name: 'send-message'; payload: void }
  | { name: 'cancel-edit'; payload: void }
  
  // Single-value payloads (direct values)
  | { name: 'toggle-filter'; payload: string }
  | { name: 'delete-message'; payload: string }
  | { name: 'load-chat'; payload: string }
  
  // Multi-property payloads (objects)
  | { name: 'start-edit'; payload: { messageId: string; text: string } }
  | { name: 'show-confirm'; payload: { id: string; name: string; isWarning: boolean } }
  | { name: 'create-chat'; payload: { title: string; firstMessage?: string } }
  
  // Input events
  | { name: 'update-input'; payload: { target: { value: string } } }
  | { name: 'key-press'; payload: { key: string } }
  
  // Complex payloads
  | { name: 'open-agent-edit'; payload: Agent }
  | { name: 'save-agent'; payload: { agent: Agent; mode: 'create' | 'edit' } }
  
  // Route events
  | { name: '/World'; payload: any }
  | { name: 'initWorld'; payload: any };

export type WorldEventName = WorldEvents['name'];
export type WorldEventPayload<T extends WorldEventName> = 
  Extract<WorldEvents, { name: T }>['payload'];

// 2. COMPONENT CLASS
// World.tsx
import { Component } from 'apprun';
import type { WorldComponentState } from '../types';
import type { WorldEventName } from '../types/events';
import { worldUpdateHandlers } from './World.update';

export default class World extends Component<WorldComponentState, WorldEventName> {
  //                                           ^^^^^^^^^^^^^^^^^^^  ^^^^^^^^^^^^^^^^
  //                                           State type           Event type
  
  override state = {
    loading: false,
    error: null,
    messages: []
  };
  
  override view = (state: WorldComponentState) => {
    return (
      <div>
        {/* ✅ TypeScript validates event name */}
        <button $onclick="send-message">Send</button>
        
        {/* ✅ TypeScript validates payload structure */}
        <button $onclick={['start-edit', { messageId: 'msg1', text: 'Hello' }]}>
          Edit
        </button>
        
        {/* ✅ TypeScript validates single-value payload */}
        <button $onclick={['toggle-filter', agent.id]}>
          Toggle
        </button>
        
        {/* ❌ TypeScript error: "invalid-event" not in WorldEventName */}
        {/* <button $onclick="invalid-event">X</button> */}
        
        {/* ❌ TypeScript error: missing required field 'text' */}
        {/* <button $onclick={['start-edit', { messageId: 'x' }]}>Edit</button> */}
      </div>
    );
  };
  
  override update = worldUpdateHandlers;
}

// 3. EVENT HANDLERS (OBJECT FORMAT - CRITICAL)
// World.update.ts
import type { Update } from 'apprun';
import type { WorldComponentState } from '../types';
import type { WorldEventName, WorldEventPayload } from '../types/events';

/**
 * World Update Handlers - AppRun Native Typed Events
 * CRITICAL: Uses object format { 'event': handler }, NOT array format
 */
export const worldUpdateHandlers: Update<WorldComponentState, WorldEventName> = {
  
  // No-payload event
  'send-message': async (state: WorldComponentState): Promise<WorldComponentState> => {
    const messageText = state.userInput?.trim();
    if (!messageText) return state;
    // ... send logic
    return { ...state, userInput: '', isSending: true };
  },
  
  // Single-value payload (direct value)
  'toggle-filter': (state: WorldComponentState, agentId: WorldEventPayload<'toggle-filter'>): WorldComponentState => {
    // agentId is string (direct value, not object)
    const isActive = state.filters.includes(agentId);
    return {
      ...state,
      filters: isActive 
        ? state.filters.filter(id => id !== agentId)
        : [...state.filters, agentId]
    };
  },
  
  // Multi-property payload (object)
  'start-edit': (state: WorldComponentState, payload: WorldEventPayload<'start-edit'>): WorldComponentState => {
    // payload is { messageId: string; text: string }
    return {
      ...state,
      editingMessageId: payload.messageId,
      editingText: payload.text
    };
  },
  
  // Input event with nested object
  'update-input': (state: WorldComponentState, payload: WorldEventPayload<'update-input'>): WorldComponentState => {
    // payload is { target: { value: string } }
    return { ...state, userInput: payload.target.value };
  },
  
  // Complex payload with custom type
  'open-agent-edit': (state: WorldComponentState, agent: WorldEventPayload<'open-agent-edit'>): WorldComponentState => {
    // agent is Agent type
    return {
      ...state,
      showAgentEdit: true,
      selectedAgent: agent
    };
  },
  
  // Event with DOM event parameter (last parameter)
  'toggle-filter-with-stop': (state: WorldComponentState, agentId: string, e?: Event): WorldComponentState => {
    e?.stopPropagation(); // Prevent event bubbling
    
    const isActive = state.filters.includes(agentId);
    return {
      ...state,
      filters: isActive 
        ? state.filters.filter(id => id !== agentId)
        : [...state.filters, agentId]
    };
  },
  
  // Async generator for multiple re-renders
  'save-edit': async function* (state: WorldComponentState, payload: WorldEventPayload<'save-edit'>): AsyncGenerator<WorldComponentState> {
    // First render: show loading
    yield { ...state, loading: true, error: null };
    
    try {
      await api.saveEdit(payload.messageId, payload.text);
      
      // Second render: show success
      yield { ...state, loading: false, successMessage: 'Saved!' };
      
    } catch (error: any) {
      // Error render
      yield { ...state, loading: false, error: error.message };
    }
  },
};
```

### Domain Module Organization (40+ Events)

For very large components, split handlers into domain modules:

```
pages/world/
├── World.tsx              # Component class
├── World.update.ts        # Composed handlers
└── domain/
    ├── input.ts           # Input & send message (6 events)
    ├── editing.ts         # Message editing (4 events)
    ├── deletion.ts        # Message deletion (3 events)
    ├── chat-history.ts    # Chat CRUD (8 events)
    └── sse-streaming.ts   # SSE events (4 events)
```

```typescript
// domain/editing.ts
import type { WorldComponentState } from '../types';

/**
 * Editing Domain - Pure functions for message editing logic
 * Export for unit testing
 */
export const EditingDomain = {
  startEditMessage: (state: WorldComponentState, messageId: string, text: string): WorldComponentState => ({
    ...state,
    editingMessageId: messageId,
    editingText: text
  }),
  
  cancelEditMessage: (state: WorldComponentState): WorldComponentState => ({
    ...state,
    editingMessageId: null,
    editingText: ''
  }),
  
  updateEditText: (state: WorldComponentState, value: string): WorldComponentState => ({
    ...state,
    editingText: value
  }),
};

// World.update.ts - Compose domain modules
import { EditingDomain } from './domain/editing';
import { DeletionDomain } from './domain/deletion';
import { InputDomain } from './domain/input';

export const worldUpdateHandlers: Update<WorldComponentState, WorldEventName> = {
  // Editing events
  'start-edit-message': (state, payload) => 
    EditingDomain.startEditMessage(state, payload.messageId, payload.text),
  
  'cancel-edit-message': (state) => 
    EditingDomain.cancelEditMessage(state),
  
  'update-edit-text': (state, payload) => 
    EditingDomain.updateEditText(state, payload.target.value),
  
  // Deletion events
  'delete-message': (state, messageId) => 
    DeletionDomain.deleteMessage(state, messageId),
  
  // Input events
  'update-user-input': (state, payload) => 
    InputDomain.updateUserInput(state, payload.target.value),
  
  // ... other handlers
};
```

### Critical: Event Handler Format

**CRITICAL:** AppRun update handlers use **object format**, not array/tuple format.

```typescript
// ✅ CORRECT: Object format
export const handlers: Update<State, EventName> = {
  'event-name': (state, payload) => { ... },
  'another-event': (state) => { ... },
};

// ❌ WRONG: Array/tuple format (causes runtime errors)
export const handlers: Update<State, EventName> = [
  ['event-name', (state, payload) => { ... }],
  ['another-event', (state) => { ... }],
];
// Runtime Error: "Component action for '0' is not a valid function"
```

When spreading handlers:
```typescript
override update = {
  ...worldUpdateHandlers,    // ✅ Works with object format
  'local-event': (state) => { ... }
};
```

### DOM Event Handling

**When you need stopPropagation or preventDefault:**

Add the event as the **last parameter** in your handler:

```typescript
// Event type (payload stays the same)
| { name: 'toggle-badge'; payload: string }

// Handler with event parameter (last param)
'toggle-badge': (state, agentId: string, e?: Event): State => {
  e?.stopPropagation(); // Prevent parent click handlers
  
  return {
    ...state,
    activeAgentId: agentId
  };
}

// Call site - AppRun automatically passes DOM event as last parameter
<div $onclick={['toggle-badge', agent.id]}>
  Click me
</div>
```

**DO NOT** use inline onclick handlers:
```typescript
// ❌ WRONG: Inline DOM handler
<div onclick={(e: MouseEvent) => { e.stopPropagation(); app.run('toggle', id); }}>

// ✅ CORRECT: AppRun handler with event parameter
<div $onclick={['toggle', id]}>
```

---

## Parent-Child Integration Patterns

### Parent Component (Coordinates Children)
```typescript
export default class ParentComponent extends Component<ParentState> {
  view = (state: ParentState) => (
    <div className="parent-container">
      {/* Main content */}
      <DisplayComponent
        data={state.items}
        selectedItem={state.selectedItem}
        onItemClick={(item) => this.run('select-item', item)}
      />

      <button $onclick="open-create-modal">Create New</button>

      {/* Conditional popup rendering */}
      {state.showModal &&
        <ModalComponent
          data={state.selectedItemForEdit}
          mode={state.modalMode}
          parentComponent={this}
        />
      }
    </div>
  );

  update = {
    'select-item': (state, item) => ({
      ...state,
      selectedItem: item
    }),

    'open-create-modal': (state) => ({
      ...state,
      showModal: true,
      modalMode: 'create',
      selectedItemForEdit: null
    }),

    'close-modal': (state) => ({
      ...state,
      showModal: false
    }),

    // Global events from children
    // No return = no re-render before page reload
    'data-saved': (state) => {
      location.reload(); // Simple refresh
    }
  };
}
```

---

## Essential Rules & Checklists

### Event Handling Rules (Critical)

| Pattern                       | Use Case                | Example                                       |
| ----------------------------- | ----------------------- | --------------------------------------------- |
| `$bind="field"`               | Form fields (preferred) | `<input $bind="formData.name" />`             |
| `$onclick={[func]}`           | Direct function call    | `<button $onclick={[saveData]} />`            |
| `$onclick="action"`           | String action in update | `<button $onclick="save-data" />`             |
| `$onclick={['action', data]}` | Action with data        | `<button $onclick={['select-item', item]} />` |
| `onclick={(e) => ...}`        | DOM manipulation only   | `onclick={(e) => e.stopPropagation()}`        |

**❌ NEVER DO:** `$onclick={() => app.run('action')}` - This breaks AppRun patterns

### State Update Rules (Critical)

**Returning state triggers component re-render.** If no re-render is needed, don't return state.

#### Immutable Updates (Primary Pattern - Recommended)
```typescript
const stateUpdate = (state) => {
  return {
    ...state,
    field: newValue,
    items: [...state.items, newItem]
  }; // Return new state object to trigger re-render
}
```

```typescript
const stateUpdate = (state) => {
  // Perform side effects without returning
  api.trackEvent(state.field);
  // No return - no re-render triggered
}
```

#### Mutable Updates (Alternative Pattern - Allowed)
```typescript
const stateUpdate = (state) => {
  state.field = newValue;        // Direct mutation
  state.items.push(newItem);     // Direct mutation
  return state;                   // Return to trigger re-render
}
```

```typescript
const stateUpdate = (state) => {
  state.field = newValue;        // Mutate
  // No return - no re-render
}
```

**Key Rule:** Whether you use immutable or mutable updates, only return state when you want to trigger a re-render.

### Required State Properties

**✅ ALWAYS INCLUDE in component state:**
```typescript
interface ComponentState {
  loading: boolean;           // For async operations
  error: string | null;       // For error display
  successMessage?: string | null; // For success feedback
}
```

### TypeScript Interface Checklist

**✅ ALWAYS DEFINE:**
- [ ] Props interface with optional properties marked `?`
- [ ] State interface exported for testing
- [ ] Event types with discriminated union (for components with 10+ events)
- [ ] Generic types: `Component<StateType, EventName>` (add EventName for typed events)
- [ ] Async generator return types: `AsyncGenerator<StateType>`
- [ ] Payload helper types: `ComponentEventPayload<T>` (for typed events)

### Component Structure Checklist

**✅ REQUIRED ORDER:**
1. [ ] Imports
2. [ ] Props interface
3. [ ] State interface (exported)
4. [ ] Event types (if using typed events - 10+ events)
5. [ ] Helper functions
6. [ ] Action functions (exported)
7. [ ] Component class with proper generics

**For Large Components (10+ events):**
1. [ ] Create `types/events.ts` with discriminated union
2. [ ] Create domain modules in `domain/` directory (if 40+ events)
3. [ ] Compose handlers in `ComponentName.update.ts`
4. [ ] Import and use in component class

### View Method Checklist

**✅ REQUIRED PATTERN:**
1. [ ] Guard clauses first (error, loading, success)
2. [ ] Early returns for special states
3. [ ] Main content last
4. [ ] Defensive programming (default values, safe access)

### Popup Component Checklist

**✅ REQUIRED FEATURES:**
- [ ] Close button in header: `<button className="modal-close-btn" $onclick={close}>×</button>`
- [ ] Content click prevention: `onclick={(e) => e.stopPropagation()}`
- [ ] Position calculation with viewport bounds
- [ ] Parent component coordination via global events
- [ ] Keyboard support (Escape to close)

### Error Handling Checklist

**✅ REQUIRED PATTERNS:**
- [ ] Try-catch in all async functions
- [ ] Error state in component interface
- [ ] Error display in view guard clauses
- [ ] Loading states during async operations
- [ ] Success message with auto-close

---

## Quick Reference: Common Tasks

### Creating a Form Component
1. Use Pattern A (Stateful Class Component)
2. Include loading/error/success states
3. Use `$bind` for form fields
4. Export save/delete functions for `$onclick` references
5. Add form validation before API calls
6. Use `mounted()` if embedded in JSX, `state = async` only if top-level routed page

### Creating a Modal
1. Use Pattern B (Modal template)
2. **MUST use `mounted()` for state initialization** (modals are embedded in JSX)
3. Include close button in header for dismissal
4. Support success message auto-close
5. Coordinate with parent via global events
6. Position with viewport boundary checks

### Creating a List Display
1. Use Pattern C (Functional Component)
2. Destructure props with defaults
3. Add guard clauses for empty/loading states
4. Use callback props for parent communication

### Integrating Components
1. Parent manages popup visibility with boolean flags
2. Pass `parentComponent={this}` to children
3. Use global events for child-to-parent communication
4. Simple `location.reload()` for data refresh after CRUD

## Common Anti-Patterns to Avoid

**❌ DON'T: Use these patterns**
```typescript
// ❌ Don't use $on and run to trigger events
$onclick={() => app.run('action')}

// ❌ Don't forget error handling
async function save() {
  await api.save(); // No try/catch
}

// ❌ Don't use manual form handling when $bind is available
$oninput={(e) => setState({...state, field: e.target.value})}

// ❌ Don't mix component responsibilities
// A single component doing display + state + API calls + routing

// ❌ Don't forget defensive programming
messages.map() // messages might be undefined

// ❌ Don't use synchronous updates for async operations
'save-data': (state) => {
  api.save(state.data); // Should be async generator
  return { ...state, saved: true };
}
```

## Summary Checklist

Before submitting AppRun components, verify:

- [ ] Used correct component pattern (stateful class vs functional)
- [ ] Used `mounted()` for JSX embedded components (REQUIRED)
- [ ] Used `state = async` only for top-level routed pages
- [ ] Included loading, error, and successMessage in state
- [ ] Used $bind for form fields
- [ ] Used direct function references or string actions for $on directives
- [ ] State updates return state only when re-render is needed
- [ ] Preferred immutable state updates (or mutable if simpler for the use case)
- [ ] Used async generators (function*) for handlers needing multiple re-renders
- [ ] Included defensive programming with defaults
- [ ] Added proper error handling with try/catch
- [ ] Created TypeScript interfaces for props and state
- [ ] Used global events for parent-child coordination
- [ ] Followed modal structure pattern if applicable
- [ ] No anti-patterns present

**For Components with 10+ Events:**
- [ ] Created discriminated union event types
- [ ] Added generic types to Component class: `Component<State, EventName>`
- [ ] Used `WorldEventPayload<T>` for typed handler parameters
- [ ] Used object format for update handlers (not array)
- [ ] Used direct values for single-property payloads
- [ ] Used objects for multi-property payloads
- [ ] Added DOM event parameter (last param) for stopPropagation needs
- [ ] Extracted domain modules if component has 40+ events
- [ ] Created unit tests for domain logic
