/**
 * World Edit Component - Modal CRUD operations for world management
 *
 * Features:
 * - Self-contained AppRun class component with create/edit/delete modes
 * - Modal overlay with backdrop click to close and form validation
 * - Success messaging with auto-close and parent component integration
 * - Module-level functions for better testability and organization
 * - Added chat LLM provider/model fields (parity with Agent Edit)
 * - Standardized modal sizing via shared 'edit-modal' class
 *
 * Changes:
 * - New fields: world.chatLLMProvider, world.chatLLMModel (with sensible defaults)
 * - Merge defaults with incoming props to ensure fields are present in edit mode
 * - Use common modal class to match Agent Edit popup size
 */

import { app, Component } from 'apprun';
import type { WorldEditProps, WorldEditState, World } from '../types';
import api from '../api';
import { formatErrorAsHtml, formatValidationError } from '../utils/error-formatting';
import type { ValidationError } from '../utils/error-formatting';

// Initialize component state from props
const getStateFromProps = (props: WorldEditProps): WorldEditState => ({
  mode: props.mode || 'create',
  // Merge defaults to ensure provider/model exist even in edit mode where props.world may omit them
  world: { ...getDefaultWorldData(), ...(props.world || {}) },
  parentComponent: props.parentComponent,
  loading: false,
  error: null,
  errorDetails: null,
});

// Helper function to get default world data
const getDefaultWorldData = (): Partial<World> => ({
  name: '',
  description: '',
  turnLimit: 5,
  // Defaults aligned with Agent Edit
  chatLLMProvider: 'ollama',
  chatLLMModel: 'llama3.2:3b'
});

// Save world function (handles both create and update)
export const saveWorld = async function* (state: WorldEditState): AsyncGenerator<WorldEditState> {
  // Form validation
  if (!state.world.name.trim()) {
    yield { ...state, error: 'World name is required' };
    return;
  }

  // Set loading state
  yield { ...state, loading: true, error: null };

  try {
    if (state.mode === 'create') {
      await api.createWorld(state.world);
    } else {
      // For update, we need the original world name, which should be preserved from initialization
      await api.updateWorld(state.world.name, state.world);
    }

    const successMessage = state.mode === 'create'
      ? 'World created successfully!'
      : 'World updated successfully!';

    // Show success message
    yield { ...state, loading: false, successMessage };

    // Auto-close after showing success message
    setTimeout(() => {
      if (state.mode === 'create') {
        // Redirect to new world
        window.location.href = '/World/' + encodeURIComponent(state.world.name);
      } else {
        // For edit mode, reload to refresh all data
        location.reload();
      }
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

// Delete world function
export const deleteWorld = async function* (state: WorldEditState): AsyncGenerator<WorldEditState> {
  // Set loading state
  yield { ...state, loading: true, error: null };

  try {
    await api.deleteWorld(state.world.name);

    // Show success message
    yield {
      ...state,
      loading: false,
      successMessage: 'World deleted successfully!'
    };

    // Auto-close and redirect to home after showing success message
    setTimeout(() => {
      location.reload();
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
export const closeModal = (state?: WorldEditState): void => {
  if (state?.parentComponent && typeof state.parentComponent.run === 'function') {
    state.parentComponent.run('close-world-edit');
  } else {
    app.run('close-world-edit');
  }
};

export default class WorldEdit extends Component<WorldEditState> {
  declare props: Readonly<WorldEditProps>;
  mounted = (props: WorldEditProps): WorldEditState => getStateFromProps(props);

  state: WorldEditState = {
    mode: 'create' as const,
    world: getDefaultWorldData(),
    parentComponent: undefined,
    loading: false,
    error: null,
    errorDetails: null,
    successMessage: null
  };

  view = (state: WorldEditState) => {
    // Success message view
    if (state.successMessage) {
      return (
        <div className="modal-backdrop" $onclick={closeModal}>
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
      title = `Delete ${state.world.name || 'World'}`;
    } else if (isEditMode) {
      title = `Edit ${state.world.name || 'World'}`;
    } else {
      title = 'Create New World';
    }

    return (
      <div className="modal-backdrop" $onclick={closeModal}>
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
                <p className="delete-confirmation-text">Are you sure you want to delete <span className="delete-confirmation-name">"{state.world.name}"</span>?</p>
                <p className="delete-confirmation-text">This action cannot be undone and will delete all agents and messages in this world.</p>
              </div>
            ) : (
              // Form view for create and edit modes
              <form className="world-form">
                {/* Basic Information Section */}
                <div className="form-section">

                  <div className={`form-group ${isEditMode ? 'hidden' : ''}`}>
                    <label htmlFor="world-name">World Name *</label>
                    <input
                      id="world-name"
                      type="text"
                      className="form-input"
                      placeholder="Enter world name"
                      value={state.world.name}
                      $bind="world.name"
                      disabled={state.loading}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="world-description">Description</label>
                    <input
                      id="world-description"
                      type="text"
                      className="form-input"
                      placeholder="Brief description of the world"
                      value={state.world.description}
                      $bind="world.description"
                      disabled={state.loading}
                    />
                  </div>

                  {/* Chat LLM Settings - provider and model (parity with Agent Edit) */}
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="world-chat-provider">Chat LLM Provider</label>
                      <select
                        id="world-chat-provider"
                        className="form-select"
                        value={state.world.chatLLMProvider}
                        $bind="world.chatLLMProvider"
                        disabled={state.loading}
                      >
                        <option value="" selected={!state.world.chatLLMProvider}>Select provider</option>
                        <option value="openai" selected={state.world.chatLLMProvider === 'openai'}>OpenAI</option>
                        <option value="anthropic" selected={state.world.chatLLMProvider === 'anthropic'}>Anthropic</option>
                        <option value="google" selected={state.world.chatLLMProvider === 'google'}>Google</option>
                        <option value="azure" selected={state.world.chatLLMProvider === 'azure'}>Azure</option>
                        <option value="ollama" selected={state.world.chatLLMProvider === 'ollama'}>Ollama</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label htmlFor="world-chat-model">Chat LLM Model</label>
                      <input
                        id="world-chat-model"
                        type="text"
                        className="form-input"
                        placeholder="e.g. gpt-4, claude-3-sonnet, llama3.2:3b"
                        value={state.world.chatLLMModel}
                        $bind="world.chatLLMModel"
                        disabled={state.loading}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="world-turn-limit">Turn Limit</label>
                    <input
                      id="world-turn-limit"
                      type="number"
                      className="form-input"
                      placeholder="5"
                      min="1"
                      max="50"
                      value={state.world.turnLimit}
                      $bind="world.turnLimit"
                      disabled={state.loading}
                    />
                  </div>

                  <div className="form-section">
                    <div className="form-group">
                      <label htmlFor="world-mcp">MCP Servers</label>
                      <textarea
                        id="world-mcp"
                        className="form-textarea world-mcp-textarea"
                        placeholder="Enter MCP servers..."
                        rows={12}
                        value="{}"
                        // $bind="world.mcp"
                        disabled={state.loading}
                      />
                    </div>
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
                    $onclick={[deleteWorld]}
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
                    $onclick={[deleteWorld]}
                    disabled={state.loading}
                    title="Delete world"
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
                      $onclick={[saveWorld]}
                      disabled={state.loading || !state.world.name.trim()}
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
                    $onclick={[saveWorld]}
                    disabled={state.loading || !state.world.name.trim()}
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