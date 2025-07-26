# Implementation Plan: Convert Edit Components to Self-Contained AppRun Components

## Overview
Refactor `world-edit` and `agent-edit` from functional presentation components to class-based AppRun components using proper `mounted` pattern for state management.

## Implementation Steps (Simple → Complex)

### Step 1: Analyze Current Architecture
- [ ] Document current parent state objects (`agentEdit`, `worldEdit`)
- [ ] Identify which state belongs to parent vs child
- [ ] Map current event handlers and data flow
- [ ] Document current component props and interfaces

### Step 2: Create AgentEdit Class Component (Simpler Component First)
- [ ] Convert functional `AgentEdit` to class component
- [ ] **Create module-level state update functions** for better testing
- [ ] Implement `mounted` method to receive props as initial state
- [ ] Create local state interface for form data, loading, error
- [ ] Add basic `view` method (copy existing JSX)
- [ ] Test component renders without functionality

### Step 3: Add Local State Management to AgentEdit
- [ ] **Implement module-level functions** for form field changes (`updateField`)
- [ ] **Use direct function references** in $on directives (e.g., `$oninput={[updateField, 'name']}`)
- [ ] Add form validation logic within module functions
- [ ] Add loading and error state management functions
- [ ] **Add success message state** for operation results
- [ ] Update JSX to use direct function references in events
- [ ] Test form interactions work locally
- [ ] **Write unit tests** for individual state update functions

### Step 4: Add CRUD Operations to AgentEdit
- [ ] **Implement module-level async functions** for save/delete operations (`saveAgent`, `deleteAgent`)
- [ ] **Add success messaging** for all three operations (created/updated/deleted)
- [ ] **Add auto-close functionality** after showing success message (2-3 seconds)
- [ ] Add API calls with proper error handling in module functions
- [ ] **Use direct function references** in JSX (e.g., `$onclick={[saveAgent]}`)
- [ ] Add global events for parent coordination (`app.run('agent-saved')`, `app.run('agent-deleted')`)
- [ ] **Write unit tests** for CRUD functions
- [ ] Test all CRUD operations work end-to-end with success messages

### Step 5: Simplify World Component for AgentEdit
- [ ] Remove `agentEdit` complex state object from `WorldComponentState`
- [ ] Add simple `showAgentEdit` boolean flag
- [ ] Remove agent edit update handlers from World component
- [ ] Update World view to use conditional rendering pattern
- [ ] Add global event listeners for agent CRUD completion
- [ ] Test World component with new AgentEdit

### Step 6: Create WorldEdit Class Component (Similar Pattern)
- [ ] Convert functional `WorldEdit` to class component using AgentEdit as template
- [ ] **Create module-level functions** for world operations following same pattern
- [ ] Implement `mounted` method for world-specific props
- [ ] Add local state management for world form data
- [ ] **Implement all three modes**: create, edit, delete for worlds
- [ ] **Add success messaging** for world operations (created/updated/deleted)
- [ ] **Use direct function references** in world form JSX
- [ ] Implement world CRUD operations with proper error handling
- [ ] Add global events for completion (`app.run('world-saved')`, `app.run('world-deleted')`)
- [ ] **Write unit tests** for world operation functions
- [ ] Test WorldEdit component independently with all modes

### Step 7: Simplify Home Component for WorldEdit
- [ ] Remove `worldEdit` complex state object from `HomeState`
- [ ] Add simple `showWorldEdit` boolean flag  
- [ ] Remove world edit update handlers from Home component
- [ ] Update Home view to use conditional rendering
- [ ] Add global event listeners for world CRUD completion
- [ ] Test Home component with new WorldEdit

### Step 8: Clean Up and Optimize
- [ ] Remove unused interfaces (`AgentEditState`, `WorldEditState` from parent state)
- [ ] Remove unused update handlers from world-update-agent.ts
- [ ] Update TypeScript types and interfaces
- [ ] Remove redundant imports and exports
- [ ] **Optimize module-level function organization** and exports
- [ ] **Add comprehensive unit test suite** for all state update functions
- [ ] Optimize component re-rendering

### Step 9: Testing and Validation
- [ ] Test agent create flow with success message
- [ ] Test agent edit flow with success message
- [ ] Test agent delete flow with success message
- [ ] Test world create flow with success message
- [ ] Test world edit flow with success message
- [ ] Test world delete flow with success message
- [ ] Verify form interactions don't cause parent re-renders
- [ ] Test error handling and validation for all modes
- [ ] Test modal auto-close behavior after success messages
- [ ] Test modal open/close behavior
- [ ] Run type checking (`npm run check`)
- [ ] Test in browser for runtime errors
- [ ] Verify performance improvements

## Technical Implementation Details

### Module-Level Functions Pattern
```typescript
// agent-edit-functions.ts - Separate module for easy testing
export const updateField = (state: AgentEditState, field: string, e: Event): AgentEditState => {
  const target = e.target as HTMLInputElement;
  return {
    ...state,
    formData: { ...state.formData, [field]: target.value },
    error: null
  };
};

export const saveAgent = async function* (state: AgentEditState): AsyncGenerator<AgentEditState> {
  yield { ...state, loading: true, error: null };
  try {
    if (state.mode === 'create') {
      await createAgent(state.worldName, state.formData);
    } else {
      await updateAgent(state.worldName, state.formData.name, state.formData);
    }
    
    const successMessage = state.mode === 'create' 
      ? 'Agent created successfully!' 
      : 'Agent updated successfully!';
      
    yield { ...state, loading: false, successMessage };
    setTimeout(() => app.run('agent-saved'), 2000);
  } catch (error) {
    yield { ...state, loading: false, error: error.message };
  }
};

export const deleteAgent = async function* (state: AgentEditState): AsyncGenerator<AgentEditState> {
  yield { ...state, loading: true, error: null };
  try {
    await deleteAgentAPI(state.worldName, state.formData.name);
    yield { 
      ...state, 
      loading: false, 
      successMessage: 'Agent deleted successfully!' 
    };
    setTimeout(() => app.run('agent-deleted'), 2000);
  } catch (error) {
    yield { ...state, loading: false, error: error.message };
  }
};

export const closeModal = (): void => {
  app.run('close-agent-edit');
};
```

### AppRun Component Pattern
```typescript
// agent-edit.tsx
import { updateField, saveAgent, deleteAgent, closeModal } from './agent-edit-functions';

// Component State Interface
interface AgentEditState {
  mode: 'create' | 'edit' | 'delete';
  worldName: string;
  formData: {
    name: string;
    description: string;
    provider: string;
    model: string;
    temperature: number;
    systemPrompt: string;
  };
  loading: boolean;
  error: string | null;
  successMessage: string | null; // For operation success feedback
}

// Class Component Structure
export default class AgentEdit extends Component<AgentEditState> {
  mounted = (props: AgentEditProps): AgentEditState => ({
    mode: props.mode || 'create',
    worldName: props.worldName,
    formData: props.agent ? mapAgentToForm(props.agent) : getDefaultForm(),
    loading: false,
    error: null,
    successMessage: null
  });

  view = (state: AgentEditState) => (
    <div className="modal-backdrop" $onclick={[closeModal]}>
      <div className="modal-content" onclick={(e) => e.stopPropagation()}>
        {state.successMessage ? (
          // Success message view
          <div className="success-message">
            <h3>Success!</h3>
            <p>{state.successMessage}</p>
            <div className="loading-spinner">Closing...</div>
          </div>
        ) : (
          // Form view based on mode
          <div>
            {state.mode === 'delete' ? (
              <div className="delete-confirmation">
                <h3>Delete Agent</h3>
                <p>Are you sure you want to delete "{state.formData.name}"?</p>
                <button $onclick={[deleteAgent]} disabled={state.loading}>
                  {state.loading ? 'Deleting...' : 'Delete'}
                </button>
                <button $onclick={[closeModal]}>Cancel</button>
              </div>
            ) : (
              <form>
                <h3>{state.mode === 'create' ? 'Create Agent' : 'Edit Agent'}</h3>
                <input
                  type="text"
                  placeholder="Agent name"
                  value={state.formData.name}
                  $oninput={[updateField, 'name']}
                  disabled={state.loading}
                />
                <textarea
                  placeholder="System prompt"
                  value={state.formData.systemPrompt}
                  $oninput={[updateField, 'systemPrompt']}
                  disabled={state.loading}
                />
                <button $onclick={[saveAgent]} disabled={state.loading}>
                  {state.loading ? 'Saving...' : (state.mode === 'create' ? 'Create' : 'Update')}
                </button>
                <button $onclick={[closeModal]}>Cancel</button>
              </form>
            )}
            {state.error && <div className="error-message">{state.error}</div>}
          </div>
        )}
      </div>
    </div>
  );

  // Only use update object for global events if needed
  // Local events use direct function references
}
```

### Parent Component Pattern
```typescript
// Simplified Parent State
interface WorldComponentState {
  // Core data
  world: World | null;
  agents: Agent[];
  
  // Simple UI flags
  showAgentEdit: boolean;
  editMode: 'create' | 'edit' | 'delete'; // Add mode tracking
  selectedAgent: Agent | null;
}

// Conditional Rendering
view = (state: WorldComponentState) => (
  <div>
    {/* Core world UI */}
    
    {state.showAgentEdit && 
      <AgentEdit 
        agent={state.selectedAgent} 
        mode={state.editMode} // Pass the edit mode
        worldName={state.worldName}
      />
    }
  </div>
);

// Simplified Update Handlers
update = {
  'open-agent-create': (state) => ({
    ...state,
    showAgentEdit: true,
    editMode: 'create',
    selectedAgent: null
  }),
  
  'open-agent-edit': (state, agent) => ({
    ...state,
    showAgentEdit: true,
    editMode: 'edit',
    selectedAgent: agent
  }),
  
  'open-agent-delete': (state, agent) => ({
    ...state,
    showAgentEdit: true,
    editMode: 'delete',
    selectedAgent: agent
  }),
  
  'close-agent-edit': (state) => ({
    ...state,
    showAgentEdit: false
  }),
  
  'agent-saved': async (state) => {
    const agents = await getAgents(state.worldName);
    return { 
      ...state, 
      agents, 
      showAgentEdit: false 
    };
  },
  
  'agent-deleted': async (state) => {
    const agents = await getAgents(state.worldName);
    return { 
      ...state, 
      agents, 
      showAgentEdit: false 
    };
  }
};
```

## Benefits of This Approach

### Module-Level Functions
- **Easy Testing**: Functions can be unit tested independently without component setup
- **Reusability**: Same functions can be used across different components
- **Clear Separation**: Business logic separated from UI rendering
- **Better Organization**: Related functions grouped in dedicated modules

### Performance Improvements
- Form typing doesn't re-render parent components
- Only final save/delete operations trigger parent updates
- Component can optimize its own rendering independently

### Code Organization
- Clear separation: parent manages core data, child manages form state
- Self-contained components are easier to test and debug
- Reduced coupling between parent and child components

### Maintainability
- Components follow AppRun best practices with `mounted` lifecycle
- Easy to reuse edit components in different contexts
- Simpler parent state management and event handling

### Developer Experience
- TypeScript types are cleaner and more focused
- Event flow is more predictable and easier to trace
- Debugging is easier with isolated component state
- **Unit testing is straightforward** with module-level functions
