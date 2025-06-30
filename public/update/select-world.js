/**
 * World Selection Event Handlers
 *
 * Features:
 * - World subscription management with WebSocket integration
 * - Automatic agent loading per world
 * - Connection state management during world switches
 * - Message clearing on world change
 */

import * as api from '../api.js';
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
      newState.connectionStatus = 'connected';
      wsApi.subscribeToWorld(worldName);
    } else {
      newState.connectionStatus = 'connecting';
      setTimeout(() => {
        wsApi.connect();
      }, 100);
    }
  }

  const agents = await api.getAgents(worldName);
  return { ...newState, agents };
};
