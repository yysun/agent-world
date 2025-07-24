# AppRun Component Creation Guide

## Core Architecture Patterns

AppRun follows the State-View-Update architecture with TypeScript support. Choose the appropriate component pattern based on your needs:

### **Class Components (Container/Smart Components)**
Use for components that manage state, handle side effects, and coordinate data flow.

### **Functional Components (Presentation/Dumb Components)**
Use for components that only render UI based on props with minimal logic.

## Component Patterns

### **Pattern 1: Class-Based Container Component**

#### **State Interface**
```typescript
interface ComponentState {
  data: DataType[];
  loading: boolean;
  error: string | null;
  // UI state
  selectedItem: DataType | null;
  isEditing: boolean;
}
```

#### **Component Structure**
```typescript
export default class MyComponent extends Component<ComponentState> {
  state = async (): Promise<ComponentState> => {
    // Initial state with async data loading
    try {
      const data = await loadData();
      return {
        data,
        loading: false,
        error: null,
        selectedItem: null,
        isEditing: false
      };
    } catch (error) {
      return {
        data: [],
        loading: false,
        error: error.message,
        selectedItem: null,
        isEditing: false
      };
    }
  };

  view = (state: ComponentState) => {
    // Guard clauses for early returns
    if (state.loading) return <div>Loading...</div>;
    if (state.error) return <div>Error: {state.error}</div>;
    if (state.data.length === 0) return <div>No data</div>;
    
    // Main content
    return (
      <div>
        {/* Render main UI */}
        <PresentationComponent
          data={state.data}
          selectedItem={state.selectedItem}
          onSelect={(item) => this.run('select-item', item)}
        />
      </div>
    );
  };

  update = {
    'select-item': (state: ComponentState, item: DataType): ComponentState => ({
      ...state,
      selectedItem: item
    }),

    'async-action': async function* (state: ComponentState): AsyncGenerator<ComponentState> {
      try {
        yield { ...state, loading: true, error: null };
        const result = await performAsyncAction();
        yield { ...state, loading: false, data: result };
      } catch (error) {
        yield { ...state, loading: false, error: error.message };
      }
    },

    'side-effect-action': (state: ComponentState): void => {
      // No return value = no re-render
      window.location.href = '/new-page';
    }
  };
}
```

### **Pattern 2: Functional Presentation Component**

```typescript
interface ComponentProps {
  data: DataType[];
  selectedItem: DataType | null;
  loading?: boolean;
  error?: string | null;
  // Event handlers
  onSelect?: (item: DataType) => void;
  onDelete?: (id: string) => void;
}

export default function MyPresentationComponent(props: ComponentProps) {
  const {
    data,
    selectedItem,
    loading = false,
    error = null,
    onSelect,
    onDelete
  } = props;

  // Guard clauses
  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (data.length === 0) return <div>No data</div>;

  return (
    <div>
      {data.map(item => (
        <div 
          key={item.id}
          $onclick={['select-item', item]}
          className={selectedItem?.id === item.id ? 'selected' : ''}
        >
          {item.name}
          <button $onclick={['delete-item', item.id]}>Delete</button>
        </div>
      ))}
    </div>
  );
}
```

## Event Handling Rules

### **✅ DO: Use $on Directives for State Updates**

```typescript
// String actions (handled in parent's update object)
$onclick="action-name"
$oninput="update-field"

// Tuple actions (pass data to handler)
$onclick={['action-name', data]}
$oninput={['update-field', 'fieldName']}
$onchange={['update-dropdown', 'provider']}

// Direct function references (functions that return new state)
$onclick={updateFunction}
```

### **✅ DO: Use Regular Properties for Non-State Actions**

```typescript
// DOM manipulation only
onclick={(e) => e.stopPropagation()}
onmouseenter={(e) => e.target.focus()}

// Side effects (functions that call app.run() or navigate)
onclick={handleSideEffect}  // function calls app.run() internally
onclick={() => window.open('/new-page')}

// Event prevention
onsubmit={(e) => e.preventDefault()}
```

### **❌ DON'T: Mix Patterns Incorrectly**

```typescript
// ❌ Don't use $on with app.run() calls
$onclick={() => app.run('action')}
$onclick={(e) => this.run('action', e.target.value)}

// ❌ Don't use regular props for state updates
onclick="action-name"  // Use $onclick for state updates

// ❌ Don't use arrow functions for simple state updates
$onclick={(e) => ({ ...state, field: e.target.value })}
```

## Update Function Patterns

### **State Update Functions**
```typescript
// Synchronous state update
'action-name': (state: State, payload?: any): State => ({
  ...state,
  // immutable updates
  field: newValue
}),

// Async progressive updates
'async-action': async function* (state: State, payload?: any): AsyncGenerator<State> {
  try {
    yield { ...state, loading: true, error: null };
    const result = await asyncOperation(payload);
    yield { ...state, loading: false, data: result };
  } catch (error) {
    yield { ...state, loading: false, error: error.message };
  }
},

// Side effect (no re-render)
'navigate-action': (state: State, path: string): void => {
  window.location.href = path;
},

// Form field updates (common pattern)
'update-form-field': (state: State, field: string, event: Event): State => {
  const target = event.target as HTMLInputElement;
  const value = target.type === 'number' ? parseFloat(target.value) || 0 : target.value;
  
  return {
    ...state,
    formData: {
      ...state.formData,
      [field]: value
    }
  };
}
```

## Component Composition Patterns

### **Container + Presentation Pattern**
```typescript
// Container Component (manages state)
export default class WorldComponent extends Component<WorldState> {
  view = (state: WorldState) => (
    <div>
      <WorldChat
        messages={state.messages}
        userInput={state.userInput}
        onSendMessage={(text) => this.run('send-message', text)}
      />
      <WorldSettings
        world={state.world}
        selectedAgent={state.selectedAgent}
        onEditAgent={(agent) => this.run('edit-agent', agent)}
      />
    </div>
  );
}

// Presentation Components (stateless)
function WorldChat(props: WorldChatProps) { /* render only */ }
function WorldSettings(props: WorldSettingsProps) { /* render only */ }
```

## State Management Rules

### **✅ DO: Immutable Updates**
```typescript
// Spread operator for updates
{ ...state, field: newValue }

// Nested object updates
{
  ...state,
  nested: {
    ...state.nested,
    field: newValue
  }
}

// Array updates
{
  ...state,
  items: [...state.items, newItem],
  filteredItems: state.items.filter(item => item.id !== deletedId)
}
```

### **✅ DO: Defensive Programming**
```typescript
// Safe array operations
messages: state.messages || []
count: (state.items || []).length

// Safe object access
selectedItem: state.selectedItem?.name || 'None'

// Default props in functional components
const { data = [], loading = false } = props;
```

### **❌ DON'T: Mutate State**
```typescript
// ❌ Don't mutate existing state
state.field = newValue;
state.items.push(newItem);
state.nested.field = value;

// ❌ Don't use non-immutable array methods
state.items.sort();
state.items.reverse();
```

## Error Handling Patterns

### **Component Error States**
```typescript
// State interface includes error
interface State {
  data: DataType[];
  loading: boolean;
  error: string | null;
}

// View handles error states
view = (state: State) => {
  if (state.error) {
    return (
      <div className="error-state">
        <p>Error: {state.error}</p>
        <button $onclick="retry-action">Retry</button>
      </div>
    );
  }
  // ... rest of view
};

// Update functions handle errors
'load-data': async function* (state: State): AsyncGenerator<State> {
  try {
    yield { ...state, loading: true, error: null };
    const data = await fetchData();
    yield { ...state, loading: false, data, error: null };
  } catch (error: any) {
    yield { ...state, loading: false, error: error.message || 'Unknown error' };
  }
}
```

## Best Practices Summary

### **Component Design**
- Use class components for state management and coordination
- Use functional components for presentation and simple logic
- Implement guard clauses for loading/error/empty states
- Follow single responsibility principle

### **Event Handling**
- `$on` directives for state updates only
- Regular properties for DOM manipulation and side effects
- Use tuple actions to pass data: `$onclick={['action', data]}`
- Avoid arrow functions in JSX for state updates

### **State Management**
- Always use immutable updates with spread operator
- Include loading, error, and data states
- Use async generators for progressive updates
- Implement defensive programming with null checks

### **Type Safety**
- Define comprehensive state interfaces
- Use proper TypeScript types for all functions
- Type event handlers correctly
- Provide default values for optional props

This guide covers all AppRun patterns found in modern applications and provides clear rules for consistent development.
