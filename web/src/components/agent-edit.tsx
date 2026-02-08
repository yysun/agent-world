/**
 * Agent Edit Component - Modal CRUD operations for agent management
 *
 * Features:
 * - Self-contained AppRun class component with create/edit/delete modes
 * - Modal overlay with form validation (no backdrop click to close)
 * - Success messaging with auto-close and parent component integration
 * - Global event publishing for coordinated modal management
 * - Standardized modal sizing via shared 'edit-modal' class (parity with World Edit)
 */

import { app, Component } from 'apprun';
import type { AgentEditProps, AgentEditState, Agent, LLMProvider } from '../types';
import api from '../api';
import { formatErrorAsHtml, formatValidationError } from '../utils/error-formatting';
import type { ValidationError } from '../utils/error-formatting';

// Initialize component state from props
const getStateFromProps = (props: AgentEditProps): AgentEditState => ({
  mode: props.mode || 'create',
  worldName: props.worldName,
  agent: props.agent || defaultAgentData,
  parentComponent: props.parentComponent,
  loading: false,
  error: null,
  errorDetails: null,
});

export const defaultAgentData: Partial<Agent> = {
  name: '',
  description: '',
  provider: 'ollama' as LLMProvider,
  model: 'llama3.2:3b',
  temperature: 0.7,
  maxTokens: 2048,
  systemPrompt: 'You are a helpful assistant.',
};


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
    // Ensure numeric values are numbers
    const agentData = {
      ...state.agent,
      temperature: Number(state.agent.temperature),
      maxTokens: Number(state.agent.maxTokens)
    };

    if (state.mode === 'create') {
      await api.createAgent(state.worldName, agentData);
    } else {
      await api.updateAgent(state.worldName, state.agent.name, agentData);
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
    const formattedError = formatErrorAsHtml(error);
    yield {
      ...state,
      loading: false,
      error: formattedError.message,
      errorDetails: formattedError.details || null
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
    const formattedError = formatErrorAsHtml(error);
    yield {
      ...state,
      loading: false,
      error: formattedError.message,
      errorDetails: formattedError.details || null
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
    error: null,
    errorDetails: null,
  };

  view = (state: AgentEditState) => {
    if (state.loading) {
      return (
        <div className="modal-backdrop">
          <div className="modal-content edit-modal">
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
        <div className="modal-backdrop">
          <div className="modal-content edit-modal" onclick={(e) => e.stopPropagation()}>
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
                <p>{state.successMessage}</p>
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
      <div className="modal-backdrop">
        <div className="modal-content edit-modal" onclick={(e) => e.stopPropagation()}>
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
                <div className="error-main">{state.error}</div>
                {state.errorDetails && state.errorDetails.length > 0 && (
                  <div className="error-details">
                    <div className="error-details-title">Validation errors:</div>
                    <ul className="error-details-list">
                      {state.errorDetails.map((detail: ValidationError, index: number) => (
                        <li key={index} className="error-detail-item">
                          {formatValidationError(detail)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {isDeleteMode ? (
              // Delete confirmation view
              <div className="delete-confirmation">
                <p className="delete-confirmation-text">Are you sure you want to delete <span className="delete-confirmation-name">"{state.agent.name}"</span>?</p>
                <p className="delete-confirmation-text">This action cannot be undone.</p>
              </div>
            ) : (
              // Form view for create and edit modes
              <form className="agent-form">

                {/* First row: Name (hidden in edit mode) */}
                <div className={`form-group ${isEditMode ? 'hidden' : ''}`}>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="agent-name">Agent Name *</label>
                      <input
                        id="agent-name"
                        type="text"
                        className="form-input"
                        placeholder="Enter agent name"
                        value={state.agent.name}
                        $bind="agent.name"
                        disabled={state.loading}
                      />
                    </div>
                  </div>
                </div>

                {/* Model/Provider row (now above temperature/maxTokens) */}
                <div className="form-section">
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="agent-provider">Provider</label>
                      <select
                        id="agent-provider"
                        className="form-select"
                        value={state.agent.provider}
                        $bind="agent.provider"
                        disabled={state.loading}
                      >
                        <option value="" selected={!state.agent.provider}>Select provider</option>
                        <option value="openai" selected={state.agent.provider === 'openai'}>OpenAI</option>
                        <option value="anthropic" selected={state.agent.provider === 'anthropic'}>Anthropic</option>
                        <option value="google" selected={state.agent.provider === 'google'}>Google</option>
                        <option value="azure" selected={state.agent.provider === 'azure'}>Azure</option>
                        <option value="ollama" selected={state.agent.provider === 'ollama'}>Ollama</option>
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
                  </div>
                </div>

                {/* Temperature and Max Tokens row (now below model/provider) */}
                <div className="form-section">
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="agent-temperature">Temperature</label>
                      <input
                        id="agent-temperature"
                        type="text"
                        className="form-input"
                        placeholder="0.0 - 2.0"
                        value={state.agent.temperature}
                        $oninput={(e: any) => state.agent.temperature = e.target.value}
                        disabled={state.loading}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="agent-max-tokens">Max Tokens</label>
                      <input
                        id="agent-max-tokens"
                        type="number"
                        className="form-input"
                        placeholder="e.g. 2048"
                        min="1"
                        max="32768"
                        step="1"
                        value={state.agent.maxTokens}
                        $bind="agent.maxTokens"
                        disabled={state.loading}
                      />
                    </div>
                  </div>
                </div>

                {/* Third row: Description - Full width */}
                {/* <div className="form-section">
                  <div className="form-group">
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
                  </div>
                </div> */}

                {/* System Prompt Section */}
                <div className="form-section">
                  <div className="form-group">
                    <label htmlFor="agent-prompt">System Prompt</label>
                    <textarea
                      id="agent-prompt"
                      className="form-textarea agent-system-prompt-textarea"
                      placeholder="Enter the system prompt for this agent..."
                      rows={12}
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
