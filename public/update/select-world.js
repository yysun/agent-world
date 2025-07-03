/**
 * World Selection Event Handlers
 *
 * Features:
 * - World subscription management with WebSocket integration
 * - Automatic agent loading per world
 * - Connection state management during world switches
 * - Message clearing on world change
 */

import wsApi from '../ws-api.js';

export const selectWorld = async (state, worldName) => {
  if (worldName === state.worldName) return state;

  // Unsubscribe from previous world if connected
  if (state.worldName && wsApi.isConnected()) {
    wsApi.unsubscribeFromWorld();
  }

  const newState = {
    ...state,
    worldName,
    messages: [],
    connectionStatus: wsApi.isConnected() ? 'connected' : 'disconnected'
  };

  if (worldName) {
    if (wsApi.isConnected()) {
      try {
        newState.connectionStatus = 'connected';

        // Subscribe to world and get world data with agents
        const worldData = await wsApi.subscribeToWorld(worldName);
        console.log('🌍 Subscription result for', worldName, ':', worldData);

        // Extract agents from subscription response
        const agents = worldData?.agents || [];
        console.log('🤖 Agents from subscription for', worldName, ':', agents);
        return { ...newState, agents };
      } catch (error) {
        console.error('Failed to subscribe or get agents:', error);
        return { ...newState, agents: [], wsError: error.message };
      }
    } else {
      newState.connectionStatus = 'connecting';
      setTimeout(() => {
        wsApi.connect();
      }, 100);
      return { ...newState, agents: [] };
    }
  }

  return { ...newState, agents: [] };
};
