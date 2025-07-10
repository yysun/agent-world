//@ts-check
/**
 * Home Update Module - Complete home page state management
 *
 * Consolidated module providing:
 * - Input field state management for quick messages
 * - Message sending with generator pattern for loading states
 * - Navigation utilities (scroll, clear messages)
 * - State helper utilities for computed values
 * - UI interaction handlers
 * - Application state initialization and world management
 * - Agent management and validation utilities
 * - Complete state operations for home page functionality
 * 
 * Key Features:
 * - Generator-based async state updates for smooth UI
 * - Comprehensive error handling with user feedback
 * - Auto-scroll functionality for conversation area
 * - State persistence and validation
 * - Single source of truth for home-related operations
 * 
 * TypeScript definitions available in home-update.d.ts
 */

import * as api from '../api.js';
import { sendChatMessage } from '../sse-client.js';

const USER_ID = 'human';

// ============================================================================
// State Initialization
// ============================================================================

/**
 * Create initial application state
 * @returns {import('./home-update').AppState} - Initial state with proper types
 */
export function createInitialState() {
  return /** @type {import('./home-update').AppState} */ ({
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
  });
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

    if (persistedWorldName) {
      // Find the world with the persisted name
      const worlds = /** @type {import('../../core/types').World[]} */ (state.worlds);
      for (const world of worlds) {
        if (world.name === persistedWorldName) {
          selectedWorld = world;
          break;
        }
      }
    }
    
    // Fallback to first world if none found
    if (!selectedWorld && state.worlds.length > 0) {
      const worlds = /** @type {import('../../core/types').World[]} */ (state.worlds);
      selectedWorld = worlds[0];
    }

    // Apply the world selection if found
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

// ============================================================================
// Data Validation Functions
// ============================================================================

/**
 * Validate if data is a valid World object
 */
/**
 * Validate if data is a valid World object
 * @param {any} data - The data to validate
 * @returns {data is import('../../core/types').World} - Type guard for World
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

// ============================================================================
// World Management Functions
// ============================================================================

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
/**
 * Update the worlds in the application state
 * @param {import('./home-update').AppState} state - Current application state
 * @param {any[]} worldsData - Array of world data from API
 * @returns {import('./home-update').AppState} - Updated state with valid worlds
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

// ============================================================================
// Agent Management Functions
// ============================================================================

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

// ============================================================================
// Message Management Functions
// ============================================================================

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

// ============================================================================
// State Management Functions
// ============================================================================

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

// ============================================================================
// Agent Validation Utilities
// ============================================================================

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

// ============================================================================
// Input Handlers
// ============================================================================

/**
 * Handle quick input field changes
 */
export const onQuickInput = (state, e) => ({ ...state, quickMessage: e.target.value });

/**
 * Handle keypress events in quick input field
 */
export const onQuickKeypress = (state, e) => {
  if (e.key === 'Enter') {
    const message = e.target.value.trim();
    e.target.value = '';
    return message ? sendQuickMessage({ ...state, quickMessage: message }) : state;
  }
};

/**
 * Send message with error handling using generator pattern for loading states
 */
export const sendQuickMessage = async function* (state) {
  const message = state.quickMessage?.trim();
  const selectedWorldName = getSelectedWorldName(state);

  if (!message || !selectedWorldName) {
    const errorText = !message ? 'Please enter a message' : 'No world selected';
    const errorMessage = {
      id: Date.now() + Math.random(),
      role: 'system',
      content: errorText,
      createdAt: new Date(),
      sender: 'System'
    };

    return {
      ...state,
      messages: [...state.messages, errorMessage],
      needScroll: true
    };
  }

  const input = document.getElementById('quick-input');
  if (input instanceof HTMLInputElement) {
    input.value = '';
  }

  // Add user message immediately and show sending state
  const userMessage = {
    id: Date.now() + Math.random(),
    role: 'user',
    text: message,
    createdAt: new Date(),
    sender: USER_ID,
    sending: true
  };

  // Yield initial state with user message and sending indicator
  yield {
    ...state,
    messages: [...state.messages, userMessage],
    quickMessage: '',
    needScroll: true,
    isSending: true
  };

  try {
    await sendChatMessage(selectedWorldName, message, USER_ID);

    // Return final state with sending completed
    return {
      ...state,
      messages: [...state.messages, { ...userMessage, sending: false }],
      quickMessage: '',
      needScroll: true,
      isSending: false
    };
  } catch (error) {
    console.error('Failed to send message:', error);
    const errorMessage = {
      id: Date.now() + Math.random(),
      role: 'system',
      content: 'Failed to send message: ' + error.message,
      createdAt: new Date(),
      sender: 'System'
    };

    return {
      ...state,
      messages: [...state.messages, { ...userMessage, sending: false }, errorMessage],
      quickMessage: '',
      needScroll: true,
      isSending: false
    };
  }
};

// ============================================================================
// Navigation Utilities
// ============================================================================

/**
 * Scroll to top of page
 */
export const scrollToTop = (state) => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
  return state;
};

/**
 * Auto-scroll to bottom after DOM updates
 */
export const scrollToBottom = (state) => {
  if (state?.needScroll) {
    requestAnimationFrame(() => {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
      state.needScroll = false;
    });
  }
};

// ============================================================================
// State Helper Utilities
// ============================================================================

/**
 * Get selected world name from state structure
 */
export const getSelectedWorldName = (state) => {
  if (!state.selectedWorldId) return null;
  const world = state.worlds.find(w => w.id === state.selectedWorldId);
  return world ? world.name : null;
};

// Export all functions for AppRun integration
