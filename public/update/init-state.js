/**
 * Initial State Module - Application state initialization with WebSocket connection
 *
 * Features:
 * - Establishes WebSocket connection before world selection
 * - Loads available worlds from server
 * - Manages connection status and error handling during initialization
 * - Auto-selects first available world after successful connection using world ID
 * - Returns theme preference from localStorage without applying it
 *
 * Implementation:
 * - Function-based module that returns promise-based initialization
 * - Integrates with wsApi for connection management
 * - Pure state initialization without side effects (theme application handled by caller)
 * - Error handling for connection failures with fallback states
 * - Uses world.id instead of world.name for proper API consistency
 *
 * Recent Changes:
 * - Extracted from home.js for better separation of concerns
 * - Added WebSocket connection establishment before world selection
 * - Removed theme application dependency - now returns theme preference only
 * - Fixed world selection to use world.id instead of world.name for API calls
 */

import wsApi from '../ws-api.js';
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
    // Connect to WebSocket first
    baseState.connectionStatus = 'connecting';

    // Ensure connection is established
    await wsApi.ensureConnection();
    baseState.connectionStatus = 'connected';

    // Load worlds after connection is established
    const worlds = await wsApi.getWorlds();
    baseState.worlds = worlds;
    baseState.loading = false;

    // Auto-select first world if available
    const worldName = worlds.length > 0 ? worlds[0].name : null;

    if (worldName) {
      return selectWorld(baseState, worldName);
    } else {
      return {
        ...baseState,
        wsError: 'No worlds available'
      };
    }
  } catch (error) {
    console.error('Failed to initialize state:', error);
    return {
      ...baseState,
      connectionStatus: 'error',
      loading: false,
      wsError: error.message || 'Failed to connect to server'
    };
  }
};
