/**
 * Agent Modal Component - Standalone AppRun Component
 * 
 * Complete modal solution for creating and editing agents with system prompt configuration.
 * Implements proper AppRun Component pattern with isolated state management.
 * 
 * Features:
 * - Standalone AppRun Component with state/view/update pattern
 * - Internal state management with world context preservation
 * - Form validation and error handling
 * - System prompt loading for edit mode
 * - Complete encapsulation with callback events
 * - Robust error handling for missing world context
 * 
 * Communication:
 * - Open: app.run('show-agent-modal', { agent, worldName })
 * - Close: app.run('hide-agent-modal')
 * - Updates: app.run('agent-updated', updatedAgent)
 * 
 * Changes:
 * - Consolidated getCurrentWorldName() dependency by storing worldName in modal state
 * - Removed redundant currentWorld property
 * - Enhanced payload handling to support both old and new calling formats
 * - Added comprehensive error handling for missing world name
 * - Simplified API operation functions with validation
 */

import * as api from '../api.js';
import { AgentValidation } from '../update/home-update.js';

const { Component, html, run, app } = window["apprun"];

// ============================================================================
// Component State - Internal Modal State Management
// ============================================================================

const state = () => ({
  isOpen: false,
  mode: 'create', // 'create' | 'edit'
  agent: null,
  worldName: null, // Store world name in modal state
  isLoading: false,
  error: null,
  validationErrors: []
});

// ============================================================================
// Utilities
// ============================================================================

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
const ModalHeader = (agent, isNewAgent) => html`
  <div class="modal-header">
    ${isNewAgent ? html`
      <div class="new-agent-header">
        <input
          type="text"
          class="agent-name-input"
          placeholder="Agent Name"
          value="${agent?.name || ''}"
          @input=${run('update-agent-name')}
        >
      </div>
    ` : html`
      <h2>${agent?.name}</h2>
    `}
    <button class="modal-close" type="button" @click=${run('hide-agent-modal')}>
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
        @input=${run('update-agent-system-prompt')}
      >${systemPrompt || ''}</textarea>
    `}
  </div>
`;

/**
 * Form Actions - cancel, clear memory, and save buttons
 */
const FormActions = (agent, isNewAgent, isLoading, hasValidationErrors) => html`
  <div class="form-actions">
    <button type="button" class="btn btn-secondary" @click=${run('hide-agent-modal')}>
      Cancel
    </button>
    ${!isNewAgent ? html`
      <button type="button" class="btn btn-danger" @click=${run('clear-agent-memory', agent)}>
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
// Component View - Modal Rendering
// ============================================================================

const view = (state) => {
  if (!state.isOpen) {
    return '<div></div>'; // Render nothing if modal is closed
  }

  const { agent, isLoading, error, validationErrors } = state;

  // Derived state
  const isNewAgent = AgentValidation.isNewAgent(agent);
  const systemPrompt = agent?.systemPrompt || '';
  const hasValidationErrors = validationErrors.length > 0;
  const isLoadingSystemPrompt = isLoading && !isNewAgent && !systemPrompt;

  return html`
    <div class="modal-overlay" @click=${run('hide-agent-modal')}>
      <div class="modal-content" @click=${(e) => e.stopPropagation()}>
        ${ModalHeader(agent, isNewAgent)}
        ${ErrorDisplay(error, validationErrors)}
        
        <form class="agent-form" @submit=${run('save-agent')}>
          ${SystemPromptForm(systemPrompt, isLoadingSystemPrompt)}
          ${FormActions(agent, isNewAgent, isLoading, hasValidationErrors)}
        </form>
      </div>
    </div>
  `;
};

// ============================================================================
// Business Logic & API Operations
// ============================================================================

const createNewAgent = async (worldName, agent) => {
  if (!worldName) throw new Error('World name is required');

  const createData = {
    name: agent.name,
    systemPrompt: agent.systemPrompt || '',
    type: agent.type || 'assistant',
    provider: agent.provider || 'ollama',
    model: agent.model || 'llama3.2:3b'
  };
  await api.createAgent(worldName, createData);
};

const updateExistingAgent = async (worldName, agent) => {
  if (!worldName) throw new Error('World name is required');

  const updateData = {};
  if (agent.systemPrompt !== undefined) {
    updateData.systemPrompt = agent.systemPrompt;
  }
  if (Object.keys(updateData).length > 0) {
    await api.updateAgent(worldName, agent.name, updateData);
  }
};

// ============================================================================
// Component Update - Event Handlers
// ============================================================================

const update = {
  // Global events for modal control
  'show-agent-modal': async (state, payload) => {
    // Handle both old format (agent only) and new format ({ agent, worldName })
    let agent, worldName;

    if (payload && typeof payload === 'object') {
      if (payload.agent !== undefined) {
        // New format: { agent, worldName }
        agent = payload.agent;
        worldName = payload.worldName;
      } else {
        // Old format: agent object directly
        agent = payload;
        worldName = null;
      }
    } else {
      agent = payload;
      worldName = null;
    }

    if (!worldName) {
      return {
        ...state,
        isOpen: true,
        error: 'World name is required to open agent modal'
      };
    }

    if (!agent) {
      // Create mode
      return {
        ...state,
        isOpen: true,
        mode: 'create',
        worldName,
        agent: {
          name: '',
          systemPrompt: '',
          type: 'assistant',
          provider: 'ollama',
          model: 'llama3.2:3b'
        },
        isLoading: false,
        error: null,
        validationErrors: []
      };
    }

    // Edit mode - load system prompt
    const loadingState = {
      ...state,
      isOpen: true,
      mode: 'edit',
      worldName,
      agent: { ...agent },
      isLoading: true,
      error: null,
      validationErrors: []
    };

    try {
      const fullAgent = await api.getAgent(worldName, agent.name);

      return {
        ...loadingState,
        agent: {
          ...agent,
          systemPrompt: fullAgent.systemPrompt || ''
        },
        isLoading: false
      };
    } catch (error) {
      console.error('Error loading agent details:', error);
      return {
        ...loadingState,
        isLoading: false,
        error: `Failed to load agent details: ${error.message}`
      };
    }
  },

  'hide-agent-modal': (state) => ({
    ...state,
    isOpen: false,
    agent: null,
    worldName: null,
    error: null,
    validationErrors: []
  }),

  // Form input handlers
  'update-agent-name': (state, e) => {
    const name = e.target.value;
    const updatedAgent = { ...state.agent, name };
    const validation = AgentValidation.validateAgent(updatedAgent);

    return {
      ...state,
      agent: updatedAgent,
      validationErrors: validation.isValid ? [] : Object.values(validation.errors)
    };
  },

  'update-agent-system-prompt': (state, e) => {
    const systemPrompt = e.target.value;
    const updatedAgent = { ...state.agent, systemPrompt };
    const validation = AgentValidation.validateAgent(updatedAgent);

    return {
      ...state,
      agent: updatedAgent,
      validationErrors: validation.isValid ? [] : Object.values(validation.errors)
    };
  },

  // Form submission
  'save-agent': async (state, e) => {
    if (e?.preventDefault) e.preventDefault();

    const { agent, worldName } = state;
    if (!worldName) {
      return {
        ...state,
        error: 'World name is required to save agent'
      };
    }

    const isNewAgent = AgentValidation.isNewAgent(agent);
    const validation = AgentValidation.validateAgent(agent);

    if (!validation.isValid) {
      return {
        ...state,
        error: 'Please fix validation errors before saving',
        validationErrors: Object.values(validation.errors)
      };
    }

    try {
      if (isNewAgent) {
        await createNewAgent(worldName, agent);
      } else {
        await updateExistingAgent(worldName, agent);
      }

      // Notify parent component of agent update
      app.run('agent-updated', { worldName, agent });

      // Close modal
      return {
        ...state,
        isOpen: false,
        agent: null,
        worldName: null,
        error: null,
        validationErrors: []
      };
    } catch (error) {
      console.error('Error saving agent:', error);
      return {
        ...state,
        error: `Failed to save agent: ${error.message}`
      };
    }
  },

  // Clear agent memory
  'clear-agent-memory': async (state, agent) => {
    const { worldName } = state;
    if (!worldName) {
      return {
        ...state,
        error: 'World name is required to clear agent memory'
      };
    }

    try {
      await api.clearAgentMemory(worldName, agent.name);

      // Notify parent component
      app.run('agent-memory-cleared', { worldName, agentName: agent.name });

      return state;
    } catch (error) {
      console.error('Error clearing agent memory:', error);
      return {
        ...state,
        error: `Failed to clear agent memory: ${error.message}`
      };
    }
  }
};

// ============================================================================
// Component Export
// ============================================================================

export default new Component(state, view, update, { global_event: true });


