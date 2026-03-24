/**
 * World Edit Component - Modal CRUD operations for world management
 *
 * Features:
 * - Self-contained AppRun class component with create/edit/delete modes
 * - Modal overlay with form validation (no backdrop click to close)
 * - Success messaging with auto-close and parent component integration
 * - Module-level functions for better testability and organization
 * - Added chat LLM provider/model fields (parity with Agent Edit)
 * - Standardized modal sizing via shared 'edit-modal' class
 *
 * Changes:
 * - 2026-02-13: Added `mainAgent` field to world create/edit form for main-agent routing control.
 * - New fields: world.chatLLMProvider, world.chatLLMModel (with sensible defaults)
 * - Merge defaults with incoming props to ensure fields are present in edit mode
 * - Use common modal class to match Agent Edit popup size
 */

import { app, Component } from 'apprun';
import type { WorldEditProps, WorldEditState, World } from '../../../types';
import api from '../../../api';
import {
  ActionButton,
  ModalShell,
  SelectField,
  TextAreaField,
  TextInputField,
} from '../../../patterns';
import { formatErrorAsHtml, formatValidationError } from '../../../utils/error-formatting';
import type { ValidationError } from '../../../utils/error-formatting';

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
  mainAgent: null,
  // Defaults aligned with Agent Edit
  chatLLMProvider: 'ollama',
  chatLLMModel: 'llama3.2:3b',
  mcpConfig: null,
  variables: ''
});

// Save world function (handles both create and update)
export const saveWorld = async function* (state: WorldEditState): AsyncGenerator<WorldEditState> {
  // Form validation
  if (!state.world.name.trim()) {
    yield { ...state, error: 'World name is required' };
    return;
  }

  // Validate mcpConfig if provided
  if (state.world.mcpConfig && state.world.mcpConfig.trim()) {
    try {
      JSON.parse(state.world.mcpConfig);
    } catch (error) {
      yield { ...state, error: 'MCP Config must be valid JSON' };
      return;
    }
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
        <ModalShell
          title="Success!"
          contentClassName="modal-content edit-modal"
          contentAttrs={{ onclick: (e: Event) => e.stopPropagation() }}
          closeAttrs={{ $onclick: closeModal }}
        >
          <div className="success-message">
            <p>{state.successMessage}</p>
          </div>
        </ModalShell>
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
      <ModalShell
        title={title}
        contentClassName="modal-content edit-modal"
        contentAttrs={{ onclick: (e: Event) => e.stopPropagation() }}
        closeAttrs={{ $onclick: closeModal }}
        footer={(
          <div className="modal-actions">
            {isDeleteMode ? (
              <div className="modal-primary-actions" style="margin-left: auto;">
                <ActionButton
                  className="btn btn-secondary"
                  $onclick={closeModal}
                  disabled={state.loading}
                >
                  Cancel
                </ActionButton>

                <ActionButton
                  className="btn btn-danger"
                  $onclick={[deleteWorld]}
                  disabled={state.loading}
                >
                  {state.loading ? 'Deleting...' : 'Delete'}
                </ActionButton>
              </div>
            ) : isEditMode ? (
              <>
                <ActionButton
                  className="btn btn-danger"
                  $onclick={[deleteWorld]}
                  disabled={state.loading}
                  title="Delete world"
                >
                  {state.loading ? 'Deleting...' : 'Delete'}
                </ActionButton>

                <div className="modal-primary-actions">
                  <ActionButton
                    className="btn btn-secondary"
                    $onclick={closeModal}
                    disabled={state.loading}
                  >
                    Cancel
                  </ActionButton>

                  <ActionButton
                    className="btn btn-primary"
                    $onclick={[saveWorld]}
                    disabled={state.loading || !state.world.name.trim()}
                  >
                    {state.loading ? 'Saving...' : 'Update'}
                  </ActionButton>
                </div>
              </>
            ) : (
              <div className="modal-primary-actions" style="margin-left: auto;">
                <ActionButton
                  className="btn btn-secondary"
                  $onclick={closeModal}
                  disabled={state.loading}
                >
                  Cancel
                </ActionButton>

                <ActionButton
                  className="btn btn-primary"
                  $onclick={[saveWorld]}
                  disabled={state.loading || !state.world.name.trim()}
                >
                  {state.loading ? 'Saving...' : 'Create'}
                </ActionButton>
              </div>
            )}
          </div>
        )}
      >
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
          <div className="delete-confirmation">
            <p className="delete-confirmation-text">Are you sure you want to delete <span className="delete-confirmation-name">"{state.world.name}"</span>?</p>
            <p className="delete-confirmation-text">This action cannot be undone and will delete all agents and messages in this world.</p>
          </div>
        ) : (
          <form className="world-form">
            <div className="form-section">
              <div className={`form-group ${isEditMode ? 'hidden' : ''}`}>
                <TextInputField
                  htmlFor="world-name"
                  label="World Name *"
                  type="text"
                  fieldClassName="form-input"
                  placeholder="Enter world name"
                  value={state.world.name}
                  $bind="world.name"
                  disabled={state.loading}
                />
              </div>

              <TextInputField
                htmlFor="world-description"
                label="Description"
                type="text"
                fieldClassName="form-input"
                placeholder="Brief description of the world"
                value={state.world.description}
                $bind="world.description"
                disabled={state.loading}
              />

              <TextInputField
                htmlFor="world-main-agent"
                label="Main Agent"
                type="text"
                fieldClassName="form-input"
                placeholder="Agent ID or name (optional)"
                value={state.world.mainAgent || ''}
                $bind="world.mainAgent"
                disabled={state.loading}
              />

              <div className="form-row">
                <SelectField
                  htmlFor="world-chat-provider"
                  label="Chat LLM Provider"
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
                </SelectField>

                <TextInputField
                  htmlFor="world-chat-model"
                  label="Chat LLM Model"
                  type="text"
                  fieldClassName="form-input"
                  placeholder="e.g. gpt-4, claude-3-sonnet, llama3.2:3b"
                  value={state.world.chatLLMModel}
                  $bind="world.chatLLMModel"
                  disabled={state.loading}
                />
              </div>

              <TextInputField
                htmlFor="world-turn-limit"
                label="Turn Limit"
                type="number"
                fieldClassName="form-input"
                placeholder="5"
                min="1"
                max="50"
                value={state.world.turnLimit}
                $bind="world.turnLimit"
                disabled={state.loading}
              />

              <div className="form-section">
                <TextAreaField
                  htmlFor="world-variables"
                  label="Variables (.env)"
                  fieldClassName="form-textarea world-mcp-textarea"
                  placeholder="working_directory=/path/to/project\nproject_name=agent-world"
                  rows={8}
                  value={state.world.variables || ''}
                  $bind="world.variables"
                  disabled={state.loading}
                  help={<span>Example: <code>working_directory=/path/to/project</code></span>}
                />

                <TextAreaField
                  htmlFor="world-mcp"
                  label="MCP Servers"
                  fieldClassName="form-textarea world-mcp-textarea"
                  placeholder="Enter MCP servers configuration as JSON..."
                  rows={12}
                  value={state.world.mcpConfig || ''}
                  $bind="world.mcpConfig"
                  disabled={state.loading}
                />
              </div>
            </div>
          </form>
        )}
      </ModalShell>
    );
  };
}