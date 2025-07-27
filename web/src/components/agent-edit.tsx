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
 * - Parent component integration for coordinated modal management
 * 
 * Implementation:
 * - AppRun class component using mounted pattern for props-to-state initialization
 * - Module-level functions defined in same file for consolidation
 * - Direct function references: $onclick={closeModal}
 * - Global events for parent coordination: 'agent-saved', 'agent-deleted'
 * - Parent component.run() calls when parentComponent prop provided
 * - Success messages shown before auto-closing modal
 * - All business logic testable independently of UI
 * 
 * Event Flow:
 * - Form field changes: $bind="agent.name"
 * - Save button: $onclick={[saveAgent]}
 * - Delete button: $onclick={[deleteAgent]}
 * - Cancel/Close: $onclick={closeModal}
 * - Backdrop click: $onclick={closeModal}
 */

import { app, Component } from 'apprun';
import type { Agent, LLMProvider } from '../types';
import api from '../api';

// Props interface for the component initialization
interface AgentEditProps {
  agent?: Agent | null;
  mode?: 'create' | 'edit' | 'delete';
  worldName: string;
  parentComponent?: any;
}

// Initialize component state from props
const getStateFromProps = (props: AgentEditProps): AgentEditState => ({
  mode: props.mode || 'create',
  worldName: props.worldName,
  agent: props.agent || defaultAgentData,
  parentComponent: props.parentComponent,
  loading: false,
});

export const defaultAgentData: Partial<Agent> = {
  name: '',
  description: '',
  provider: 'ollama' as LLMProvider,
  model: 'llama3.2:3b',
  temperature: 0.7,
  systemPrompt: 'You are a helpful assistant.',
};

export interface AgentEditState {
  mode: 'create' | 'edit' | 'delete';
  worldName: string;
  agent: Partial<Agent>;
  parentComponent?: any;
  loading: boolean;
  error?: string | null;
  successMessage?: string | null;
}


// Save agent function (handles both create and update)
export const saveAgent = async function* (state: AgentEditState): AsyncGenerator<AgentEditState> {
  // Form validation
  if (!state.agent.name.trim()) {
    yield { ...state, error: 'Agent name is required' };
    return;
  }

  // Set loading state
  yield { ...state, loading: true, error: null };

  try {
    if (state.mode === 'create') {
      await api.createAgent(state.worldName, state.agent);
    } else {
      await api.updateAgent(state.worldName, state.agent.name, state.agent);
    }

    const successMessage = state.mode === 'create'
      ? 'Agent created successfully!'
      : 'Agent updated successfully!';

    // Show success message
    yield { ...state, loading: false, successMessage };

    // Auto-close after showing success message
    setTimeout(() => {
      state.parentComponent.run('agent-saved');
    }, 2000);

  } catch (error: any) {
    yield {
      ...state,
      loading: false,
      error: error.message || 'Failed to save agent'
    };
  }
};

// Delete agent function
export const deleteAgent = async function* (state: AgentEditState): AsyncGenerator<AgentEditState> {
  // Set loading state
  yield { ...state, loading: true, error: null };

  try {
    await api.deleteAgent(state.worldName, state.agent.name);

    // Show success message
    yield {
      ...state,
      loading: false,
      successMessage: 'Agent deleted successfully!'
    };

    // Auto-close after showing success message
    setTimeout(() => {
      state.parentComponent.run('agent-deleted');
    }, 2000);

  } catch (error: any) {
    yield {
      ...state,
      loading: false,
      error: error.message || 'Failed to delete agent'
    };
  }
};

// Close modal function
export const closeModal = (state?: AgentEditState): void => {
  if (state?.parentComponent && typeof state.parentComponent.run === 'function') {
    state.parentComponent.run('close-agent-edit');
  } else {
    app.run('close-agent-edit');
  }
};





export default class AgentEdit extends Component<AgentEditState> {
  declare props: Readonly<AgentEditProps>;
  mounted = (props: AgentEditProps): AgentEditState => getStateFromProps(props);

  state: AgentEditState = {
    mode: 'create',
    worldName: '',
    agent: defaultAgentData,
    parentComponent: undefined,
    loading: true,
  };

  view = (state: AgentEditState) => {
    if (state.loading) {
      return (
        <div className="modal-backdrop">
          <div className="modal-content">
            <div className="modal-body">
              <div className="loading-spinner">
                {state.mode === 'create' ? 'Creating agent...' :
                  state.mode === 'edit' ? 'Updating agent...' : 'Deleting agent...'}
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Success message view
    if (state.successMessage) {
      return (
        <div className="modal-backdrop" $onclick={closeModal}>
          <div className="modal-content" onclick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Success!</h2>
              <button
                className="modal-close-btn"
                $onclick={closeModal}
                title="Close"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="success-message">
                <p style="font-size: 1rem;">{state.successMessage}</p>
                <div className="loading-spinner" style="font-size: 0.9rem;">Closing...</div>
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
      title = `Delete ${state.agent.name || 'Agent'}`;
    } else if (isEditMode) {
      title = `Edit ${state.agent.name || 'Agent'}`;
    } else {
      title = 'Create New Agent';
    }

    return (
      <div className="modal-backdrop" $onclick={closeModal}>
        <div className="modal-content" onclick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2 className="modal-title">{title}</h2>
            <button
              className="modal-close-btn"
              $onclick={closeModal}
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
                <p style="font-size: 1rem;">Are you sure you want to delete <span style="font-size: 1.2rem;">"{state.agent.name}"</span>?</p>
                <p style="font-size: 1rem;">This action cannot be undone.</p>
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
                      value={state.agent.name}
                      $bind="agent.name"
                      disabled={state.loading || isEditMode}
                    />
                  </div>

                  {/* <div className="form-group">
                    <label htmlFor="agent-description">Description</label>
                    <input
                      id="agent-description"
                      type="text"
                      className="form-input"
                      placeholder="Brief description of the agent"
                      value={state.agent.description}
                      $bind="agent.description"
                      disabled={state.loading}
                    />
                  </div> */}
                </div>

                {/* LLM Configuration Section */}
                <div className="form-section">
                  <h3 className="section-title">LLM Configuration</h3>

                  <div className="form-group">
                    <label htmlFor="agent-provider">Provider</label>
                    <select
                      id="agent-provider"
                      className="form-select"
                      value={state.agent.provider}
                      $bind="agent.provider"
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
                      value={state.agent.model}
                      $bind="agent.model"
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
                      value={state.agent.temperature}
                      $bind="agent.temperature"
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
                      value={state.agent.systemPrompt}
                      $bind="agent.systemPrompt"
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
                // Delete mode buttons - align to right like create mode
                <div className="modal-primary-actions" style="margin-left: auto;">
                  <button
                    className="btn btn-secondary"
                    $onclick={closeModal}
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
              ) : isEditMode ? (
                // Edit mode buttons - delete on left, primary actions on right
                <>
                  <button
                    className="btn btn-danger"
                    $onclick={[deleteAgent]}
                    disabled={state.loading}
                    title="Delete agent"
                  >
                    {state.loading ? 'Deleting...' : 'Delete'}
                  </button>

                  <div className="modal-primary-actions">
                    <button
                      className="btn btn-secondary"
                      $onclick={closeModal}
                      disabled={state.loading}
                    >
                      Cancel
                    </button>

                    <button
                      className="btn btn-primary"
                      $onclick={[saveAgent]}
                      disabled={state.loading || !state.agent.name.trim()}
                    >
                      {state.loading ? 'Saving...' : 'Update'}
                    </button>
                  </div>
                </>
              ) : (
                // Create mode buttons - align to right with margin-left: auto
                <div className="modal-primary-actions" style="margin-left: auto;">
                  <button
                    className="btn btn-secondary"
                    $onclick={closeModal}
                    disabled={state.loading}
                  >
                    Cancel
                  </button>

                  <button
                    className="btn btn-primary"
                    $onclick={[saveAgent]}
                    disabled={state.loading || !state.agent.name.trim()}
                  >
                    {state.loading ? 'Saving...' : 'Create'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };
}
