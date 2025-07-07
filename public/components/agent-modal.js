/**
 * Agent Modal Component
 * 
 * Modal dialog for creating and editing agents with system prompt configuration.
 * Features clean separation of UI components and business logic, form validation,
 * error handling, and loading states.
 * 
 * Architecture:
 * - Modular UI components: ModalHeader, ErrorDisplay, SystemPromptForm, FormActions
 * - Business logic in handler functions with generator pattern for loading states
 * - AppRun functional patterns with immutable state updates
 * 
 * Usage:
 * ```javascript
 * const updatedState = await openAgentModal(state, agent); // null for create
 * ${state.agentModal?.isOpen ? AgentModal(state.agentModal, closeAgentModalHandler) : ''}
 * ```
 */

import * as api from '../api.js';
import { AgentValidation } from '../types/agent-types.js';
import {
  openCreateAgentModal,
  openEditAgentModal,
  closeAgentModal,
  updateModalAgent,
  setModalError,
  setModalLoading
} from '../utils/agent-modal-state.js';

const { html, run } = window["apprun"];

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
          @keydown=${(e) => { if (e.key === 'Enter') e.preventDefault(); }}
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
const SystemPromptForm = (systemPrompt) => html`
  <div class="form-group">
    <textarea
      id="agent-system-prompt"
      class="form-textarea"
      rows="20"
      placeholder="Define the agent's behavior and personality..."
      .value=${systemPrompt}
      @input=${run('updateModalAgentSystemPrompt')}
    >${systemPrompt}</textarea>
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
// UI Helpers
// ============================================================================

const getSubmitButtonText = (isNewAgent, isLoading) => {
  if (isLoading) return 'Saving...';
  return isNewAgent ? 'Create Agent' : 'Update Agent';
};

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

  return html`
    <div class="modal-overlay" @click=${run(closeModalFn, false)}>
      <div class="modal-content" @click=${(e) => e.stopPropagation()}>
        ${ModalHeader(agent, isNewAgent, closeModalFn)}
        ${ErrorDisplay(error, validationErrors)}
        
        <form class="agent-form" @submit=${(e) => { e.preventDefault(); run(closeModalFn, true)(e); }}>
          ${SystemPromptForm(systemPrompt)}
          ${FormActions(agent, isNewAgent, isLoading, hasValidationErrors, closeModalFn)}
        </form>
      </div>
    </div>
  `;
};

// ============================================================================
// Business Logic
// ============================================================================

/**
 * Open Agent Modal - determines create vs edit mode, handles loading states
 */
export const openAgentModal = async function* (state, agent = null) {
  if (!agent) {
    return openCreateAgentModal(state);
  } else {
    // Show loading state while fetching full agent data
    yield {
      ...state,
      agentModal: {
        isOpen: true,
        mode: 'edit',
        agent: null,
        isLoading: true,
        error: null,
        validationErrors: []
      }
    };

    return await openEditAgentModal(state, agent);
  }
};

/**
 * Close Agent Modal - handles cancel and save operations with loading states
 */
export const closeAgentModalHandler = async function* (state, save) {
  if (!save || !state.agentModal?.agent) {
    return closeAgentModal(state);
  }

  const agent = state.agentModal.agent;
  const isNewAgent = AgentValidation.isNewAgent(agent);

  // Validate agent before saving
  const validation = AgentValidation.validateAgent(agent);
  if (!validation.isValid) {
    return setModalError(state, 'Please fix validation errors before saving');
  }

  // Show loading state
  yield setModalLoading(state, true);

  try {
    if (isNewAgent) {
      await createNewAgent(state.worldName, agent);
    } else {
      await updateExistingAgent(state.worldName, agent);
    }

    // Refresh agents list and close modal
    const updatedAgents = await api.getAgents(state.worldName);

    return {
      ...closeAgentModal(state),
      agents: updatedAgents
    };

  } catch (error) {
    console.error('Error saving agent:', error);
    return setModalError(state, `Failed to save agent: ${error.message}`);
  }
};

/**
 * Create New Agent - creates agent with all data in single API call
 */
async function createNewAgent(worldName, agent) {
  const createData = {
    name: agent.name,
    systemPrompt: agent.systemPrompt || '',
    type: agent.type || 'assistant',
    provider: agent.provider || 'ollama',
    model: agent.model || 'llama3.2:3b'
  };

  await api.createAgent(worldName, createData);
}

/**
 * Update Existing Agent - updates agent's system prompt and properties
 */
async function updateExistingAgent(worldName, agent) {
  const updateData = {};

  if (agent.systemPrompt !== undefined) {
    updateData.systemPrompt = agent.systemPrompt;
  }

  if (Object.keys(updateData).length > 0) {
    await api.updateAgent(worldName, agent.name, updateData);
  }
}


