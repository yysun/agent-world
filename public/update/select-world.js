/**
 * World Selection Event Handlers
 *
 * Features:
 * - World data fetching with REST API integration  
 * - Automatic agent loading per world
 * - Connection state management for chat functionality only
 * - Message clearing on world change
 * - WebSocket used only for chat, CRUD operations use REST API
 */

import wsApi from '../ws-api.js';
import * as api from '../api.js';

export const selectWorld = async (state, worldName) => {
  if (worldName === state.worldName) return state;

  // Unsubscribe from previous world if connected (for chat functionality)
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
    try {
      // Get world data and agents using REST API
      console.log('🌍 Fetching world data for', worldName);
      const agents = await api.getAgents(worldName);
      console.log('🤖 Agents from REST API for', worldName, ':', agents);

      // Subscribe to world for chat functionality only (if connected)
      if (wsApi.isConnected()) {
        newState.connectionStatus = 'connected';
        try {
          // Subscribe for chat events only, ignore the returned data since we already have it from REST
          await wsApi.subscribeToWorld(worldName);
          console.log('🔗 Subscribed to world for chat functionality:', worldName);
        } catch (wsError) {
          console.warn('WebSocket subscription failed, chat may not work:', wsError);
          // Don't fail the world selection if WebSocket subscription fails
        }
      } else {
        newState.connectionStatus = 'connecting';
        setTimeout(() => {
          wsApi.connect();
        }, 100);
      }

      return { ...newState, agents };
    } catch (error) {
      console.error('Failed to fetch world data:', error);
      return { ...newState, agents: [], error: error.message };
    }
  }

  return { ...newState, agents: [] };
};
