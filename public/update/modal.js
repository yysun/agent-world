/**
 * Modal Event Handlers
 *
 * Features:
 * - Agent modal state management
 * - Agent creation and editing workflows
 * - Error handling for save operations
 */

import wsApi from '../ws-api.js';

export const openAgentModal = (state, agent = null) => {
  return {
    ...state,
    editingAgent: agent || { name: 'New Agent', config: {}, status: 'New' },
    showAgentModel: true
  };
};

export const closeAgentModal = async (state, save) => {
  try {
    if (save && state.editingAgent) {
      // Use updateAgent instead of the non-existent saveAgent
      if (state.editingAgent.status === 'New') {
        await wsApi.createAgent(state.worldName, {
          name: state.editingAgent.name,
          description: state.editingAgent.description || 'Agent created via modal'
        });
      } else {
        await wsApi.updateAgent(state.worldName, state.editingAgent.name, {
          config: state.editingAgent.config
        });
      }
    }
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
