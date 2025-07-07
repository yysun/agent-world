/**
 * Initial State Module - Application state initialization with REST API
 *
 * Features:
 * - Loads available worlds from REST API
 * - No WebSocket connection - uses REST + SSE for all functionality
 * - Auto-selects persisted world from localStorage or first available world
 * - Returns theme preference from localStorage without applying it
 * - Uses REST API for all data operations and SSE for chat
 * - World persistence for better user experience across sessions
 *
 * Implementation:
 * - Function-based module that returns promise-based initialization
 * - Uses REST API for all operations (worlds, agents, chat via SSE)
 * - Pure state initialization without side effects (theme application handled by caller)
 * - Error handling for connection failures with fallback states
 * - REST API for world and agent data loading
 * - localStorage integration for world selection persistence
 *
 * Recent Changes:
 * - Completely removed WebSocket dependency
 * - Uses only REST API + SSE for all functionality
 * - Simplified connection model without persistent connections
 * - Added world persistence using localStorage
 */

import * as api from '../api.js';
import { selectWorld } from './select-world.js';
import { createInitialModalState } from '../utils/agent-modal-state.js';

/**
 * Initialize application state with REST API
 * @returns {Promise<Object>} Initial application state
 */
export const initializeState = async () => {
  // Get theme preference without applying it
  const theme = localStorage.getItem('theme') || 'system';

  // Base state object
  const baseState = {
    worlds: [],
    theme,
    connectionStatus: 'connected', // REST API is always "connected"
    messages: [],
    currentMessage: '',
    wsError: null,
    needScroll: false,
    loading: true,
    agentModal: createInitialModalState() // Unified modal state
  };

  try {
    // Load worlds using REST API
    const worlds = await api.getWorlds();
    baseState.worlds = worlds;
    baseState.loading = false;

    // Get persisted world name from localStorage, fallback to first available world
    const persistedWorldName = localStorage.getItem('selectedWorldName');
    let worldName = null;

    if (persistedWorldName && worlds.find(w => w.name === persistedWorldName)) {
      // Use persisted world if it still exists
      worldName = persistedWorldName;
    } else if (worlds.length > 0) {
      // Fallback to first world
      worldName = worlds[0].name;
    }

    if (worldName) {
      const subscriptionResult = await selectWorld(baseState, worldName);
      return subscriptionResult;
    } else {
      return {
        ...baseState,
        agents: [],
        error: 'No worlds available'
      };
    }
  } catch (error) {
    console.error('Failed to initialize state:', error);
    return {
      ...baseState,
      agents: [],
      connectionStatus: 'error',
      loading: false,
      error: error.message || 'Failed to connect to server'
    };
  }
};
