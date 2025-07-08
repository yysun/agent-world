/**
 * Agent Modal Component - Enhanced with System Prompt Loading
 * 
 * Modal dialog for creating and editing agents with system prompt configuration.
 * Features clean separation of UI components and business logic, form validation,
 * error handling, and loading states.
 * 
 * Enhanced Architecture:
 * - Modular UI components: ModalHeader, ErrorDisplay, SystemPromptForm, FormActions
 * - Business logic in handler functions with generator pattern for loading states
 * - AppRun functional patterns with immutable state updates
 * - Standardized state schema with backward compatibility
 * - Mode-specific optimizations for create vs edit
 * - System prompt loading: Loads from separate file when editing agents
 * 
 * System Prompt Storage:
 * - Create mode: System prompt entered directly and saved with agent
 * - Edit mode: System prompt loaded separately from system-prompt.md file
 * - Loading state shows placeholder while fetching system prompt
 * - Error handling for failed system prompt loading
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
  setModalError
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
// Business Logic
// ============================================================================

/**
 * Open Agent Modal - Enhanced to load system prompt for editing
 */
export const openAgentModal = async (state, agent = null, e) => {
  // Handle event propagation if event is provided
  if (e && e.stopPropagation) {
    e.stopPropagation();
  }

  if (!agent) {
    // Create mode
    return openCreateAgentModal(state, {
      defaults: {
        name: '',
        systemPrompt: '',
        type: 'assistant',
        provider: 'ollama',
        model: 'llama3.2:3b'
      }
    });
  } else {
    // Edit mode - first open with loading state, then load system prompt
    const initialState = openEditAgentModal(state, agent, true);

    try {
      const worldName = state.worldName || state.world?.current;
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
  }
};

/**
 * Close Agent Modal - Simplified without loading states
 */
export const closeAgentModalHandler = async (state, save, e) => {
  // Handle form submission event if provided
  if (e && e.preventDefault) {
    e.preventDefault();
  }

  if (!save || !state.agentModal?.agent) {
    return closeAgentModal(state);
  }

  const agent = state.agentModal.agent;
  const isNewAgent = AgentValidation.isNewAgent(agent);

  // Validate agent before saving
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
    const worldName = state.worldName || state.world?.current;

    if (isNewAgent) {
      await createNewAgent(worldName, agent);
    } else {
      await updateExistingAgent(worldName, agent);
    }

    // Refresh agents list and close modal
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


