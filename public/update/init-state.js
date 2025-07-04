/**
 * Initial State Module - Application state initialization with REST API for worlds
 *
 * Features:
 * - Establishes WebSocket connection for chat functionality only
 * - Loads available worlds from REST API
 * - Manages connection status and error handling during initialization
 * - Auto-selects first available world after loading
 * - Returns theme preference from localStorage without applying it
 * - Uses REST API for world data, WebSocket only for chat
 *
 * Implementation:
 * - Function-based module that returns promise-based initialization
 * - Uses REST API for CRUD operations (worlds, agents)
 * - WebSocket connection for chat functionality only
 * - Pure state initialization without side effects (theme application handled by caller)
 * - Error handling for connection failures with fallback states
 * - REST API for world and agent data loading
 *
 * Recent Changes:
 * - Updated to use REST API for world loading instead of WebSocket
 * - WebSocket connection maintained for chat functionality only
 * - CRUD operations moved to REST API calls
 * - Improved separation between chat (WebSocket) and data (REST API)
 */

import wsApi from '../ws-api.js';
import * as api from '../api.js';
import { selectWorld } from './select-world.js';

/**
 * Initialize application state with WebSocket connection and world selection
 * @returns {Promise<Object>} Initial application state
 */
export const initializeState = async () => {
  // Get theme preference without applying it
  const theme = localStorage.getItem('theme') || 'system';

  // Base state object
  const baseState = {
    worlds: [],
    theme,
    connectionStatus: 'disconnected',
    messages: [],
    currentMessage: '',
    wsError: null,
    needScroll: false,
    loading: true
  };

  try {
    // Connect to WebSocket for chat functionality
    baseState.connectionStatus = 'connecting';

    // Ensure WebSocket connection is established for chat
    await wsApi.ensureConnection();
    baseState.connectionStatus = 'connected';

    // Load worlds using REST API
    const worlds = await api.getWorlds();
    console.log('🌍 Loaded worlds via REST API:', worlds);
    console.log('🌍 First world structure:', worlds[0]);
    baseState.worlds = worlds;
    baseState.loading = false;

    // Auto-select first world if available
    const worldName = worlds.length > 0 ? worlds[0].name : null;

    if (worldName) {
      const selectedWorld = worlds[0];
      console.log('🌍 Selected world:', selectedWorld);

      const subscriptionResult = await selectWorld(baseState, worldName);
      console.log('🔄 State after selectWorld:', subscriptionResult);
      console.log('🤖 Agents from REST API:', subscriptionResult.agents);

      // Use agents from subscription result (selectWorld now gets them from REST API)
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
