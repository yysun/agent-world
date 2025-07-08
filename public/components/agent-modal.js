/**
 * Agent Modal Component - Consolidated State Management and UI
 * 
 * Complete modal solution for creating and editing agents with system prompt configuration.
 * Includes state management, UI components, and business logic in a single consolidated file.
 * 
 * Features:
 * - Modular UI components with clean separation
 * - Integrated state management functions
 * - Form validation and error handling
 * - System prompt loading for edit mode
 * - AppRun functional patterns with immutable updates
 * 
 * Usage:
 * ```javascript
 * const updatedState = await openAgentModal(state, agent); // null for create
 * ${state.agentModal?.isOpen ? AgentModal(state.agentModal, closeAgentModalHandler) : ''}
 * ```
 */

import * as api from '../api.js';
import { AgentValidation } from '../app-state.js';

const { html, run } = window["apprun"];

// ============================================================================
// State Management - Modal State Operations
// ============================================================================

const createInitialModalState = () => ({
  isOpen: false,
  mode: 'create',
  agent: null,
  isLoading: false,
  error: null,
  validationErrors: []
});

const openCreateAgentModal = (state, options = {}) => {
  const defaults = {
    name: '',
    systemPrompt: '',
    type: 'assistant',
    provider: 'ollama',
    model: 'llama3.2:3b',
    ...options.defaults
  };

  return {
    ...state,
    agentModal: {
      isOpen: true,
      mode: 'create',
      agent: defaults,
      isLoading: false,
      error: null,
      validationErrors: []
    }
  };
};

const openEditAgentModal = (state, agent, isLoading = false) => ({
  ...state,
  agentModal: {
    isOpen: true,
    mode: 'edit',
    agent: { ...agent },
    isLoading,
    error: null,
    validationErrors: []
  }
});

const closeAgentModal = (state) => ({
  ...state,
  agentModal: createInitialModalState()
});

const updateModalAgent = (state, updates) => {
  if (!state.agentModal?.agent) return state;

  const updatedAgent = { ...state.agentModal.agent, ...updates };
  const validation = AgentValidation.validateAgent(updatedAgent);

  return {
    ...state,
    agentModal: {
      ...state.agentModal,
      agent: updatedAgent,
      validationErrors: validation.isValid ? [] : Object.values(validation.errors)
    }
  };
};

const setModalError = (state, error) => ({
  ...state,
  agentModal: {
    ...state.agentModal,
    error,
    isLoading: false
  }
});

// ============================================================================
// Utilities
// ============================================================================

// Get selected world name from state
const getSelectedWorldName = (state) => {
  if (!state.selectedWorldId) return null;
  const world = state.worlds?.find(w => w.id === state.selectedWorldId);
  return world ? world.name : null;
};

const getSubmitButtonText = (isNewAgent, isLoading) => {
  if (isLoading) return 'Saving...';
  return isNewAgent ? 'Create Agent' : 'Update Agent';
};

// ============================================================================
// UI Components
// ============================================================================

/**
 * Modal Header - renders create/edit headers with agent name input or display
 */
const ModalHeader = (agent, isNewAgent, closeModalFn) => html`
  <div class="modal-header">
    ${isNewAgent ? html`
      <div class="new-agent-header">
        <input
          type="text"
          class="agent-name-input"
          placeholder="Agent Name"
          value="${agent?.name || ''}"
          @input=${run('updateModalAgentName')}
        >
      </div>
    ` : html`
      <h2>${agent?.name}</h2>
    `}
    <button class="modal-close" type="button" @click=${run(closeModalFn, false)}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 6L6 18M6 6l12 12"/>
      </svg>
    </button>
  </div>
`;

/**
 * Error Display - shows modal errors and validation errors
 */
const ErrorDisplay = (error, validationErrors) => html`
  ${error ? html`
    <div class="modal-error">
      ${error}
    </div>
  ` : ''}
  
  ${validationErrors.length > 0 ? html`
    <div class="modal-validation-errors">
      ${validationErrors.map(err => html`<div class="validation-error">${err}</div>`)}
    </div>
  ` : ''}
`;

/**
 * System Prompt Form - main textarea for system prompt editing
 */
const SystemPromptForm = (systemPrompt, isLoading) => html`
  <div class="form-group">
    ${isLoading ? html`
      <div class="loading-placeholder">
        <div class="loading-spinner"></div>
        <span>Loading system prompt...</span>
      </div>
    ` : html`
      <textarea
        id="agent-system-prompt"
        class="form-textarea"
        rows="20"
        placeholder="Define the agent's behavior and personality..."
        .value=${systemPrompt || ''}
        @input=${run('updateModalAgentSystemPrompt')}
      >${systemPrompt || ''}</textarea>
    `}
  </div>
`;

/**
 * Form Actions - cancel, clear memory, and save buttons
 */
const FormActions = (agent, isNewAgent, isLoading, hasValidationErrors, closeModalFn) => html`
  <div class="form-actions">
    <button type="button" class="btn btn-secondary" @click=${run(closeModalFn, false)}>
      Cancel
    </button>
    ${!isNewAgent ? html`
      <button type="button" class="btn btn-danger" @click=${run('clearAgentMemoryFromModal', agent)}>
        Clear Memory
      </button>
    ` : ''}
    <button 
      type="submit" 
      class="btn btn-primary" 
      ?disabled=${isLoading || hasValidationErrors}
    >
      ${getSubmitButtonText(isNewAgent, isLoading)}
    </button>
  </div>
`;

// ============================================================================
// Main Modal Component
// ============================================================================

/**
 * Agent Modal - orchestrates UI components for create/edit modal
 */
export const AgentModal = (modalState, closeModalFn) => {
  if (!modalState?.isOpen) {
    return '';
  }

  const { agent, isLoading, error, validationErrors } = modalState;

  // Derived state
  const isNewAgent = AgentValidation.isNewAgent(agent);
  const systemPrompt = agent?.systemPrompt || '';
  const hasValidationErrors = validationErrors.length > 0;
  const isLoadingSystemPrompt = isLoading && !isNewAgent && !systemPrompt;

  return html`
    <div class="modal-overlay" @click=${run(closeModalFn, false)}>
      <div class="modal-content" @click=${(e) => e.stopPropagation()}>
        ${ModalHeader(agent, isNewAgent, closeModalFn)}
        ${ErrorDisplay(error, validationErrors)}
        
        <form class="agent-form" @submit=${run(closeModalFn, true)}>
          ${SystemPromptForm(systemPrompt, isLoadingSystemPrompt)}
          ${FormActions(agent, isNewAgent, isLoading, hasValidationErrors, closeModalFn)}
        </form>
      </div>
    </div>
  `;
};

// ============================================================================
// Business Logic & API Operations
// ============================================================================

// Create agent with all data in single API call
const createNewAgent = async (worldName, agent) => {
  const createData = {
    name: agent.name,
    systemPrompt: agent.systemPrompt || '',
    type: agent.type || 'assistant',
    provider: agent.provider || 'ollama',
    model: agent.model || 'llama3.2:3b'
  };
  await api.createAgent(worldName, createData);
};

// Update agent's system prompt and properties
const updateExistingAgent = async (worldName, agent) => {
  const updateData = {};
  if (agent.systemPrompt !== undefined) {
    updateData.systemPrompt = agent.systemPrompt;
  }
  if (Object.keys(updateData).length > 0) {
    await api.updateAgent(worldName, agent.name, updateData);
  }
};

// Open modal with system prompt loading for edit mode
export const openAgentModal = async (state, agent = null, e) => {
  if (e?.stopPropagation) e.stopPropagation();

  if (!agent) {
    return openCreateAgentModal(state, {
      defaults: {
        name: '',
        systemPrompt: '',
        type: 'assistant',
        provider: 'ollama',
        model: 'llama3.2:3b'
      }
    });
  }

  // Edit mode - load system prompt
  const initialState = openEditAgentModal(state, agent, true);

  try {
    const worldName = getSelectedWorldName(state) || state.world?.current;
    const fullAgent = await api.getAgent(worldName, agent.name);

    return openEditAgentModal(initialState, {
      ...agent,
      systemPrompt: fullAgent.systemPrompt || ''
    }, false);
  } catch (error) {
    console.error('Error loading agent details:', error);
    return {
      ...initialState,
      agentModal: {
        ...initialState.agentModal,
        isLoading: false,
        error: `Failed to load agent details: ${error.message}`
      }
    };
  }
};

// Handle modal close and save operations
export const closeAgentModalHandler = async (state, save, e) => {
  if (e?.preventDefault) e.preventDefault();

  if (!save || !state.agentModal?.agent) {
    return closeAgentModal(state);
  }

  const agent = state.agentModal.agent;
  const isNewAgent = AgentValidation.isNewAgent(agent);
  const validation = AgentValidation.validateAgent(agent);

  if (!validation.isValid) {
    return {
      ...state,
      agentModal: {
        ...state.agentModal,
        error: 'Please fix validation errors before saving',
        validationErrors: Object.values(validation.errors)
      }
    };
  }

  try {
    const worldName = getSelectedWorldName(state) || state.world?.current;

    if (isNewAgent) {
      await createNewAgent(worldName, agent);
    } else {
      await updateExistingAgent(worldName, agent);
    }

    const updatedAgents = await api.getAgents(worldName);

    return {
      ...closeAgentModal(state),
      agents: updatedAgents
    };
  } catch (error) {
    console.error('Error saving agent:', error);
    return {
      ...state,
      agentModal: {
        ...state.agentModal,
        error: `Failed to save agent: ${error.message}`
      }
    };
  }
};

// ============================================================================
// Exports
// ============================================================================

export {
  updateModalAgent,
  setModalError,
  closeAgentModal,
  openCreateAgentModal,
  openEditAgentModal,
  createInitialModalState
};


