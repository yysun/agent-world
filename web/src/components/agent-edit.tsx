/**
 * Agent Edit Component - Self-contained AppRun class component for agent CRUD operations
 * 
 * Features:
 * - Self-contained class component with internal state management using mounted lifecycle
 * - Handles all three modes: create, edit, and delete agents
 * - Module-level state update functions for easy testing and better organization
 * - Success messaging with auto-close functionality for all operations
 * - Direct function references in $on directives for better performance
 * - Modal overlay with backdrop click to close
 * - Form validation and error handling
 * 
 * Implementation:
 * - AppRun class component using mounted pattern for props-to-state initialization
 * - Module-level functions imported from agent-edit-functions.ts
 * - Direct function references: $oninput={[updateField, 'name']}
 * - Global events for parent coordination: 'agent-saved', 'agent-deleted'
 * - Success messages shown before auto-closing modal
 * - All business logic testable independently of UI
 * 
 * Event Flow:
 * - Form field changes: $oninput={[updateField, field]}
 * - Save button: $onclick={[saveAgent]}
 * - Delete button: $onclick={[deleteAgent]}
 * - Cancel/Close: $onclick={[closeModal]}
 * - Backdrop click: $onclick={[closeModal]}
 */

import { app, Component } from 'apprun';
import { 
  saveAgent, 
  deleteAgent, 
  closeModal, 
  initializeState,
  type AgentEditState,
  type AgentEditProps
} from './agent-edit-functions';

export default class AgentEdit extends Component<AgentEditState> {
  declare props: Readonly<AgentEditProps>;
  mounted = (props: AgentEditProps): AgentEditState => initializeState(props);

  view = (state: AgentEditState) => {
    // Success message view
    if (state.successMessage) {
      return (
        <div className="modal-backdrop" $onclick={[closeModal]}>
          <div className="modal-content" onclick={(e) => e.stopPropagation()}>
            <div className="modal-body">
              <div className="success-message">
                <h3>Success!</h3>
                <p>{state.successMessage}</p>
                <div className="loading-spinner">Closing...</div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    const isEditMode = state.mode === 'edit';
    const isDeleteMode = state.mode === 'delete';
    
    let title: string;
    if (isDeleteMode) {
      title = `Delete ${state.formData.name || 'Agent'}`;
    } else if (isEditMode) {
      title = `Edit ${state.formData.name || 'Agent'}`;
    } else {
      title = 'Create New Agent';
    }

    return (
      <div className="modal-backdrop" $onclick={[closeModal]}>
        <div className="modal-content" onclick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2 className="modal-title">{title}</h2>
            <button
              className="modal-close-btn"
              $onclick={[closeModal]}
              title="Close"
            >
              ×
            </button>
          </div>

          <div className="modal-body">
            {state.error && (
              <div className="error-message">
                {state.error}
              </div>
            )}

            {isDeleteMode ? (
              // Delete confirmation view
              <div className="delete-confirmation">
                <h3>Delete Agent</h3>
                <p>Are you sure you want to delete "{state.formData.name}"?</p>
                <p>This action cannot be undone.</p>
              </div>
            ) : (
              // Form view for create and edit modes
              <form className="agent-form">
                {/* Basic Information Section */}
                <div className="form-section">
                  <h3 className="section-title">Basic Information</h3>

                  <div className="form-group">
                    <label htmlFor="agent-name">Agent Name *</label>
                    <input
                      id="agent-name"
                      type="text"
                      className="form-input"
                      placeholder="Enter agent name"
                      value={state.formData.name}
                      $bind="formData.name"
                      disabled={state.loading}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="agent-description">Description</label>
                    <input
                      id="agent-description"
                      type="text"
                      className="form-input"
                      placeholder="Brief description of the agent"
                      value={state.formData.description}
                      $bind="formData.description"
                      disabled={state.loading}
                    />
                  </div>
                </div>

                {/* LLM Configuration Section */}
                <div className="form-section">
                  <h3 className="section-title">LLM Configuration</h3>

                  <div className="form-group">
                    <label htmlFor="agent-provider">Provider</label>
                    <select
                      id="agent-provider"
                      className="form-select"
                      value={state.formData.provider}
                      $bind="formData.provider"
                      disabled={state.loading}
                    >
                      <option value="">Select provider</option>
                      <option value="openai">OpenAI</option>
                      <option value="anthropic">Anthropic</option>
                      <option value="google">Google</option>
                      <option value="microsoft">Microsoft</option>
                      <option value="ollama">Ollama (Local)</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="agent-model">Model</label>
                    <input
                      id="agent-model"
                      type="text"
                      className="form-input"
                      placeholder="e.g. gpt-4, claude-3-sonnet, llama3.2:3b"
                      value={state.formData.model}
                      $bind="formData.model"
                      disabled={state.loading}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="agent-temperature">Temperature</label>
                    <input
                      id="agent-temperature"
                      type="number"
                      className="form-input"
                      placeholder="0.0 - 2.0"
                      min="0"
                      max="2"
                      step="0.1"
                      value={state.formData.temperature}
                      $bind="formData.temperature"
                      disabled={state.loading}
                    />
                  </div>
                </div>

                {/* System Prompt Section */}
                <div className="form-section">
                  <h3 className="section-title">System Prompt</h3>

                  <div className="form-group">
                    <textarea
                      id="agent-prompt"
                      className="form-textarea"
                      placeholder="Enter the system prompt for this agent..."
                      rows={8}
                      value={state.formData.systemPrompt}
                      $bind="formData.systemPrompt"
                      disabled={state.loading}
                    />
                  </div>
                </div>
              </form>
            )}
          </div>

          <div className="modal-footer">
            <div className="modal-actions">
              {isDeleteMode ? (
                // Delete mode buttons
                <div className="modal-primary-actions">
                  <button
                    className="btn btn-secondary"
                    $onclick={[closeModal]}
                    disabled={state.loading}
                  >
                    Cancel
                  </button>

                  <button
                    className="btn btn-danger"
                    $onclick={[deleteAgent]}
                    disabled={state.loading}
                  >
                    {state.loading ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              ) : (
                // Create/Edit mode buttons
                <>
                  {/* Delete button - only show in edit mode */}
                  {isEditMode && (
                    <button
                      className="btn btn-danger"
                      $onclick={[deleteAgent]}
                      disabled={state.loading}
                      title="Delete agent"
                    >
                      {state.loading ? 'Deleting...' : 'Delete'}
                    </button>
                  )}

                  <div className="modal-primary-actions">
                    <button
                      className="btn btn-secondary"
                      $onclick={[closeModal]}
                      disabled={state.loading}
                    >
                      Cancel
                    </button>

                    <button
                      className="btn btn-primary"
                      $onclick={[saveAgent]}
                      disabled={state.loading || !state.formData.name.trim()}
                    >
                      {state.loading ? 'Saving...' : (isEditMode ? 'Update' : 'Create')}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };
}
