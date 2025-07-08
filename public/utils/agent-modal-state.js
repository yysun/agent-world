/**
 * Agent Modal State Management - Simplified AppRun Pattern
 * 
 * Unified state management for agent modal operations.
 * Replaces the showAgentModel + editingAgent pattern with a single modal state object.
 * Uses simple state updates without complex loading patterns.
 */

import { AgentValidation } from '../types/agent-types.js';

/**
 * Create initial modal state (simple format)
 * @returns {Object} Modal state format
 */
export function createInitialModalState() {
  return {
    isOpen: false,
    mode: 'create',
    agent: null,
    isLoading: false,
    error: null,
    validationErrors: []
  };
}

/**
 * Open modal for creating new agent
 * @param {Object} state - current app state
 * @param {Object} [options] - create options and defaults
 * @returns {Object} updated state
 */
export function openCreateAgentModal(state, options = {}) {
  // Use simple defaults
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
}

/**
 * Open modal for editing existing agent
 * @param {Object} state - current app state
 * @param {Object} agent - agent to edit
 * @param {boolean} [isLoading] - whether the modal is in loading state
 * @returns {Object} updated state
 */
export function openEditAgentModal(state, agent, isLoading = false) {
  return {
    ...state,
    agentModal: {
      isOpen: true,
      mode: 'edit',
      agent: { ...agent },
      isLoading,
      error: null,
      validationErrors: []
    }
  };
}

/**
 * Close modal
 * @param {Object} state - current app state
 * @returns {Object} updated state
 */
export function closeAgentModal(state) {
  return {
    ...state,
    agentModal: createInitialModalState()
  };
}

/**
 * Update modal agent data
 * @param {Object} state - current app state
 * @param {Object} updates - agent property updates
 * @returns {Object} updated state
 */
export function updateModalAgent(state, updates) {
  if (!state.agentModal?.agent) {
    return state;
  }

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
}

/**
 * Set modal error
 * @param {Object} state - current app state
 * @param {string} error - error message
 * @returns {Object} updated state
 */
export function setModalError(state, error) {
  return {
    ...state,
    agentModal: {
      ...state.agentModal,
      error,
      isLoading: false
    }
  };
}
