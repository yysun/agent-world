/**
 * Modal Event Handlers
 *
 * Features:
 * - Agent modal state management
 * - Agent creation and editing workflows
 * - Error handling for save operations
 */

import * as api from '../api.js';

export const openAgentModal = (state, agent = null) => {
  return {
    ...state,
    editingAgent: agent || { name: 'New Agent', config: {}, status: 'New' },
    showAgentModel: true
  };
};

export const closeAgentModal = (state, save) => {
  try {
    if (save) api.saveAgent(state.editingAgent);
    return {
      ...state,
      showAgentModel: false
    };
  } catch (error) {
    console.error('Error closing agent modal:', error);
    return {
      ...state,
      error
    };
  }
};
