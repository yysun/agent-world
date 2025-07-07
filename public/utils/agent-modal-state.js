/**
 * Agent Modal State Management
 * 
 * Unified state management for agent modal operations.
 * Replaces the showAgentModel + editingAgent pattern with a single modal state object.
 */

import { AgentValidation } from '../types/agent-types.js';

/**
 * Create initial modal state
 * @returns {AgentModalState}
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
 * @returns {Object} updated state
 */
export function openCreateAgentModal(state) {
  return {
    ...state,
    agentModal: {
      isOpen: true,
      mode: 'create',
      agent: {
        name: 'New Agent',
        systemPrompt: '',
        type: 'assistant',
        provider: 'openai',
        model: 'gpt-4'
      },
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
 * @returns {Promise<Object>} updated state
 */
export async function openEditAgentModal(state, agent) {
  // Start with loading state
  const loadingState = {
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

  try {
    // Import API dynamically to avoid circular dependencies
    const { getAgent } = await import('../api.js');

    // Fetch full agent data
    const fullAgent = await getAgent(state.worldName, agent.name);

    return {
      ...state,
      agentModal: {
        isOpen: true,
        mode: 'edit',
        agent: fullAgent,
        isLoading: false,
        error: null,
        validationErrors: []
      }
    };
  } catch (error) {
    console.error('Error fetching full agent details:', error);

    // Fallback to provided agent data
    return {
      ...state,
      agentModal: {
        isOpen: true,
        mode: 'edit',
        agent: agent,
        isLoading: false,
        error: `Failed to load agent details: ${error.message}`,
        validationErrors: []
      }
    };
  }
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

/**
 * Set modal loading state
 * @param {Object} state - current app state
 * @param {boolean} isLoading - loading state
 * @returns {Object} updated state
 */
export function setModalLoading(state, isLoading) {
  return {
    ...state,
    agentModal: {
      ...state.agentModal,
      isLoading
    }
  };
}
