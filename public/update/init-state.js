/**
 * Initial State Module - Application state initialization with REST API
 *
 * Features:
 * - Loads available worlds from REST API
 * - No WebSocket connection - uses REST + SSE for all functionality
 * - Auto-selects first available world after loading
 * - Returns theme preference from localStorage without applying it
 * - Uses REST API for all data operations and SSE for chat
 *
 * Implementation:
 * - Function-based module that returns promise-based initialization
 * - Uses REST API for all operations (worlds, agents, chat via SSE)
 * - Pure state initialization without side effects (theme application handled by caller)
 * - Error handling for connection failures with fallback states
 * - REST API for world and agent data loading
 *
 * Recent Changes:
 * - Completely removed WebSocket dependency
 * - Uses only REST API + SSE for all functionality
 * - Simplified connection model without persistent connections
 */

import * as api from '../api.js';
import { selectWorld } from './select-world.js';

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
    loading: true
  };

  try {
    // Load worlds using REST API
    const worlds = await api.getWorlds();
    baseState.worlds = worlds;
    baseState.loading = false;

    // Auto-select first world if available
    const worldName = worlds.length > 0 ? worlds[0].name : null;

    if (worldName) {
      const selectedWorld = worlds[0];
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
