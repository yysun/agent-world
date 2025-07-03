/**
 * Initial State Module - Application state initialization with WebSocket connection
 *
 * Features:
 * - Establishes WebSocket connection before world selection
 * - Loads available worlds from server
 * - Manages connection status and error handling during initialization
 * - Auto-selects first available world after successful connection using world ID
 * - Returns theme preference from localStorage without applying it
 * - Uses world.agents data when available, falls back to selectWorld result
 *
 * Implementation:
 * - Function-based module that returns promise-based initialization
 * - Integrates with wsApi for connection management
 * - Pure state initialization without side effects (theme application handled by caller)
 * - Error handling for connection failures with fallback states
 * - Uses world.id instead of world.name for proper API consistency
 * - Prioritizes world.agents over separate API calls for better consistency
 *
 * Recent Changes:
 * - Extracted from home.js for better separation of concerns
 * - Added WebSocket connection establishment before world selection
 * - Removed theme application dependency - now returns theme preference only
 * - Fixed world selection to use world.id instead of world.name for API calls
 * - Updated to use world.agents instead of empty array initialization for better data consistency
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
    console.log('🌍 Loaded worlds:', worlds);
    console.log('🌍 First world structure:', worlds[0]);
    baseState.worlds = worlds;
    baseState.loading = false;

    // Auto-select first world if available
    const worldName = worlds.length > 0 ? worlds[0].name : null;

    if (worldName) {
      const selectedWorld = worlds[0];
      console.log('🌍 Selected world:', selectedWorld);
      console.log('🤖 World agents from worlds list:', selectedWorld.agents);

      const subscriptionResult = await selectWorld(baseState, worldName);
      console.log('🔄 State after selectWorld:', subscriptionResult);
      console.log('🤖 Agents from subscription:', subscriptionResult.agents);

      // Use agents from subscription result (selectWorld now gets them from subscribeToWorld)
      return subscriptionResult;
    } else {
      return {
        ...baseState,
        agents: [],
        wsError: 'No worlds available'
      };
    }
  } catch (error) {
    console.error('Failed to initialize state:', error);
    return {
      ...baseState,
      agents: [],
      connectionStatus: 'error',
      loading: false,
      wsError: error.message || 'Failed to connect to server'
    };
  }
};
