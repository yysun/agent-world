//@ts-check
/**
 * World Actions Module - Complete world and state management
 *
 * Consolidated AppRun-based module providing:
 * - World/agent selection and data fetching via REST API
 * - Message handling and state updates with validation
 * - AppState initialization and persistence (localStorage)
 * - Type-safe operations with comprehensive error handling
 * 
 * Key Features:
 * - Single source of truth for world-related operations
 * - Automatic data validation and error recovery
 * - Complete AppState management utilities
 * 
 * TypeScript definitions available in world-actions.d.ts
 */

import * as api from '../api.js';

// State Initialization

/**
 * Create initial application state
 */
export function createInitialState() {
  return {
    worlds: [],
    selectedWorldId: null,
    agents: [],
    selectedAgentId: null,
    messages: [],
    editingAgent: null,
    loading: false,
    updating: false,
    quickMessage: '',
    needScroll: false,
    isSending: false,
    theme: 'system'
  };
}

/**
 * Initialize application state with REST API
 */
export const initializeState = async () => {
  // Start with initial state
  let state = createInitialState();
  state.loading = true;

  try {
    // Load worlds using REST API
    const worldsData = await api.getWorlds();
    state = updateWorlds(state, worldsData);
    state.loading = false;

    // Get persisted world name from localStorage
    const persistedWorldName = localStorage.getItem('selectedWorldName');
    let selectedWorld = null;

    if (persistedWorldName && state.worlds.find(w => w.name === persistedWorldName)) {
      selectedWorld = state.worlds.find(w => w.name === persistedWorldName);
    } else if (state.worlds.length > 0) {
      selectedWorld = state.worlds[0];
    }

    if (selectedWorld) {
      // Use the main selectWorld function instead of internal helper
      state = await selectWorld(state, selectedWorld.name);
    }

    return state;
  } catch (error) {
    console.error('Failed to initialize state:', error);
    return {
      ...state,
      loading: false,
      // Simple error handling - just log and continue
    };
  }
};

// Data Validation Functions

/**
 * Validate if data is a valid World object
 */
export function isValidWorld(data) {
  return data != null &&
    typeof data === 'object' &&
    'id' in data &&
    'name' in data &&
    typeof data.id === 'string' &&
    typeof data.name === 'string';
}

/**
 * Validate if data is a valid Agent object
 */
export function isValidAgent(data) {
  return data != null &&
    typeof data === 'object' &&
    'id' in data &&
    'name' in data &&
    typeof data.id === 'string' &&
    typeof data.name === 'string';
}

/**
 * Validate if data is a valid AgentMessage object
 */
export function isValidMessage(data) {
  return data != null &&
    typeof data === 'object' &&
    'role' in data &&
    'content' in data &&
    typeof data.role === 'string' &&
    typeof data.content === 'string';
}

// World Management Functions

/**
 * Internal helper to set selected world state
 */
function selectWorldState(state, worldId) {
  return {
    ...state,
    selectedWorldId: worldId,
    selectedAgentId: null,
    agents: []
  };
}

/**
 * Update worlds in state with validation
 */
export function updateWorlds(state, worldsData) {
  try {
    const validWorlds = worldsData.filter(isValidWorld);
    return {
      ...state,
      worlds: validWorlds
    };
  } catch (error) {
    console.error('Failed to update worlds:', error);
    return state;
  }
}

/**
 * Select world and load its data (main export for external use)
 */
export const selectWorld = async (state, worldName) => {
  // Find world by name to get ID
  const world = state.worlds.find(w => w.name === worldName);
  if (!world) {
    console.error('World not found:', worldName);
    return state;
  }

  if (world.id === state.selectedWorldId) return state;

  // Save selected world to localStorage
  if (worldName) {
    localStorage.setItem('selectedWorldName', worldName);
  } else {
    localStorage.removeItem('selectedWorldName');
  }

  // Update state with selected world
  let newState = selectWorldState(state, world.id);
  newState = clearMessages(newState);

  if (world.id) {
    try {
      // Get agents for this world using REST API
      const agentsData = await api.getAgents(worldName);
      newState = updateAgents(newState, agentsData);
    } catch (error) {
      console.error('Failed to fetch world data:', error);
      // Simple error handling - just log and continue with empty agents
      newState = updateAgents(newState, []);
    }
  }

  return newState;
};

// Agent Management Functions

/**
 * Update agents in selected world with validation
 */
export function updateAgents(state, agentsData) {
  try {
    const validAgents = agentsData.filter(isValidAgent);
    return {
      ...state,
      agents: validAgents
    };
  } catch (error) {
    console.error('Failed to update agents:', error);
    return state;
  }
}

/**
 * Select an agent by ID
 */
export function selectAgent(state, agentId) {
  try {
    const agent = state.agents.find(a => a.id === agentId);
    if (!agent) {
      console.error('Agent not found:', agentId);
      return state;
    }

    return {
      ...state,
      selectedAgentId: agentId
    };
  } catch (error) {
    console.error('Failed to select agent:', error);
    return state;
  }
}

// Message Management Functions

/**
 * Add a message to the messages list
 */
export function addMessage(state, messageData) {
  try {
    if (!isValidMessage(messageData)) {
      console.error('Invalid message data:', messageData);
      return state;
    }

    return {
      ...state,
      messages: [...state.messages, messageData]
    };
  } catch (error) {
    console.error('Failed to add message:', error);
    return state;
  }
}

/**
 * Clear all messages
 */
export function clearMessages(state) {
  return {
    ...state,
    messages: []
  };
}

// State Management Functions

/**
 * Set agent being edited in modal
 */
export function setEditingAgent(state, agent) {
  try {
    if (agent && !isValidAgent(agent)) {
      console.error('Invalid agent for editing:', agent);
      return state;
    }

    return {
      ...state,
      editingAgent: agent
    };
  } catch (error) {
    console.error('Failed to set editing agent:', error);
    return state;
  }
}

/**
 * Set loading state
 */
export function setLoading(state, loading) {
  return {
    ...state,
    loading: Boolean(loading)
  };
}

/**
 * Set updating state
 */
export function setUpdating(state, updating) {
  return {
    ...state,
    updating: Boolean(updating)
  };
}

// Agent Validation Utilities

/**
 * Agent validation utilities
 */
export const AgentValidation = {
  /**
   * Validates agent data and returns validation result with errors
   */
  validateAgent(agent) {
    const errors = {};
    let isValid = true;

    if (!agent?.name?.trim()) {
      errors.name = 'Agent name is required';
      isValid = false;
    } else if (agent.name.length > 50) {
      errors.name = 'Agent name must be 50 characters or less';
      isValid = false;
    }

    if (agent.systemPrompt && agent.systemPrompt.length > 5000) {
      errors.systemPrompt = 'System prompt must be 5000 characters or less';
      isValid = false;
    }

    if (!agent?.model?.trim()) {
      errors.model = 'Model is required';
      isValid = false;
    }

    return { isValid, errors };
  },

  /**
   * Checks if agent is new (no id)
   */
  isNewAgent(agent) {
    return !agent?.id;
  }
};

// Export all functions for AppRun integration
