/**
 * Agent Edit Component - Modal CRUD operations for agent management
 *
 * Features:
 * - Self-contained AppRun class component with create/edit/delete modes
 * - Modal overlay with form validation (no backdrop click to close)
 * - Success messaging with auto-close and parent component integration
 * - Global event publishing for coordinated modal management
 * - Standardized modal sizing via shared 'edit-modal' class (parity with World Edit)
 *
 * Implementation Notes:
 * - Agent create/update payloads are normalized in this component before API submission.
 * - The UI no longer submits `type`; backend defaults/retained values handle compatibility.
 *
 * Recent Changes:
 * - 2026-02-19: Moved auto-reply checkbox to sit directly beside the "Auto Reply" label text; help text now renders on a separate line.
 * - 2026-02-13: Removed implicit `type` submission from web agent create/update UI payloads.
 */

import { app, Component } from 'apprun';
import type { AgentEditProps, AgentEditState, Agent, LLMProvider } from '../../../types';
import api from '../../../api';
import {
  ActionButton,
  CheckboxField,
  ModalShell,
  SelectField,
  TextAreaField,
  TextInputField,
} from '../../../patterns';
import { formatErrorAsHtml, formatValidationError } from '../../../utils/error-formatting';
import type { ValidationError } from '../../../utils/error-formatting';

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
  autoReply: true,
  provider: 'ollama' as LLMProvider,
  model: 'llama3.2:3b',
  temperature: 0.7,
  maxTokens: 2048,
  systemPrompt: 'You are a helpful assistant.',
};

function normalizeAgentPayload(agent: Partial<Agent>): Partial<Agent> {
  const { type: _ignoredType, ...payload } = agent as Partial<Agent> & { type?: string };
  return payload;
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
    const payload = normalizeAgentPayload(state.agent);
    if (state.mode === 'create') {
      await api.createAgent(state.worldName, payload);
    } else {
      await api.updateAgent(state.worldName, state.agent.name, payload);
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
      title = `Delete ${state.agent.name || 'Agent'}`;
    } else if (isEditMode) {
      title = `Edit ${state.agent.name || 'Agent'}`;
    } else {
      title = 'Create New Agent';
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
                  $onclick={[deleteAgent]}
                  disabled={state.loading}
                >
                  {state.loading ? 'Deleting...' : 'Delete'}
                </ActionButton>
              </div>
            ) : isEditMode ? (
              <>
                <ActionButton
                  className="btn btn-danger"
                  $onclick={[deleteAgent]}
                  disabled={state.loading}
                  title="Delete agent"
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
                    $onclick={[saveAgent]}
                    disabled={state.loading || !state.agent.name.trim()}
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
                  $onclick={[saveAgent]}
                  disabled={state.loading || !state.agent.name.trim()}
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
            <p className="delete-confirmation-text">Are you sure you want to delete <span className="delete-confirmation-name">"{state.agent.name}"</span>?</p>
            <p className="delete-confirmation-text">This action cannot be undone.</p>
          </div>
        ) : (
          <form className="agent-form">
            <div className={`form-group ${isEditMode ? 'hidden' : ''}`}>
              <div className="form-row">
                <TextInputField
                  htmlFor="agent-name"
                  label="Agent Name *"
                  type="text"
                  fieldClassName="form-input"
                  placeholder="Enter agent name"
                  value={state.agent.name}
                  $bind="agent.name"
                  disabled={state.loading}
                />
              </div>
            </div>

            <div className="form-section">
              <CheckboxField
                id="agent-auto-reply"
                label="Auto Reply"
                labelClassName="form-checkbox-title"
                help="Automatically reply to sender when no explicit @mention is provided"
                helpClassName="form-help-text form-checkbox-help"
                checked={state.agent.autoReply !== false}
                $bind="agent.autoReply"
                disabled={state.loading}
              />

              <div className="form-row">
                <SelectField
                  htmlFor="agent-provider"
                  label="Provider"
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
                </SelectField>

                <TextInputField
                  htmlFor="agent-model"
                  label="Model"
                  type="text"
                  fieldClassName="form-input"
                  placeholder="e.g. gpt-4, claude-3-sonnet, llama3.2:3b"
                  value={state.agent.model}
                  $bind="agent.model"
                  disabled={state.loading}
                />
              </div>
            </div>

            <div className="form-section">
              <div className="form-row">
                <TextInputField
                  htmlFor="agent-temperature"
                  label="Temperature"
                  type="number"
                  fieldClassName="form-input"
                  placeholder="0.0 - 2.0"
                  min="0"
                  max="2"
                  step="0.1"
                  value={state.agent.temperature}
                  $bind="agent.temperature"
                  disabled={state.loading}
                />
                <TextInputField
                  htmlFor="agent-max-tokens"
                  label="Max Tokens"
                  type="number"
                  fieldClassName="form-input"
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

            <div className="form-section">
              <TextAreaField
                htmlFor="agent-prompt"
                label="System Prompt"
                fieldClassName="form-textarea agent-system-prompt-textarea"
                placeholder="Enter the system prompt for this agent..."
                rows={12}
                value={state.agent.systemPrompt}
                $bind="agent.systemPrompt"
                disabled={state.loading}
              />
            </div>
          </form>
        )}
      </ModalShell>
    );
  };
}
