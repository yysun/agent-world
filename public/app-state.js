//@ts-check
/**
 * Unified Application State - Type-safe state management using core types
 * 
 * Features:
 * - Single source of truth for application state
 * - Direct use of core types from agent-world.d.ts
 * - Simple error handling with basic validation
 * - TypeScript checking via //@ts-check directive
 * 
 * State Structure:
 * - worlds: Available worlds list
 * - selectedWorldId: Currently selected world ID
 * - agents: Agents in selected world
 * - selectedAgentId: Currently selected agent ID
 * - messages: Chat messages
 * - editingAgent: Agent being edited in modal
 * - loading: General loading state
 * - updating: Update operation in progress
 */

// Import core types from agent-world module declarations
/** @typedef {import('core/types').World} World */
/** @typedef {import('core/types').Agent} Agent */
/** @typedef {import('core/types').AgentMessage} AgentMessage */

/**
 * @typedef {Object} AppState
 * @property {World[]} worlds - Available worlds
 * @property {string | null} selectedWorldId - Currently selected world ID
 * @property {Agent[]} agents - Agents in selected world
 * @property {string | null} selectedAgentId - Currently selected agent ID
 * @property {AgentMessage[]} messages - Chat messages
 * @property {Agent | null} editingAgent - Agent being edited in modal
 * @property {boolean} loading - General loading state
 * @property {boolean} updating - Update operation in progress
 * @property {string} quickMessage - Current input message
 * @property {boolean} needScroll - Auto-scroll trigger
 * @property {boolean} isSending - Sending message state
 * @property {string} theme - Current theme
 */

/**
 * Create initial application state
 * @returns {AppState}
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
 * Validate if data is a valid World object
 * @param {unknown} data
 * @returns {data is World}
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
 * @param {unknown} data
 * @returns {data is Agent}
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
 * @param {unknown} data
 * @returns {data is AgentMessage}
 */
export function isValidMessage(data) {
  return data != null &&
    typeof data === 'object' &&
    'role' in data &&
    'content' in data &&
    typeof data.role === 'string' &&
    typeof data.content === 'string';
}

/**
 * Update worlds in state with validation
 * @param {AppState} state
 * @param {unknown[]} worldsData
 * @returns {AppState}
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
 * Select a world by ID
 * @param {AppState} state
 * @param {string} worldId
 * @returns {AppState}
 */
export function selectWorld(state, worldId) {
  try {
    const world = state.worlds.find(w => w.id === worldId);
    if (!world) {
      console.error('World not found:', worldId);
      return state;
    }

    return {
      ...state,
      selectedWorldId: worldId,
      agents: [], // Clear agents when switching worlds
      selectedAgentId: null,
      editingAgent: null
    };
  } catch (error) {
    console.error('Failed to select world:', error);
    return state;
  }
}

/**
 * Update agents in selected world with validation
 * @param {AppState} state
 * @param {unknown[]} agentsData
 * @returns {AppState}
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
 * @param {AppState} state
 * @param {string} agentId
 * @returns {AppState}
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

/**
 * Add a message to the messages list
 * @param {AppState} state
 * @param {unknown} messageData
 * @returns {AppState}
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
 * @param {AppState} state
 * @returns {AppState}
 */
export function clearMessages(state) {
  return {
    ...state,
    messages: []
  };
}

/**
 * Set agent being edited in modal
 * @param {AppState} state
 * @param {Agent | null} agent
 * @returns {AppState}
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
 * @param {AppState} state
 * @param {boolean} loading
 * @returns {AppState}
 */
export function setLoading(state, loading) {
  return {
    ...state,
    loading: Boolean(loading)
  };
}

/**
 * Set updating state
 * @param {AppState} state
 * @param {boolean} updating
 * @returns {AppState}
 */
export function setUpdating(state, updating) {
  return {
    ...state,
    updating: Boolean(updating)
  };
}

/**
 * Agent validation utilities
 */
export const AgentValidation = {
  /**
   * Validates agent data
   * @param {Agent} agent - agent to validate
   * @returns {{isValid: boolean, errors: Object}} validation result
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
   * @param {Agent} agent - agent to check
   * @returns {boolean} true if agent is new
   */
  isNewAgent(agent) {
    return !agent?.id;
  }
};
