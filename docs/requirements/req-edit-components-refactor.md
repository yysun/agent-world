# Requirements: Convert world-edit and agent-edit to self-contained class components

## What
- Refactor the `world-edit` and `agent-edit` components from functional (presentation) components to class-based AppRun components following proper AppRun patterns.
- Each component manages its own state internally using the `mounted` lifecycle method to receive props as initial state.
- Components handle **all three CRUD operations**: create, edit (update), and delete within the same component.
- Remove complex `worldEdit` and `agentEdit` state objects from parent components.
- Replace with simple boolean flags for conditional rendering (e.g., `showAgentEdit`).
- Components use local update handlers for form interactions and global events for parent coordination.
- **Success messaging**: Show result messages for all operations (created, updated, deleted) before closing the modal.

## Why
- **Proper AppRun Architecture**: Follow AppRun's recommended pattern where components own their state via `mounted`.
- **Module-level Functions**: Use direct function references in $on directives for easier testing and better organization.
- **Reduced Coupling**: Parent doesn't manage child's internal form state, validation, or loading states.
- **Better Performance**: Form interactions don't trigger parent re-renders.
- **Cleaner Parent State**: Parent only tracks what it needs - core data and simple UI flags.
- **True Encapsulation**: Each edit component is self-contained and reusable.
- **Testable Functions**: State update functions are module-level, making unit testing straightforward.

## AppRun Pattern
```typescript
// Module-level state update functions (easier testing)
const updateField = (state, field, e) => ({
  ...state,
  formData: { ...state.formData, [field]: e.target.value }
});

const saveAgent = async function* (state) {
  yield { ...state, loading: true };
  const result = await (state.mode === 'create' ? createAgent : updateAgent)(...);
  yield { 
    ...state, 
    loading: false, 
    successMessage: `Agent ${state.mode === 'create' ? 'created' : 'updated'} successfully!` 
  };
  setTimeout(() => app.run('agent-saved'), 2000);
};

const deleteAgent = async function* (state) {
  yield { ...state, loading: true };
  await deleteAgentAPI(state.worldName, state.formData.name);
  yield { 
    ...state, 
    loading: false, 
    successMessage: 'Agent deleted successfully!' 
  };
  setTimeout(() => app.run('agent-deleted'), 2000);
};

// Child Component Pattern
class AgentEdit extends Component {
  mounted = (props) => ({
    mode: props.mode, // 'create' | 'edit' | 'delete'
    worldName: props.worldName,
    formData: props.agent ? mapToForm(props.agent) : getDefaults(),
    loading: false,
    error: null,
    successMessage: null
  });

  view = (state) => (
    <div className="modal-backdrop">
      <input 
        value={state.formData.name}
        $oninput={[updateField, 'name']}  // Direct function reference
      />
      <button $onclick={[saveAgent]}>Save</button>
      <button $onclick={[deleteAgent]}>Delete</button>
    </div>
  );

  // Optional: Can still use update object for global events
  update = {
    'close': () => app.run('close-agent-edit')
  };
}

// Parent Component Pattern
view = (state) => (
  <div>
    {state.showAgentEdit && 
      <AgentEdit 
        agent={state.selectedAgent} 
        mode={state.editMode} // 'create' | 'edit' | 'delete'
        worldName={state.worldName}
      />
    }
  </div>
);
```

## Out of Scope
- No UI/UX redesign or visual changes.
- No changes to API endpoints or data models.
- No changes to unrelated components.
- No changes to existing functionality - only architectural refactoring.

## Acceptance Criteria
- `world-edit` and `agent-edit` are class-based AppRun components using `mounted` for initial state.
- **Module-level functions**: State update functions are defined at module level and referenced directly in $on directives.
- Components handle **all three modes**: create, edit (update), and delete operations.
- **Success messages displayed**: After successful operations, show confirmation message before auto-closing modal.
- **Delete mode**: Shows delete confirmation UI and success message after deletion.
- **Edit mode**: Shows form fields and success message after update.
- **Create mode**: Shows empty form and success message after creation.
- Parent components use simple boolean flags for conditional rendering instead of complex state objects.
- Components handle their own form validation, loading states, and error handling.
- Global events used for parent-child coordination (e.g., `app.run('agent-saved')`, `app.run('agent-deleted')`).
- **Easy testing**: State update functions can be unit tested independently.
- All existing features and functionality preserved.
- App runs without type or runtime errors.
- Form interactions don't cause parent component re-renders.
